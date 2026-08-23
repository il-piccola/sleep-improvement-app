import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import type { SleepRecord } from '../src/types/sleep.ts'
import { processHealthAutoExportText } from './healthAutoExport.ts'
import { processCanonicalSleep } from './canonicalSleep.ts'
import {
  getCanonicalRecordId,
  getCanonicalSourceKey,
} from './sleepBlocks.ts'
import { aggregateProcessorDailyHealthMetrics } from './dailyHealthMetrics.ts'
import { aggregateProcessorSleepWindowHealthMetrics } from './sleepWindowHealthMetrics.ts'
import type { ProcessorHealthMetricRecord } from './healthMetricTypes.ts'
import {
  DEFAULT_PROCESSOR_CONFIG,
  PROCESSOR_IDENTITY_POLICY_VERSION,
  type ProcessorConfig,
  type ProcessorIntegrationResult,
  type ProcessorOverlap,
  type ClassifiedProcessorSleepBlock,
} from './types.ts'
import {
  publishProcessedSnapshot,
  stableStringify,
  type PublishedSnapshot,
} from './snapshot.ts'

export const PROCESSOR_VERSION = '1.0.0-o12'

type InputFileRecord = {
  sourceFileId: string
  relativePath: string
  fileName: string
  size: number
  modifiedAt: string | null
  sha256: string | null
  format: string
  status: 'processed' | 'skipped' | 'failed' | 'unsupported'
  processedRecordCount: number
  rejectedRowCount: number
  warningCount: number
}

type ParsedSource = {
  inputFile: InputFileRecord
  input: unknown
  sleepRecords: SleepRecord[]
  auditMessages: Array<{ id: string; severity: 'info' | 'warning' | 'error' }>
}

type DiagnosticWarning = {
  code: string
  severity: 'info' | 'warning' | 'error'
  sourceFileId: string | null
  count: number
}

export type ProcessDirectoryResult = {
  published: PublishedSnapshot
  inputFileCount: number
  processedFileCount: number
  failedFileCount: number
  sleepRecordCount: number
  healthMetricCount: number
}

export async function processHealthExportDirectory({
  backupRoot = null,
  config = DEFAULT_PROCESSOR_CONFIG,
  processedDataRoot,
  processorRevision = null,
  rawRoot,
  snapshotId,
}: {
  backupRoot?: string | null
  config?: ProcessorConfig
  processedDataRoot: string
  processorRevision?: string | null
  rawRoot: string
  snapshotId?: string
}): Promise<ProcessDirectoryResult> {
  assertSeparatedRoot(rawRoot, processedDataRoot, 'processed data root')
  if (backupRoot) assertSeparatedRoot(rawRoot, backupRoot, 'processed data backup root')

  const files = await findJsonFiles(rawRoot)
  const sources: ParsedSource[] = []
  const inputFiles: InputFileRecord[] = []
  const diagnostics: DiagnosticWarning[] = []

  for (const filePath of files) {
    const source = await processInputFile(rawRoot, filePath)
    inputFiles.push(source.inputFile)
    diagnostics.push(...toDiagnosticWarnings(source))
    if (source.parsed) sources.push(source.parsed)
  }

  const sleepRecords = sources.flatMap((source) => source.sleepRecords)
  const canonical = processCanonicalSleep(sleepRecords, config)
  const canonicalSleepRecords = buildCanonicalSleepRecords({
    sources,
    integration: canonical.integration,
  })
  const sleepBlocks = canonical.blocks.map(toSnapshotSleepBlock)
  const overlaps = canonical.overlaps.map((overlap) =>
    toSnapshotOverlap(overlap, canonical.integration),
  )
  const sourceSummaries = buildSourceSummaries({
    records: canonicalSleepRecords,
    overlaps,
  })
  const healthMetrics = buildHealthMetrics(sources, canonical.blocks, config)
  const failedFileCount = inputFiles.filter((file) => file.status === 'failed').length
  const processedFileCount = inputFiles.filter((file) => file.status === 'processed').length
  const rejectedRowCount = inputFiles.reduce((sum, file) => sum + file.rejectedRowCount, 0)
  const warningCount = diagnostics.reduce((sum, warning) => sum + warning.count, 0)
  const diagnosticsDocument = {
    status:
      processedFileCount === 0 && failedFileCount > 0
        ? 'failed'
        : failedFileCount > 0 || rejectedRowCount > 0 || warningCount > 0
          ? 'completed_with_warnings'
          : 'completed',
    inputFileCount: inputFiles.length,
    processedFileCount,
    failedFileCount,
    sleepRecordCount: canonicalSleepRecords.length,
    rejectedRowCount,
    warningCount,
    warnings: aggregateWarnings(diagnostics),
  }

  const published = await publishProcessedSnapshot({
    ...(snapshotId ? { snapshotId } : {}),
    backupRoot,
    content: {
      inputFiles: [...inputFiles].sort(compareInputFiles),
      sleepRecords: canonicalSleepRecords,
      sleepBlocks,
      sleepDays: [...canonical.sleepDays].sort((left, right) => left.sleepDay.localeCompare(right.sleepDay)),
      sourceSummaries,
      overlaps,
      healthMetrics,
      diagnostics: diagnosticsDocument,
    },
    identityPolicyVersion: PROCESSOR_IDENTITY_POLICY_VERSION,
    processedDataRoot,
    processingConfig: config,
    processorRevision,
    processorVersion: PROCESSOR_VERSION,
  })

  return {
    published,
    inputFileCount: inputFiles.length,
    processedFileCount,
    failedFileCount,
    sleepRecordCount: canonicalSleepRecords.length,
    healthMetricCount: healthMetrics.length,
  }
}

async function processInputFile(
  rawRoot: string,
  filePath: string,
): Promise<{ inputFile: InputFileRecord; parsed: ParsedSource | null }> {
  const metadata = await stat(filePath)
  const relativePath = toPortableRelativePath(rawRoot, filePath)
  const bytes = await readFile(filePath)
  const contentSha256 = createHash('sha256').update(bytes).digest('hex')
  const modifiedAt = Number.isFinite(metadata.mtimeMs) ? new Date(metadata.mtimeMs).toISOString() : null
  const sourceFileId = createSourceFileId({
    relativePath,
    size: metadata.size,
    modifiedAt,
    sha256: contentSha256,
  })
  const base: Omit<
    InputFileRecord,
    'status' | 'processedRecordCount' | 'rejectedRowCount' | 'warningCount'
  > = {
    sourceFileId,
    relativePath,
    fileName: basename(filePath),
    size: metadata.size,
    modifiedAt,
    sha256: contentSha256,
    format: 'health_auto_export_json',
  }

  try {
    const text = bytes.toString('utf8')
    const input = JSON.parse(text) as unknown
    const processed = processHealthAutoExportText({
      sourceFile: relativePath,
      text,
    })
    const auditMessages = processed.audit.messages.map((message) => ({
      id: message.id,
      severity: message.severity,
    }))
    const warningCount = auditMessages.filter((message) => message.severity !== 'info').length
    const unsupported = !processed.audit.metricsFound && !processed.audit.sleepAnalysisFound
    const inputFile: InputFileRecord = {
      ...base,
      status: unsupported ? 'unsupported' : 'processed',
      processedRecordCount: processed.records.length,
      rejectedRowCount: processed.rejectedRows,
      warningCount,
    }

    return {
      inputFile,
      parsed: {
        inputFile,
        input,
        sleepRecords: processed.records,
        auditMessages,
      },
    }
  } catch {
    return {
      inputFile: {
        ...base,
        status: 'failed',
        processedRecordCount: 0,
        rejectedRowCount: 0,
        warningCount: 1,
      },
      parsed: null,
    }
  }
}

function buildCanonicalSleepRecords({
  integration,
  sources,
}: {
  integration: ProcessorIntegrationResult
  sources: ParsedSource[]
}): Array<Record<string, unknown>> {
  const sourceFileIds = new Map(
    sources.map((source) => [source.inputFile.relativePath, source.inputFile.sourceFileId]),
  )
  const integrationByRecordId = new Map(
    integration.recordIntegrations.map((record) => [record.recordId, record]),
  )
  const recordsById = new Map<string, Record<string, unknown>>()

  for (const record of sources.flatMap((source) => source.sleepRecords)) {
    const recordId = getCanonicalRecordId(record)
    const sourceKey = getCanonicalSourceKey(record)
    const integrationRecord = integrationByRecordId.get(recordId)
    const sourceFileId = sourceFileIds.get(record.sourceFile ?? '')
    if (!sourceFileId) continue

    const canonicalRecord: Record<string, unknown> = {
      recordId,
      stage: record.stage ?? 'asleep_unspecified',
      originalValue: record.originalValue ?? record.value ?? null,
      start: record.start ?? record.startDate ?? null,
      end: record.end ?? record.endDate ?? null,
      durationMinutes: record.durationMinutes ?? 0,
      sourceKey,
      sourceFormat: record.sourceFormat ?? 'health_auto_export_json',
      sourceFileId,
      sourceName: record.sourceName ?? record.source ?? null,
      integrationStatus: integrationRecord?.status ?? 'ignored',
      integrationReasonCode: integrationRecord?.reasonCode ?? 'not_part_of_sleep_block',
      unifiedBlockId: integrationRecord?.blockId ?? null,
    }

    const existing = recordsById.get(recordId)
    if (!existing || sourceFileId.localeCompare(String(existing.sourceFileId)) < 0) {
      recordsById.set(recordId, canonicalRecord)
    }
  }

  return Array.from(recordsById.values()).sort(compareSleepRecords)
}

function toSnapshotSleepBlock(block: ClassifiedProcessorSleepBlock): Record<string, unknown> {
  return {
    blockId: block.blockId,
    sleepDay: block.sleepDay,
    start: block.start,
    end: block.end,
    durationMinutes: block.durationMinutes,
    timeConfidence: block.timeConfidence,
    blockType: block.blockType,
    isMainSleep: block.isMainSleep,
    sourceRecordIds: block.sourceRecordIds,
    sourceKeys: block.sourceKeys,
    stageSegments: block.stageSegments,
  }
}

function toSnapshotOverlap(
  overlap: ProcessorOverlap,
  integration: ProcessorIntegrationResult,
): Record<string, unknown> {
  const decisions = overlap.blockIds
    .map((blockId) => integration.blockDecisions.find((decision) => decision.blockId === blockId))
    .filter((decision) => decision !== undefined)
  const excluded = decisions.find((decision) => decision?.status === 'excluded_duplicate')
  const pending = decisions.find((decision) => decision?.status === 'pending_overlap')
  const support = decisions.find((decision) => decision?.status === 'support')
  const resolution = excluded
    ? 'excluded_duplicate'
    : pending
      ? 'pending'
      : support
        ? 'support'
        : 'adopted'
  const decisive = excluded ?? pending ?? support ?? decisions[0]

  return {
    overlapId: overlap.overlapId,
    kind: overlap.kind,
    recordOrBlockIds: overlap.blockIds,
    sourceKeys: overlap.sourceKeys,
    overlapMinutes: overlap.overlapMinutes,
    overlapRatio: overlap.overlapRatio,
    resolution,
    adoptedBlockId: decisive?.selectedOverBlockId ?? null,
    reasonCode: decisive?.reasonCode ?? 'independent',
  }
}

function buildSourceSummaries({
  overlaps,
  records,
}: {
  overlaps: Array<Record<string, unknown>>
  records: Array<Record<string, unknown>>
}): Array<Record<string, unknown>> {
  const groups = new Map<string, Array<Record<string, unknown>>>()

  for (const record of records) {
    const sourceKey = String(record.sourceKey)
    const group = groups.get(sourceKey) ?? []
    group.push(record)
    groups.set(sourceKey, group)
  }

  return Array.from(groups.entries())
    .map(([sourceKey, group]) => {
      const starts = group.map((record) => record.start).filter(isString).sort()
      const ends = group.map((record) => record.end).filter(isString).sort()
      const stageCoverage = Array.from(new Set(group.map((record) => String(record.stage)))).sort()
      const sourceOverlaps = overlaps.filter((overlap) =>
        Array.isArray(overlap.sourceKeys) && overlap.sourceKeys.includes(sourceKey),
      )

      return {
        sourceKey,
        sourceName: group.map((record) => record.sourceName).find(isString) ?? null,
        recordCount: group.length,
        firstRecordAt: starts[0] ?? null,
        lastRecordAt: ends.at(-1) ?? null,
        stageCoverage,
        fullDuplicateCount: sourceOverlaps.filter(
          (overlap) => overlap.kind === 'full_duplicate_candidate',
        ).length,
        partialOverlapCount: sourceOverlaps.filter(
          (overlap) => overlap.kind === 'partial_overlap_candidate',
        ).length,
        adoptedRecordCount: group.filter((record) => record.integrationStatus === 'adopted').length,
        excludedDuplicateCount: group.filter(
          (record) => record.integrationStatus === 'excluded_duplicate',
        ).length,
        warningCodes: [],
      }
    })
    .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey))
}

function buildHealthMetrics(
  sources: ParsedSource[],
  blocks: ClassifiedProcessorSleepBlock[],
  config: ProcessorConfig,
): ProcessorHealthMetricRecord[] {
  const merged = new Map<
    string,
    { record: ProcessorHealthMetricRecord; sourceFileIds: Set<string> }
  >()

  for (const source of sources) {
    const results = [
      aggregateProcessorDailyHealthMetrics({ input: source.input, config }),
      aggregateProcessorSleepWindowHealthMetrics({ input: source.input, blocks, config }),
    ]

    for (const result of results) {
      for (const record of result.records) {
        mergeMetricRecord(merged, record, source.inputFile.sourceFileId)
      }
    }
  }

  return Array.from(merged.values())
    .map(({ record, sourceFileIds }) => ({ ...record, sourceFileCount: sourceFileIds.size }))
    .sort(compareHealthMetrics)
}

function mergeMetricRecord(
  merged: Map<string, { record: ProcessorHealthMetricRecord; sourceFileIds: Set<string> }>,
  incoming: ProcessorHealthMetricRecord,
  sourceFileId: string,
): void {
  const existing = merged.get(incoming.metricRecordId)
  if (!existing) {
    merged.set(incoming.metricRecordId, {
      record: { ...incoming },
      sourceFileIds: new Set([sourceFileId]),
    })
    return
  }

  existing.sourceFileIds.add(sourceFileId)
  existing.record.sourceRowCount += incoming.sourceRowCount

  if (incoming.aggregation === 'daily_total') {
    existing.record.value = (existing.record.value ?? 0) + (incoming.value ?? 0)
    return
  }

  const existingCount = existing.record.valueCount ?? 0
  const incomingCount = incoming.valueCount ?? 0
  const totalCount = existingCount + incomingCount
  if (totalCount > 0) {
    existing.record.valueAvg =
      (((existing.record.valueAvg ?? 0) * existingCount) +
        ((incoming.valueAvg ?? 0) * incomingCount)) /
      totalCount
  }
  existing.record.valueCount = totalCount
  existing.record.valueMin = minNullable(existing.record.valueMin, incoming.valueMin)
  existing.record.valueMax = maxNullable(existing.record.valueMax, incoming.valueMax)
}

function toDiagnosticWarnings(source: {
  inputFile: InputFileRecord
  parsed: ParsedSource | null
}): DiagnosticWarning[] {
  if (!source.parsed) {
    return [
      {
        code: 'INPUT_PROCESSING_FAILED',
        severity: 'error',
        sourceFileId: source.inputFile.sourceFileId,
        count: 1,
      },
    ]
  }

  return source.parsed.auditMessages
    .filter((message) => message.severity !== 'info')
    .map((message) => ({
      code: message.id.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
      severity: message.severity,
      sourceFileId: source.inputFile.sourceFileId,
      count: 1,
    }))
}

function aggregateWarnings(warnings: DiagnosticWarning[]): DiagnosticWarning[] {
  const grouped = new Map<string, DiagnosticWarning>()

  for (const warning of warnings) {
    const key = [warning.code, warning.severity, warning.sourceFileId ?? ''].join('|')
    const existing = grouped.get(key)
    if (existing) {
      existing.count += warning.count
    } else {
      grouped.set(key, { ...warning })
    }
  }

  return Array.from(grouped.values()).sort(
    (left, right) =>
      left.code.localeCompare(right.code) ||
      String(left.sourceFileId).localeCompare(String(right.sourceFileId)),
  )
}

function createSourceFileId(input: {
  relativePath: string
  size: number
  modifiedAt: string | null
  sha256: string
}): string {
  const identity = stableStringify({
    identityPolicyVersion: PROCESSOR_IDENTITY_POLICY_VERSION,
    ...input,
  })
  return `src-${createHash('sha256').update(identity).digest('hex').slice(0, 32)}`
}

async function findJsonFiles(rawRoot: string): Promise<string[]> {
  const root = resolve(rawRoot)
  const entries = await readdir(root, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await findJsonFiles(path)))
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
      files.push(resolve(path))
    }
  }

  return files.sort((left, right) => left.localeCompare(right))
}

function toPortableRelativePath(rawRoot: string, filePath: string): string {
  const portable = relative(resolve(rawRoot), resolve(filePath)).replace(/\\/g, '/')
  if (!portable || portable === '.' || portable.startsWith('../') || isAbsolute(portable)) {
    throw new Error('Input file must be below raw root')
  }
  return portable
}

function assertSeparatedRoot(rawRoot: string, candidate: string, label: string): void {
  const relativePath = relative(resolve(rawRoot), resolve(candidate))
  if (!relativePath || relativePath === '.') {
    throw new Error(`${label} must not equal raw root`)
  }
  if (!relativePath.startsWith('..') && !isAbsolute(relativePath)) {
    throw new Error(`${label} must be outside raw root`)
  }
}

function compareInputFiles(left: InputFileRecord, right: InputFileRecord): number {
  return left.relativePath.localeCompare(right.relativePath) || left.sourceFileId.localeCompare(right.sourceFileId)
}

function compareSleepRecords(left: Record<string, unknown>, right: Record<string, unknown>): number {
  const leftStart = isString(left.start) ? left.start : '\uffff'
  const rightStart = isString(right.start) ? right.start : '\uffff'
  const leftEnd = isString(left.end) ? left.end : '\uffff'
  const rightEnd = isString(right.end) ? right.end : '\uffff'
  return (
    leftStart.localeCompare(rightStart) ||
    leftEnd.localeCompare(rightEnd) ||
    String(left.recordId).localeCompare(String(right.recordId))
  )
}

function compareHealthMetrics(
  left: ProcessorHealthMetricRecord,
  right: ProcessorHealthMetricRecord,
): number {
  return (
    left.metricName.localeCompare(right.metricName) ||
    left.windowStart.localeCompare(right.windowStart) ||
    left.sourceKey.localeCompare(right.sourceKey) ||
    left.metricRecordId.localeCompare(right.metricRecordId)
  )
}

function minNullable(left: number | null, right: number | null): number | null {
  if (left === null) return right
  if (right === null) return left
  return Math.min(left, right)
}

function maxNullable(left: number | null, right: number | null): number | null {
  if (left === null) return right
  if (right === null) return left
  return Math.max(left, right)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}
