import { createHash, randomBytes } from 'node:crypto'
import { mkdir, open, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { hostname } from 'node:os'
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
import {
  getMetricString,
  getRawHealthMetrics,
  type ProcessorHealthMetricRecord,
} from './healthMetricTypes.ts'
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
const PROCESSOR_CACHE_SCHEMA_VERSION = '3'
const CACHE_ENTRY_DIRECTORY_NAME = 'entries'
const CACHE_VALIDATION_MODES = ['metadata', 'sha256'] as const

export type ProcessorCacheValidation = (typeof CACHE_VALIDATION_MODES)[number]

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
  dailyHealthMetrics: ProcessorHealthMetricRecord[]
  sleepRecords: SleepRecord[]
  auditMessages: Array<{ id: string; severity: 'info' | 'warning' | 'error' }>
}

type CacheEntry = {
  schemaVersion: typeof PROCESSOR_CACHE_SCHEMA_VERSION
  processorVersion: string
  relativePath: string
  rawRootKey: string
  processingConfigKey: string
  changedAt: string | null
  inputFile: InputFileRecord
  parsed: ParsedSource | null
}

type CacheEnvelope = {
  checksum: string
  entry: CacheEntry
}

type InputProcessResult = {
  inputFile: InputFileRecord
  parsed: ParsedSource | null
  cacheHit: boolean
  cacheCorrupted: boolean
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
  cacheHitCount: number
  cacheMissCount: number
  cacheCorruptionCount: number
}

export async function processHealthExportDirectory({
  backupRoot = null,
  config = DEFAULT_PROCESSOR_CONFIG,
  processedDataRoot,
  processorRevision = null,
  rawRoot,
  snapshotId,
  cacheRoot,
  cacheValidation = 'metadata',
  cacheEnabled = true,
}: {
  backupRoot?: string | null
  config?: ProcessorConfig
  processedDataRoot: string
  processorRevision?: string | null
  rawRoot: string
  snapshotId?: string
  cacheRoot?: string
  cacheValidation?: ProcessorCacheValidation
  cacheEnabled?: boolean
}): Promise<ProcessDirectoryResult> {
  assertSeparatedRoot(rawRoot, processedDataRoot, 'processed data root')
  if (backupRoot) assertSeparatedRoot(rawRoot, backupRoot, 'processed data backup root')
  const resolvedRawRoot = resolve(rawRoot)
  const resolvedCacheRoot = resolve(
    cacheRoot ?? join(resolve(processedDataRoot), 'cache', 'processor'),
  )
  if (cacheEnabled) {
    assertSeparatedRoot(resolvedRawRoot, resolvedCacheRoot, 'processor cache root')
    assertNotSameRoot(processedDataRoot, resolvedCacheRoot, 'processor cache root')
  }
  if (!CACHE_VALIDATION_MODES.includes(cacheValidation)) {
    throw new Error(`Unsupported processor cache validation mode: ${cacheValidation}`)
  }

  await mkdir(resolve(processedDataRoot), { recursive: true })
  if (cacheEnabled) await mkdir(resolvedCacheRoot, { recursive: true })
  const physicalRawRoot = await realpath(resolvedRawRoot)
  const physicalProcessedRoot = await realpath(resolve(processedDataRoot))
  assertSeparatedRoot(physicalRawRoot, physicalProcessedRoot, 'processed data root')
  if (cacheEnabled) {
    const physicalCacheRoot = await realpath(resolvedCacheRoot)
    assertSeparatedRoot(physicalRawRoot, physicalCacheRoot, 'processor cache root')
    assertNotSameRoot(physicalProcessedRoot, physicalCacheRoot, 'processor cache root')
  }
  const releaseLock = await acquireProcessorLock(physicalProcessedRoot)

  try {
  const files = await findJsonFiles(physicalRawRoot)
  const sources: ParsedSource[] = []
  const inputFiles: InputFileRecord[] = []
  const diagnostics: DiagnosticWarning[] = []
  const cacheStats = {
    hitCount: 0,
    missCount: 0,
    corruptionCount: 0,
  }
  const rawRootKey = createRawRootKey(physicalRawRoot)
  const processingConfigKey = stableStringify({ timeZone: config.timeZone })

  for (const filePath of files) {
    const source = await processInputFile({
      rawRoot: physicalRawRoot,
      filePath,
      cacheRoot: resolvedCacheRoot,
      cacheValidation,
      cacheEnabled,
      rawRootKey,
      processingConfigKey,
      config,
    })
    if (source.cacheHit) cacheStats.hitCount += 1
    if (!source.cacheHit) cacheStats.missCount += 1
    if (source.cacheCorrupted) cacheStats.corruptionCount += 1
    inputFiles.push(source.inputFile)
    diagnostics.push(...toDiagnosticWarnings(source))
    if (source.parsed) sources.push(source.parsed)
  }

  if (cacheEnabled) {
    await pruneCacheEntries(resolvedCacheRoot, inputFiles.map((file) => file.relativePath))
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
    cacheHitCount: cacheStats.hitCount,
    cacheMissCount: cacheStats.missCount,
    cacheCorruptionCount: cacheStats.corruptionCount,
  }
  } finally {
    await releaseLock()
  }
}

async function processInputFile({
  rawRoot,
  filePath,
  cacheRoot,
  cacheValidation,
  cacheEnabled,
  rawRootKey,
  processingConfigKey,
  config,
}: {
  rawRoot: string
  filePath: string
  cacheRoot: string
  cacheValidation: ProcessorCacheValidation
  cacheEnabled: boolean
  rawRootKey: string
  processingConfigKey: string
  config: ProcessorConfig
}): Promise<InputProcessResult> {
  const metadata = await stat(filePath)
  const relativePath = toPortableRelativePath(rawRoot, filePath)
  const modifiedAt = Number.isFinite(metadata.mtimeMs) ? new Date(metadata.mtimeMs).toISOString() : null
  const changedAt = Number.isFinite(metadata.ctimeMs) ? new Date(metadata.ctimeMs).toISOString() : null
  const cachePath = getCacheEntryPath(cacheRoot, relativePath)
  const cached = cacheEnabled
    ? await readCacheEntry(cachePath)
    : { entry: null, corrupted: false }

  if (
    cached.entry &&
    isCacheEntryUsable({
      entry: cached.entry,
      relativePath,
      rawRootKey,
      processingConfigKey,
      size: metadata.size,
      modifiedAt,
      changedAt,
    })
  ) {
    if (cacheValidation === 'metadata') {
      return {
        inputFile: cached.entry.inputFile,
        parsed: cached.entry.parsed,
        cacheHit: true,
        cacheCorrupted: cached.corrupted,
      }
    }

    const bytes = await readFile(filePath)
    const contentSha256 = createHash('sha256').update(bytes).digest('hex')
    if (contentSha256 === cached.entry.inputFile.sha256) {
      return {
        inputFile: cached.entry.inputFile,
        parsed: cached.entry.parsed,
        cacheHit: true,
        cacheCorrupted: cached.corrupted,
      }
    }

    return processInputFileContents({
      filePath,
      relativePath,
      size: metadata.size,
      modifiedAt,
      changedAt,
      bytes,
      contentSha256,
      cacheRoot,
      rawRootKey,
      processingConfigKey,
      config,
      cacheCorrupted: cached.corrupted,
      cacheEnabled,
    })
  }

  const bytes = await readFile(filePath)
  const contentSha256 = createHash('sha256').update(bytes).digest('hex')
  return processInputFileContents({
    filePath,
    relativePath,
    size: metadata.size,
    modifiedAt,
    changedAt,
    bytes,
    contentSha256,
    cacheRoot,
    rawRootKey,
    processingConfigKey,
    config,
    cacheCorrupted: cached.corrupted,
    cacheEnabled,
  })
}

async function processInputFileContents({
  filePath,
  relativePath,
  size,
  modifiedAt,
  changedAt,
  bytes,
  contentSha256,
  cacheRoot,
  rawRootKey,
  processingConfigKey,
  config,
  cacheCorrupted,
  cacheEnabled,
}: {
  filePath: string
  relativePath: string
  size: number
  modifiedAt: string | null
  changedAt: string | null
  bytes: Buffer
  contentSha256: string
  cacheRoot: string
  rawRootKey: string
  processingConfigKey: string
  config: ProcessorConfig
  cacheCorrupted: boolean
  cacheEnabled: boolean
}): Promise<InputProcessResult> {
  const sourceFileId = createSourceFileId({
    relativePath,
    size,
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
    size,
    modifiedAt,
    sha256: contentSha256,
    format: 'health_auto_export_json',
  }

  let result: { inputFile: InputFileRecord; parsed: ParsedSource | null }
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

    result = {
      inputFile,
      parsed: {
        inputFile,
        input: selectHealthMetricInput(input),
        dailyHealthMetrics: aggregateProcessorDailyHealthMetrics({ input, config }).records,
        sleepRecords: processed.records,
        auditMessages,
      },
    }
  } catch {
    result = {
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

  if (cacheEnabled) {
    await writeCacheEntry(cacheRoot, relativePath, {
      schemaVersion: PROCESSOR_CACHE_SCHEMA_VERSION,
      processorVersion: PROCESSOR_VERSION,
      relativePath,
      rawRootKey,
      processingConfigKey,
      changedAt,
      ...result,
    })
  }
  return { ...result, cacheHit: false, cacheCorrupted }
}

const CACHED_HEALTH_METRIC_NAMES = new Set([
  'heart_rate',
  'heart_rate_variability',
  'respiratory_rate',
])

function selectHealthMetricInput(input: unknown): unknown {
  const metrics = getRawHealthMetrics(input)
  if (!metrics) return []

  return metrics
    .map((metric) => {
      const metricName = getMetricString(metric.name)
      if (!metricName || !CACHED_HEALTH_METRIC_NAMES.has(metricName)) return null

      const data = Array.isArray(metric.data)
        ? metric.data.map((row) => selectHealthMetricRow(row))
        : metric.data
      return { name: metricName, data }
    })
    .filter((metric): metric is { name: string; data: unknown } => metric !== null)
}

function selectHealthMetricRow(row: unknown): unknown {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row
  const source = row as Record<string, unknown>
  const selected: Record<string, unknown> = {}
  for (const key of [
    'date',
    'qty',
    'source',
    'start',
    'startDate',
    'end',
    'endDate',
    'Avg',
    'Min',
    'Max',
  ]) {
    if (Object.prototype.hasOwnProperty.call(source, key)) selected[key] = source[key]
  }
  return selected
}

async function readCacheEntry(
  path: string,
): Promise<{ entry: CacheEntry | null; corrupted: boolean }> {
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as unknown
    return isCacheEnvelope(value)
      ? { entry: value.entry, corrupted: false }
      : { entry: null, corrupted: true }
  } catch (error) {
    if (isMissing(error)) return { entry: null, corrupted: false }
    return { entry: null, corrupted: true }
  }
}

function isCacheEnvelope(value: unknown): value is CacheEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const envelope = value as Partial<CacheEnvelope>
  if (typeof envelope.checksum !== 'string' || !isCacheEntry(envelope.entry)) return false
  const checksum = createHash('sha256').update(stableStringify(envelope.entry)).digest('hex')
  return checksum === envelope.checksum
}

function isCacheEntry(value: unknown): value is CacheEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const entry = value as Partial<CacheEntry>
  if (
    entry.schemaVersion !== PROCESSOR_CACHE_SCHEMA_VERSION ||
    typeof entry.processorVersion !== 'string' ||
    typeof entry.relativePath !== 'string' ||
    typeof entry.rawRootKey !== 'string' ||
    typeof entry.processingConfigKey !== 'string' ||
    (typeof entry.changedAt !== 'string' && entry.changedAt !== null) ||
    !isInputFileRecord(entry.inputFile)
  ) {
    return false
  }
  return (
    (entry.parsed === null || isParsedSource(entry.parsed)) &&
    (entry.parsed === null || (
      entry.parsed.inputFile.sourceFileId === entry.inputFile.sourceFileId &&
      entry.parsed.inputFile.relativePath === entry.inputFile.relativePath
    ))
  )
}

function isInputFileRecord(value: unknown): value is InputFileRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Partial<InputFileRecord>
  return (
    typeof record.sourceFileId === 'string' &&
    typeof record.relativePath === 'string' &&
    typeof record.fileName === 'string' &&
    typeof record.size === 'number' &&
    (typeof record.modifiedAt === 'string' || record.modifiedAt === null) &&
    (typeof record.sha256 === 'string' || record.sha256 === null) &&
    typeof record.format === 'string' &&
    (record.status === 'processed' || record.status === 'skipped' ||
      record.status === 'failed' || record.status === 'unsupported') &&
    typeof record.processedRecordCount === 'number' &&
    typeof record.rejectedRowCount === 'number' &&
    typeof record.warningCount === 'number'
  )
}

function isParsedSource(value: unknown): value is ParsedSource {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const parsed = value as Partial<ParsedSource>
  return (
    isInputFileRecord(parsed.inputFile) &&
    Array.isArray(parsed.input) &&
    Array.isArray(parsed.dailyHealthMetrics) &&
    Array.isArray(parsed.sleepRecords) &&
    Array.isArray(parsed.auditMessages) &&
    parsed.auditMessages.every(
      (message) =>
        message && typeof message === 'object' &&
        typeof message.id === 'string' &&
        (message.severity === 'info' || message.severity === 'warning' || message.severity === 'error'),
    )
  )
}

function isCacheEntryUsable({
  entry,
  relativePath,
  rawRootKey,
  processingConfigKey,
  size,
  modifiedAt,
  changedAt,
}: {
  entry: CacheEntry
  relativePath: string
  rawRootKey: string
  processingConfigKey: string
  size: number
  modifiedAt: string | null
  changedAt: string | null
}): boolean {
  return (
    entry.processorVersion === PROCESSOR_VERSION &&
    entry.relativePath === relativePath &&
    entry.rawRootKey === rawRootKey &&
    entry.processingConfigKey === processingConfigKey &&
    entry.inputFile.relativePath === relativePath &&
    entry.inputFile.size === size &&
    entry.inputFile.modifiedAt === modifiedAt &&
    entry.changedAt === changedAt &&
    typeof entry.inputFile.sha256 === 'string' &&
    /^[a-f0-9]{64}$/i.test(entry.inputFile.sha256)
  )
}

async function writeCacheEntry(
  cacheRoot: string,
  relativePath: string,
  entry: CacheEntry,
): Promise<void> {
  const path = getCacheEntryPath(cacheRoot, relativePath)
  const temporaryPath = `${path}.${process.pid}.${Date.now()}-${randomBytes(4).toString('hex')}.tmp`
  const backupPath = `${path}.${process.pid}.${Date.now()}-${randomBytes(4).toString('hex')}.bak`
  let movedExisting = false
  try {
    await mkdir(join(cacheRoot, CACHE_ENTRY_DIRECTORY_NAME), { recursive: true })
    const payload = stableStringify(entry)
    const checksum = createHash('sha256').update(payload).digest('hex')
    await writeFile(temporaryPath, `{"checksum":"${checksum}","entry":${payload}}\n`, 'utf8')
    try {
      await rename(path, backupPath)
      movedExisting = true
    } catch (error) {
      if (!isMissing(error)) throw error
    }
    await rename(temporaryPath, path)
    if (movedExisting) await rm(backupPath, { force: true }).catch(() => undefined)
  } catch {
    // Restore the previous entry when replacement fails. The cache is an optimization,
    // so a failed write must not prevent a valid snapshot.
    if (movedExisting) {
      try {
        await rename(backupPath, path)
      } catch {
        // Ignore restoration failures; the next run will rebuild this entry.
      }
    }
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    await rm(backupPath, { force: true }).catch(() => undefined)
  }
}

async function pruneCacheEntries(cacheRoot: string, relativePaths: string[]): Promise<void> {
  const entriesRoot = join(cacheRoot, CACHE_ENTRY_DIRECTORY_NAME)
  const expected = new Set(relativePaths.map((path) => basename(getCacheEntryPath(cacheRoot, path))))
  let entries
  try {
    entries = await readdir(entriesRoot, { withFileTypes: true })
  } catch (error) {
    if (isMissing(error)) return
    throw error
  }

  await Promise.all(entries.flatMap((entry) => {
    if (!entry.isFile()) return []
    const isCurrentEntry = entry.name.startsWith('entry-') && entry.name.endsWith('.json')
    if (isCurrentEntry && expected.has(entry.name)) return []
    return [rm(join(entriesRoot, entry.name), { force: true })]
  }))
}

async function acquireProcessorLock(processedDataRoot: string): Promise<() => Promise<void>> {
  const lockPath = join(processedDataRoot, '.processor-run.lock')
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, 'wx')
      await handle.writeFile(JSON.stringify({
        createdAt: new Date().toISOString(),
        host: hostname(),
        pid: process.pid,
      }))
      return async () => {
        await handle.close().catch(() => undefined)
        await rm(lockPath, { force: true }).catch(() => undefined)
      }
    } catch (error) {
      if (!isAlreadyExists(error) || attempt > 0 || !(await isStaleProcessorLock(lockPath))) {
        throw new Error(`Processor is already running for ${processedDataRoot}`, { cause: error })
      }
      await rm(lockPath, { force: true })
    }
  }

  throw new Error(`Processor is already running for ${processedDataRoot}`)
}

async function isStaleProcessorLock(lockPath: string): Promise<boolean> {
  try {
    const lock = JSON.parse(await readFile(lockPath, 'utf8')) as {
      createdAt?: unknown
      host?: unknown
      pid?: unknown
    }
    if (lock.host === hostname() && Number.isInteger(lock.pid)) {
      try {
        process.kill(lock.pid as number, 0)
        return false
      } catch (error) {
        if (isNoSuchProcess(error)) return true
        return false
      }
    }
    const createdAt = typeof lock.createdAt === 'string' ? Date.parse(lock.createdAt) : Number.NaN
    return Number.isFinite(createdAt) && Date.now() - createdAt > 24 * 60 * 60 * 1000
  } catch {
    const metadata = await stat(lockPath).catch(() => null)
    return metadata !== null && Date.now() - metadata.mtimeMs > 24 * 60 * 60 * 1000
  }
}

function getCacheEntryPath(cacheRoot: string, relativePath: string): string {
  const key = createHash('sha256').update(relativePath).digest('hex')
  return join(cacheRoot, CACHE_ENTRY_DIRECTORY_NAME, `entry-${key}.json`)
}

function createRawRootKey(rawRoot: string): string {
  return createHash('sha256').update(resolve(rawRoot)).digest('hex')
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
      { records: source.dailyHealthMetrics },
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

function assertNotSameRoot(root: string, candidate: string, label: string): void {
  if (resolve(root) === resolve(candidate)) {
    throw new Error(`${label} must not equal ${root}`)
  }
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    String((error as { code?: unknown }).code) === 'ENOENT'
  )
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    String((error as { code?: unknown }).code) === 'EEXIST'
}

function isNoSuchProcess(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    String((error as { code?: unknown }).code) === 'ESRCH'
}
