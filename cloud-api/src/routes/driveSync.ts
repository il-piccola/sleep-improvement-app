import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  createIngestBatchDocument,
  FirestoreSaveError,
  getDefaultUserId,
  saveIngestBatch,
  updateIngestBatchResult,
} from '../lib/batches.js'
import {
  downloadDriveJsonFile,
  getDriveFolderId,
  getDriveSyncMaxFiles,
  listHealthAutoExportJsonFiles,
} from '../lib/drive.js'
import { normalizeHealthAutoExportJson } from '../lib/healthAutoExport.js'
import {
  ProcessedDriveFileError,
  saveProcessedDriveFile,
  shouldProcessDriveFile,
} from '../lib/processedDriveFiles.js'
import { DriveSyncRunSaveError, saveDriveSyncRun } from '../lib/driveSyncRuns.js'
import {
  auditHealthAutoExportMetrics,
  mergeMetricAuditSummaries,
} from '../lib/healthMetricsAudit.js'
import {
  aggregateHealthAutoExportMetrics,
  getHealthMetricTargetMetrics,
} from '../lib/healthMetricAggregator.js'
import {
  HealthMetricRecordSaveError,
  saveHealthMetricRecords,
} from '../lib/healthMetricRecords.js'
import {
  MetricAuditSummarySaveError,
  saveMetricAuditSummary,
} from '../lib/metricAuditSummaries.js'
import {
  aggregateSleepWindowMetrics,
  getSleepWindowMetricTargetMetrics,
} from '../lib/sleepWindowMetricAggregator.js'
import {
  getConfiguredSleepDayBoundaryHour,
  parseSleepDayBoundaryHour,
} from '../lib/sleepDayBoundary.js'
import { isAuthorized, sendJson, sendSafeError } from '../lib/security.js'
import { saveSleepRecords, SleepRecordSaveError } from '../lib/sleepRecords.js'
import type { HealthMetricAuditSummary } from '../types/healthMetrics.js'

type DriveSyncFileResult = {
  fileId: string
  fileName: string
  status: 'processed' | 'failed' | 'skipped'
  batchId?: string
  addedCount: number
  skippedDuplicateCount: number
  warningCount: number
  rejectedRows: number
  errorSummary?: string
  metricAudit?: HealthMetricAuditSummary
  healthMetricSavedRecordCount: number
  healthMetricUpdatedRecordCount: number
  healthMetricSkippedMetricCount: number
  healthMetricRejectedRowCount: number
  healthMetricBackfill: boolean
  sleepWindowMetricSavedRecordCount: number
  sleepWindowMetricUpdatedRecordCount: number
  sleepWindowMetricSkippedMetricCount: number
  sleepWindowMetricRejectedRowCount: number
  sleepWindowMetricBackfill: boolean
}

type DriveSyncOptions = {
  auditProcessedMetrics: boolean
  auditProcessedMetricsLimit: number
  backfillHealthMetrics: boolean
  backfillHealthMetricsLimit: number
  backfillSleepWindowMetrics: boolean
  backfillSleepWindowMetricsLimit: number
  boundaryHour: number
  metricStructureAudit: boolean
}

const DEFAULT_AUDIT_PROCESSED_METRICS_LIMIT = 10
const MAX_AUDIT_PROCESSED_METRICS_LIMIT = 20
const DEFAULT_BACKFILL_HEALTH_METRICS_LIMIT = 10
const MAX_BACKFILL_HEALTH_METRICS_LIMIT = 20
const DEFAULT_BACKFILL_SLEEP_WINDOW_METRICS_LIMIT = 10
const MAX_BACKFILL_SLEEP_WINDOW_METRICS_LIMIT = 20

export async function handleDriveSync(
  request: IncomingMessage,
  url: URL,
  response: ServerResponse,
  token: string | undefined,
): Promise<void> {
  const expectedToken = process.env.DRIVE_SYNC_API_TOKEN?.trim() || token

  if (!isAuthorized(request, expectedToken)) {
    sendSafeError(response, 401, 'Unauthorized')
    return
  }

  if (request.method !== 'POST') {
    sendSafeError(response, 405, 'Method not allowed')
    return
  }

  const folderId = getDriveFolderId()

  if (!folderId) {
    sendSafeError(response, 500, 'HEALTH_EXPORT_DRIVE_FOLDER_ID が設定されていません。')
    return
  }

  try {
    const runId = randomUUID()
    const startedAt = new Date().toISOString()
    const userId = getDefaultUserId()
    const maxFiles = getDriveSyncMaxFiles()
    const options = parseDriveSyncOptions(url)
    const listedFiles = await listHealthAutoExportJsonFiles(folderId)
    const files = maxFiles ? listedFiles.slice(0, maxFiles) : listedFiles
    const results: DriveSyncFileResult[] = []
    let auditedSkippedProcessedFiles = 0
    let backfilledHealthMetricFiles = 0
    let backfilledSleepWindowMetricFiles = 0

    for (const file of files) {
      const shouldProcess = await shouldProcessDriveFile(userId, file)

      if (!shouldProcess) {
        const shouldAuditSkippedFile =
          options.auditProcessedMetrics &&
          auditedSkippedProcessedFiles < options.auditProcessedMetricsLimit
        const shouldBackfillHealthMetrics =
          options.backfillHealthMetrics &&
          backfilledHealthMetricFiles < options.backfillHealthMetricsLimit
        const shouldBackfillSleepWindowMetrics =
          options.backfillSleepWindowMetrics &&
          backfilledSleepWindowMetricFiles < options.backfillSleepWindowMetricsLimit
        const metricAudit = shouldAuditSkippedFile
          ? await auditProcessedDriveFile(file, options)
          : undefined
        const backfillSave =
          shouldBackfillHealthMetrics || shouldBackfillSleepWindowMetrics
            ? await backfillProcessedDriveFileMetrics({
                boundaryHour: options.boundaryHour,
                file,
                runId,
                shouldBackfillHealthMetrics,
                shouldBackfillSleepWindowMetrics,
                userId,
              })
            : {
                ...emptyHealthMetricSaveResult(false),
                ...emptySleepWindowMetricSaveResult(false),
              }

        if (shouldAuditSkippedFile) {
          auditedSkippedProcessedFiles += 1
        }

        if (shouldBackfillHealthMetrics) {
          backfilledHealthMetricFiles += 1
        }

        if (shouldBackfillSleepWindowMetrics) {
          backfilledSleepWindowMetricFiles += 1
        }

        results.push({
          fileId: file.fileId,
          fileName: file.fileName,
          status: 'skipped',
          addedCount: 0,
          skippedDuplicateCount: 0,
          warningCount: 0,
          rejectedRows: 0,
          ...(metricAudit ? { metricAudit } : {}),
          ...backfillSave,
        })
        continue
      }

      results.push(await processDriveFile(userId, file, options, runId))
    }

    const processedFiles = results.filter((result) => result.status === 'processed').length
    const skippedAlreadyProcessed = results.filter((result) => result.status === 'skipped').length
    const failedFiles = results.filter((result) => result.status === 'failed').length
    const addedCount = results.reduce((sum, result) => sum + result.addedCount, 0)
    const skippedDuplicateCount = results.reduce(
      (sum, result) => sum + result.skippedDuplicateCount,
      0,
    )
    const warningCount = results.reduce((sum, result) => sum + result.warningCount, 0)
    const rejectedRows = results.reduce((sum, result) => sum + result.rejectedRows, 0)
    const healthMetricSavedRecordCount = results.reduce(
      (sum, result) => sum + result.healthMetricSavedRecordCount,
      0,
    )
    const healthMetricUpdatedRecordCount = results.reduce(
      (sum, result) => sum + result.healthMetricUpdatedRecordCount,
      0,
    )
    const healthMetricSkippedMetricCount = results.reduce(
      (sum, result) => sum + result.healthMetricSkippedMetricCount,
      0,
    )
    const healthMetricRejectedRowCount = results.reduce(
      (sum, result) => sum + result.healthMetricRejectedRowCount,
      0,
    )
    const healthMetricBackfillFileCount = results.filter(
      (result) => result.healthMetricBackfill,
    ).length
    const sleepWindowMetricSavedRecordCount = results.reduce(
      (sum, result) => sum + result.sleepWindowMetricSavedRecordCount,
      0,
    )
    const sleepWindowMetricUpdatedRecordCount = results.reduce(
      (sum, result) => sum + result.sleepWindowMetricUpdatedRecordCount,
      0,
    )
    const sleepWindowMetricSkippedMetricCount = results.reduce(
      (sum, result) => sum + result.sleepWindowMetricSkippedMetricCount,
      0,
    )
    const sleepWindowMetricRejectedRowCount = results.reduce(
      (sum, result) => sum + result.sleepWindowMetricRejectedRowCount,
      0,
    )
    const sleepWindowMetricBackfillFileCount = results.filter(
      (result) => result.sleepWindowMetricBackfill,
    ).length
    const metricAuditAuditedFileCount = results.filter((result) => result.metricAudit).length
    const metricAuditProcessedFileCount = results.filter(
      (result) => result.status === 'processed' && result.metricAudit,
    ).length
    const metricAuditSkippedProcessedFileCount = results.filter(
      (result) => result.status === 'skipped' && result.metricAudit,
    ).length
    const metricAuditSummaries = results
      .map((result) => result.metricAudit)
      .filter((summary): summary is HealthMetricAuditSummary => Boolean(summary))
    const metricAudit = mergeMetricAuditSummaries(metricAuditSummaries)
    const metricAuditSummaryRef =
      metricAuditAuditedFileCount > 0
        ? await saveMetricAuditSummary({
            runId,
            summary: metricAudit,
            userId,
          })
        : undefined

    await saveDriveSyncRun({
      runId,
      userId,
      startedAt,
      completedAt: new Date().toISOString(),
      status: failedFiles > 0 || warningCount > 0 ? 'completed_with_warnings' : 'completed',
      listedFileCount: listedFiles.length,
      checkedFiles: files.length,
      processedFiles,
      skippedAlreadyProcessed,
      failedFiles,
      addedCount,
      skippedDuplicateCount,
      warningCount,
      rejectedRows,
      metricAuditStatus: metricAudit.status,
      metricAuditMetricCount: metricAudit.metricCount,
      metricAuditWarningCount: metricAudit.warningCount,
      ...(metricAuditSummaryRef ? { metricAuditSummaryRef } : {}),
      metricAuditAuditedFileCount,
      metricAuditProcessedFileCount,
      metricAuditSkippedProcessedFileCount,
      healthMetricSaveStatus:
        healthMetricRejectedRowCount > 0 ? 'completed_with_warnings' : 'completed',
      healthMetricSavedRecordCount,
      healthMetricUpdatedRecordCount,
      healthMetricSkippedMetricCount,
      healthMetricRejectedRowCount,
      healthMetricTargetMetrics: getHealthMetricTargetMetrics(),
      healthMetricBackfillFileCount,
      sleepWindowMetricSaveStatus:
        sleepWindowMetricRejectedRowCount > 0 ? 'completed_with_warnings' : 'completed',
      sleepWindowMetricSavedRecordCount,
      sleepWindowMetricUpdatedRecordCount,
      sleepWindowMetricSkippedMetricCount,
      sleepWindowMetricRejectedRowCount,
      sleepWindowMetricTargetMetrics: getSleepWindowMetricTargetMetrics(),
      sleepWindowMetricBackfillFileCount,
      sleepDayBoundaryHour: options.boundaryHour,
    })

    sendJson(response, 200, {
      ok: true,
      sleepDayBoundaryHour: options.boundaryHour,
      folderId,
      checkedFiles: files.length,
      listedFileCount: listedFiles.length,
      scannedFileCount: files.length,
      maxFiles,
      processedFiles,
      skippedAlreadyProcessed,
      failedFiles,
      processedFileCount: processedFiles,
      skippedFileCount: skippedAlreadyProcessed,
      failedFileCount: failedFiles,
      addedCount,
      skippedDuplicateCount,
      warningCount,
      rejectedRows,
      metricAudit: {
        status: metricAudit.status,
        metricCount: metricAudit.metricCount,
        nonSleepMetricCount: metricAudit.nonSleepMetricCount,
        warningCount: metricAudit.warningCount,
        rejectedRowCount: metricAudit.rejectedRowCount,
        summaryRef: metricAuditSummaryRef ?? null,
        auditedFileCount: metricAuditAuditedFileCount,
        processedFileCount: metricAuditProcessedFileCount,
        skippedProcessedFileCount: metricAuditSkippedProcessedFileCount,
      },
      healthMetrics: {
        status: healthMetricRejectedRowCount > 0 ? 'completed_with_warnings' : 'completed',
        savedRecordCount: healthMetricSavedRecordCount,
        updatedRecordCount: healthMetricUpdatedRecordCount,
        skippedMetricCount: healthMetricSkippedMetricCount,
        rejectedRowCount: healthMetricRejectedRowCount,
        targetMetrics: getHealthMetricTargetMetrics(),
        backfillFileCount: healthMetricBackfillFileCount,
      },
      sleepWindowMetrics: {
        status: sleepWindowMetricRejectedRowCount > 0 ? 'completed_with_warnings' : 'completed',
        boundaryHour: options.boundaryHour,
        savedRecordCount: sleepWindowMetricSavedRecordCount,
        updatedRecordCount: sleepWindowMetricUpdatedRecordCount,
        skippedMetricCount: sleepWindowMetricSkippedMetricCount,
        rejectedRowCount: sleepWindowMetricRejectedRowCount,
        targetMetrics: getSleepWindowMetricTargetMetrics(),
        backfillFileCount: sleepWindowMetricBackfillFileCount,
      },
      files: results.map((result) => ({
        fileId: result.fileId,
        fileName: result.fileName,
        status: result.status,
        batchId: result.batchId,
        addedCount: result.addedCount,
        skippedDuplicateCount: result.skippedDuplicateCount,
        warningCount: result.warningCount,
        rejectedRows: result.rejectedRows,
        errorSummary: result.errorSummary,
        healthMetricBackfill: result.healthMetricBackfill,
        healthMetricSavedRecordCount: result.healthMetricSavedRecordCount,
        healthMetricUpdatedRecordCount: result.healthMetricUpdatedRecordCount,
        sleepWindowMetricBackfill: result.sleepWindowMetricBackfill,
        sleepWindowMetricSavedRecordCount: result.sleepWindowMetricSavedRecordCount,
        sleepWindowMetricUpdatedRecordCount: result.sleepWindowMetricUpdatedRecordCount,
      })),
    })
  } catch (error) {
    if (
      error instanceof FirestoreSaveError ||
      error instanceof SleepRecordSaveError ||
      error instanceof ProcessedDriveFileError ||
      error instanceof DriveSyncRunSaveError ||
      error instanceof MetricAuditSummarySaveError ||
      error instanceof HealthMetricRecordSaveError
    ) {
      sendSafeError(response, 500, error.message)
      return
    }

    const message =
      error instanceof Error
        ? error.message
        : 'Google DriveからHealth Auto Export JSONを同期できませんでした。'
    sendSafeError(response, 500, message)
  }
}

export function parseDriveSyncOptions(url: URL): DriveSyncOptions {
  const boundaryHour = parseSleepDayBoundaryHour(url.searchParams.get('boundaryHour'))
  const auditProcessedMetrics = isEnabled(url.searchParams.get('auditProcessedMetrics'))
  const backfillHealthMetrics = isEnabled(url.searchParams.get('backfillHealthMetrics'))
  const backfillSleepWindowMetrics = isEnabled(
    url.searchParams.get('backfillSleepWindowMetrics'),
  )
  const metricStructureAudit = isEnabled(url.searchParams.get('metricStructureAudit'))
  const auditProcessedMetricsLimit = parseLimitedInteger(
    url.searchParams.get('auditProcessedMetricsLimit'),
    DEFAULT_AUDIT_PROCESSED_METRICS_LIMIT,
    MAX_AUDIT_PROCESSED_METRICS_LIMIT,
  )
  const backfillHealthMetricsLimit = parseLimitedInteger(
    url.searchParams.get('backfillHealthMetricsLimit'),
    DEFAULT_BACKFILL_HEALTH_METRICS_LIMIT,
    MAX_BACKFILL_HEALTH_METRICS_LIMIT,
  )
  const backfillSleepWindowMetricsLimit = parseLimitedInteger(
    url.searchParams.get('backfillSleepWindowMetricsLimit'),
    DEFAULT_BACKFILL_SLEEP_WINDOW_METRICS_LIMIT,
    MAX_BACKFILL_SLEEP_WINDOW_METRICS_LIMIT,
  )

  return {
    auditProcessedMetrics,
    auditProcessedMetricsLimit,
    backfillHealthMetrics,
    backfillHealthMetricsLimit,
    backfillSleepWindowMetrics,
    backfillSleepWindowMetricsLimit,
    boundaryHour,
    metricStructureAudit,
  }
}

function parseLimitedInteger(value: string | null, defaultValue: number, maxValue: number): number {
  const parsedLimit = Number(value)

  return Number.isInteger(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, maxValue)
    : defaultValue
}

function isEnabled(value: string | null): boolean {
  return value === 'true' || value === '1'
}

async function auditProcessedDriveFile(
  file: Awaited<ReturnType<typeof listHealthAutoExportJsonFiles>>[number],
  options: DriveSyncOptions,
): Promise<HealthMetricAuditSummary> {
  const downloaded = await downloadDriveJsonFile(file)
  return auditHealthAutoExportMetrics(downloaded.value, {
    includeStructure: options.metricStructureAudit,
  })
}

async function backfillProcessedDriveFileMetrics({
  boundaryHour,
  file,
  runId,
  shouldBackfillHealthMetrics,
  shouldBackfillSleepWindowMetrics,
  userId,
}: {
  boundaryHour: number
  file: Awaited<ReturnType<typeof listHealthAutoExportJsonFiles>>[number]
  runId: string
  shouldBackfillHealthMetrics: boolean
  shouldBackfillSleepWindowMetrics: boolean
  userId: string
}): Promise<
  Pick<
    DriveSyncFileResult,
    | 'healthMetricBackfill'
    | 'healthMetricRejectedRowCount'
    | 'healthMetricSavedRecordCount'
    | 'healthMetricSkippedMetricCount'
    | 'healthMetricUpdatedRecordCount'
    | 'sleepWindowMetricBackfill'
    | 'sleepWindowMetricRejectedRowCount'
    | 'sleepWindowMetricSavedRecordCount'
    | 'sleepWindowMetricSkippedMetricCount'
    | 'sleepWindowMetricUpdatedRecordCount'
  >
> {
  const downloaded = await downloadDriveJsonFile(file)
  const healthMetrics = shouldBackfillHealthMetrics
    ? await saveAggregatedHealthMetrics({ downloaded, isBackfill: true, runId, userId })
    : emptyHealthMetricSaveResult(false)
  const sleepWindowMetrics = shouldBackfillSleepWindowMetrics
    ? await saveAggregatedSleepWindowMetrics({
        boundaryHour,
        downloaded,
        isBackfill: true,
        runId,
        userId,
      })
    : emptySleepWindowMetricSaveResult(false)

  return {
    ...healthMetrics,
    ...sleepWindowMetrics,
  }
}

async function processDriveFile(
  userId: string,
  file: Awaited<ReturnType<typeof listHealthAutoExportJsonFiles>>[number],
  options: DriveSyncOptions,
  runId: string,
): Promise<DriveSyncFileResult> {
  try {
    const downloaded = await downloadDriveJsonFile(file)
    const batchId = randomUUID()
    const metricAudit = auditHealthAutoExportMetrics(downloaded.value, {
      includeStructure: options.metricStructureAudit,
    })
    const receivedAt = new Date().toISOString()
    const batch = createIngestBatchDocument({
      batchId,
      receivedAt,
      requestSizeBytes: downloaded.byteLength,
      source: 'health_auto_export_drive',
      userId,
    })

    await saveIngestBatch(batch)

    const normalized = normalizeHealthAutoExportJson({
      batchId,
      input: downloaded.value,
      sourceFile: downloaded.fileName,
      userId,
    })
    const aggregatedHealthMetrics = await saveAggregatedHealthMetrics({ downloaded, runId, userId })
    const aggregatedSleepWindowMetrics = await saveAggregatedSleepWindowMetrics({
      boundaryHour: options.boundaryHour,
      downloaded,
      runId,
      sleepRecords: normalized.records,
      userId,
    })
    const saved = await saveSleepRecords(normalized.records)
    const warningCount = normalized.warnings.length
    const status = warningCount > 0 ? 'completed_with_warnings' : 'completed'

    await updateIngestBatchResult({
      addedCount: saved.addedCount,
      batchId,
      skippedDuplicateCount: saved.skippedDuplicateCount,
      status,
      userId,
      warningCount,
    })
    await saveProcessedDriveFile({
      addedCount: saved.addedCount,
      batchId,
      file: downloaded,
      skippedDuplicateCount: saved.skippedDuplicateCount,
      status: 'processed',
      userId,
      warningCount,
    })

    return {
      fileId: downloaded.fileId,
      fileName: downloaded.fileName,
      status: 'processed',
      batchId,
      addedCount: saved.addedCount,
      skippedDuplicateCount: saved.skippedDuplicateCount,
      warningCount,
      rejectedRows: normalized.rejectedRows,
      metricAudit,
      ...aggregatedHealthMetrics,
      ...aggregatedSleepWindowMetrics,
    }
  } catch (error) {
    const errorSummary =
      error instanceof Error ? error.message : 'Google Driveファイルの処理に失敗しました。'

    await saveProcessedDriveFile({
      addedCount: 0,
      errorSummary,
      file,
      skippedDuplicateCount: 0,
      status: 'failed',
      userId,
      warningCount: 1,
    })

    return {
      fileId: file.fileId,
      fileName: file.fileName,
      status: 'failed',
      addedCount: 0,
      skippedDuplicateCount: 0,
      warningCount: 1,
      rejectedRows: 0,
      errorSummary,
      ...emptyHealthMetricSaveResult(false),
      ...emptySleepWindowMetricSaveResult(false),
    }
  }
}

async function saveAggregatedHealthMetrics({
  downloaded,
  isBackfill = false,
  runId,
  userId,
}: {
  downloaded: Awaited<ReturnType<typeof downloadDriveJsonFile>>
  isBackfill?: boolean
  runId: string
  userId: string
}): Promise<ReturnType<typeof emptyHealthMetricSaveResult>> {
  const aggregated = aggregateHealthAutoExportMetrics({
    input: downloaded.value,
    runId,
    sourceFile: downloaded.fileName,
    userId,
  })
  const saved = await saveHealthMetricRecords(aggregated.records)

  return {
    healthMetricBackfill: isBackfill,
    healthMetricRejectedRowCount: aggregated.rejectedRowCount,
    healthMetricSavedRecordCount: saved.savedRecordCount,
    healthMetricSkippedMetricCount: aggregated.skippedMetricCount,
    healthMetricUpdatedRecordCount: saved.updatedRecordCount,
  }
}

async function saveAggregatedSleepWindowMetrics({
  boundaryHour = getConfiguredSleepDayBoundaryHour(),
  downloaded,
  isBackfill = false,
  runId,
  sleepRecords,
  userId,
}: {
  boundaryHour?: number
  downloaded: Awaited<ReturnType<typeof downloadDriveJsonFile>>
  isBackfill?: boolean
  runId: string
  sleepRecords?: ReturnType<typeof normalizeHealthAutoExportJson>['records']
  userId: string
}): Promise<ReturnType<typeof emptySleepWindowMetricSaveResult>> {
  const normalized =
    sleepRecords ??
    normalizeHealthAutoExportJson({
      batchId: runId,
      input: downloaded.value,
      sourceFile: downloaded.fileName,
      userId,
    }).records
  const aggregated = aggregateSleepWindowMetrics({
    boundaryHour,
    input: downloaded.value,
    runId,
    sleepRecords: normalized,
    sourceFile: downloaded.fileName,
    userId,
  })
  const saved = await saveHealthMetricRecords(aggregated.records)

  return {
    sleepWindowMetricBackfill: isBackfill,
    sleepWindowMetricRejectedRowCount: aggregated.rejectedRowCount,
    sleepWindowMetricSavedRecordCount: saved.savedRecordCount,
    sleepWindowMetricSkippedMetricCount: aggregated.skippedMetricCount,
    sleepWindowMetricUpdatedRecordCount: saved.updatedRecordCount,
  }
}

function emptyHealthMetricSaveResult(
  healthMetricBackfill: boolean,
): Pick<
  DriveSyncFileResult,
  | 'healthMetricBackfill'
  | 'healthMetricRejectedRowCount'
  | 'healthMetricSavedRecordCount'
  | 'healthMetricSkippedMetricCount'
  | 'healthMetricUpdatedRecordCount'
> {
  return {
    healthMetricBackfill,
    healthMetricRejectedRowCount: 0,
    healthMetricSavedRecordCount: 0,
    healthMetricSkippedMetricCount: 0,
    healthMetricUpdatedRecordCount: 0,
  }
}

function emptySleepWindowMetricSaveResult(
  sleepWindowMetricBackfill: boolean,
): Pick<
  DriveSyncFileResult,
  | 'sleepWindowMetricBackfill'
  | 'sleepWindowMetricRejectedRowCount'
  | 'sleepWindowMetricSavedRecordCount'
  | 'sleepWindowMetricSkippedMetricCount'
  | 'sleepWindowMetricUpdatedRecordCount'
> {
  return {
    sleepWindowMetricBackfill,
    sleepWindowMetricRejectedRowCount: 0,
    sleepWindowMetricSavedRecordCount: 0,
    sleepWindowMetricSkippedMetricCount: 0,
    sleepWindowMetricUpdatedRecordCount: 0,
  }
}
