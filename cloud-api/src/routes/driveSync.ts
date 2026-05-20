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
  listHealthAutoExportJsonFiles,
} from '../lib/drive.js'
import { normalizeHealthAutoExportJson } from '../lib/healthAutoExport.js'
import {
  ProcessedDriveFileError,
  saveProcessedDriveFile,
  shouldProcessDriveFile,
} from '../lib/processedDriveFiles.js'
import { isAuthorized, sendJson, sendSafeError } from '../lib/security.js'
import { saveSleepRecords, SleepRecordSaveError } from '../lib/sleepRecords.js'

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
}

export async function handleDriveSync(
  request: IncomingMessage,
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
    const userId = getDefaultUserId()
    const files = await listHealthAutoExportJsonFiles(folderId)
    const results: DriveSyncFileResult[] = []

    for (const file of files) {
      const shouldProcess = await shouldProcessDriveFile(userId, file)

      if (!shouldProcess) {
        results.push({
          fileId: file.fileId,
          fileName: file.fileName,
          status: 'skipped',
          addedCount: 0,
          skippedDuplicateCount: 0,
          warningCount: 0,
          rejectedRows: 0,
        })
        continue
      }

      results.push(await processDriveFile(userId, file))
    }

    sendJson(response, 200, {
      ok: true,
      folderId,
      scannedFileCount: files.length,
      processedFileCount: results.filter((result) => result.status === 'processed').length,
      skippedFileCount: results.filter((result) => result.status === 'skipped').length,
      failedFileCount: results.filter((result) => result.status === 'failed').length,
      addedCount: results.reduce((sum, result) => sum + result.addedCount, 0),
      skippedDuplicateCount: results.reduce(
        (sum, result) => sum + result.skippedDuplicateCount,
        0,
      ),
      warningCount: results.reduce((sum, result) => sum + result.warningCount, 0),
      rejectedRows: results.reduce((sum, result) => sum + result.rejectedRows, 0),
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
      })),
    })
  } catch (error) {
    if (
      error instanceof FirestoreSaveError ||
      error instanceof SleepRecordSaveError ||
      error instanceof ProcessedDriveFileError
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

async function processDriveFile(
  userId: string,
  file: Awaited<ReturnType<typeof listHealthAutoExportJsonFiles>>[number],
): Promise<DriveSyncFileResult> {
  try {
    const downloaded = await downloadDriveJsonFile(file)
    const batchId = randomUUID()
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
    }
  }
}
