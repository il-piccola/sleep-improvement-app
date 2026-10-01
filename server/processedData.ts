import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  validateCompletedSnapshot,
  type ProcessedSnapshotManifest,
} from '../processor/snapshot.ts'
import type { SleepRecord } from '../src/types/sleep.ts'
import {
  analyzeSleepRecords,
  type HealthStoreAnalysis,
  type HealthStoreImportStats,
} from './healthStore.ts'
import {
  formatDateInTimeZone,
  parseHealthDateInTimeZone,
} from '../processor/time.ts'

export type ProcessedDataRuntime = {
  snapshotId: string
  generatedAt: string
  processorVersion: string
  processingConfig: ProcessedSnapshotManifest['processingConfig']
  records: SleepRecord[]
  analysis: HealthStoreAnalysis
  warnings: string[]
  latestImport: HealthStoreImportStats | null
  inputFiles: Array<Record<string, unknown>>
  healthMetrics: Array<Record<string, unknown>>
  sleepDays: Array<Record<string, unknown>>
  diagnostics: Record<string, unknown>
}

export type ProcessedSleepHealthContext = {
  sleepDay: string
  candidateFlags: string[]
  dataAvailability: {
    hasDailyActivityMetrics: boolean
    hasSleepWindowMetrics: boolean
    missingMetrics: string[]
  }
  sleep?: {
    sleepBlockCount?: number
  }
}

export type ProcessedDataQuery = {
  month: string | null
  days: number | null
  boundaryHour: number
}

export type ProcessedDataRange = {
  type: 'all' | 'month' | 'days'
  month: string | null
  days: number | null
  boundaryHour: number
  sleepDayCount: number
  firstSleepDay: string | null
  lastSleepDay: string | null
  recordCount?: number
  contextCount?: number
}

type RuntimeCacheEntry = {
  snapshotId: string
  runtime: ProcessedDataRuntime
}

const runtimeCache = new Map<string, RuntimeCacheEntry>()
const runtimeLoadPromises = new Map<string, Promise<ProcessedDataRuntime | null>>()
const recordSleepDayCache = new WeakMap<ProcessedDataRuntime, Map<number, Array<string | null>>>()

export async function loadLatestProcessedData(
  processedDataRoot: string,
): Promise<ProcessedDataRuntime | null> {
  const root = resolve(processedDataRoot)
  const pending = runtimeLoadPromises.get(root)
  if (pending) return pending

  const loadPromise = loadLatestProcessedDataUncached(root).finally(() => {
    runtimeLoadPromises.delete(root)
  })
  runtimeLoadPromises.set(root, loadPromise)
  return loadPromise
}

async function loadLatestProcessedDataUncached(
  processedDataRoot: string,
): Promise<ProcessedDataRuntime | null> {
  const snapshotsRoot = join(processedDataRoot, 'snapshots')
  let entries

  try {
    entries = await readdir(snapshotsRoot, { withFileTypes: true })
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }

  const snapshotNames = entries
    .filter((entry) => entry.isDirectory() && entry.name !== '.working')
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left))

  if (snapshotNames.length === 0) return null

  let lastError: unknown = null

  for (const snapshotName of snapshotNames) {
    try {
      const cached = runtimeCache.get(processedDataRoot)
      if (cached?.snapshotId === snapshotName) return cached.runtime

      const runtime = await readProcessedSnapshot(join(snapshotsRoot, snapshotName))
      // Completed snapshots are immutable. Replace the active entry atomically
      // when a new completed snapshot becomes visible; .working is never read.
      runtimeCache.set(processedDataRoot, { snapshotId: snapshotName, runtime })
      return runtime
    } catch (error) {
      lastError = error
    }
  }

  throw new Error(
    `No valid completed processed-data snapshot: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  )
}

export function parseProcessedDataQuery(
  searchParams: URLSearchParams,
  defaultBoundaryHour: number,
): { query: ProcessedDataQuery; error: null } | { query: null; error: string } {
  const monthValues = searchParams.getAll('month')
  const daysValues = searchParams.getAll('days')
  const boundaryValues = searchParams.getAll('boundaryHour')

  if (monthValues.length > 1 || daysValues.length > 1 || boundaryValues.length > 1) {
    return { query: null, error: 'month, days, and boundaryHour may only be specified once' }
  }
  if (monthValues.length > 0 && daysValues.length > 0) {
    return { query: null, error: 'month and days are mutually exclusive' }
  }

  const month = monthValues[0] ?? null
  if (month !== null && !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) {
    return { query: null, error: 'month must use YYYY-MM' }
  }

  const daysText = daysValues[0] ?? null
  let days: number | null = null
  if (daysText !== null) {
    if (!/^[1-9]\d*$/.test(daysText)) {
      return { query: null, error: 'days must be a positive integer' }
    }
    const parsed = Number(daysText)
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      return { query: null, error: 'days must be a safe positive integer' }
    }
    days = parsed
  }

  let boundaryHour = defaultBoundaryHour
  const boundaryText = boundaryValues[0] ?? null
  if (boundaryText !== null) {
    if (!/^\d+$/.test(boundaryText) || Number(boundaryText) > 23) {
      return { query: null, error: 'boundaryHour must be an integer from 0 to 23' }
    }
    boundaryHour = Number(boundaryText)
  }

  return { query: { month, days, boundaryHour }, error: null }
}

export function filterProcessedRecords(
  runtime: ProcessedDataRuntime,
  query: ProcessedDataQuery,
): { records: SleepRecord[]; range: ProcessedDataRange } {
  const recordSleepDays = getCachedRecordSleepDays(runtime, query.boundaryHour)
  // Records are the source of truth for this endpoint. Using processor sleepDays
  // here would mix the snapshot boundary with a caller supplied boundaryHour and
  // can make a days=N range include keys with no matching records.
  const availableSleepDays = getAvailableSleepDays([], recordSleepDays)
  const selectedSleepDays = selectSleepDays(availableSleepDays, query)
  const selected = new Set(selectedSleepDays)
  const records = query.month === null && query.days === null
    ? runtime.records
    : runtime.records.filter((_, index) => {
        const sleepDay = recordSleepDays[index]
        return sleepDay !== null && selected.has(sleepDay)
      })

  return {
    records,
    range: createRange(query, selectedSleepDays, { recordCount: records.length }),
  }
}

function getCachedRecordSleepDays(
  runtime: ProcessedDataRuntime,
  boundaryHour: number,
): Array<string | null> {
  let byBoundary = recordSleepDayCache.get(runtime)
  if (!byBoundary) {
    byBoundary = new Map()
    recordSleepDayCache.set(runtime, byBoundary)
  }

  const cached = byBoundary.get(boundaryHour)
  if (cached) return cached

  const sleepDays = runtime.records.map((record) =>
    getSleepDayKeyForRecord(record, runtime.processingConfig.timeZone, boundaryHour),
  )
  byBoundary.set(boundaryHour, sleepDays)
  return sleepDays
}

export function filterProcessedSleepHealthContext(
  runtime: ProcessedDataRuntime,
  query: ProcessedDataQuery,
): { days: ProcessedSleepHealthContext[]; range: ProcessedDataRange } {
  const contexts = buildProcessedSleepHealthContext(runtime)
  const availableSleepDays = contexts.map((context) => context.sleepDay)
  const selectedSleepDays = selectSleepDays(availableSleepDays, query)
  const selected = new Set(selectedSleepDays)
  const days = query.month === null && query.days === null
    ? contexts
    : contexts.filter((context) => selected.has(context.sleepDay))

  return {
    days,
    range: createRange(query, selectedSleepDays, { contextCount: days.length }),
  }
}

export function getSleepDayKeyForRecord(
  record: Pick<SleepRecord, 'start' | 'startDate' | 'end' | 'endDate'>,
  timeZone: string,
  boundaryHour: number,
): string | null {
  const value = record.start ?? record.startDate ?? record.end ?? record.endDate
  if (!value) return null
  const date = parseHealthDateInTimeZone(value, timeZone)
  if (!date) return null
  const localDate = formatDateInTimeZone(date, timeZone)
  const localHour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hour12: false,
  }).format(date)) % 24
  if (localHour >= boundaryHour) return localDate

  const previous = new Date(date.getTime())
  previous.setUTCDate(previous.getUTCDate() - 1)
  return formatDateInTimeZone(previous, timeZone)
}

async function readProcessedSnapshot(snapshotDir: string): Promise<ProcessedDataRuntime> {
  const { manifest } = await validateCompletedSnapshot(snapshotDir)
  const datasets = new Map(manifest.datasets.map((dataset) => [dataset.name, dataset]))
  const inputFiles = await readJsonlDataset(snapshotDir, datasets, 'input-files')
  const canonicalRecords = await readJsonlDataset(snapshotDir, datasets, 'sleep-records')
  const sleepDays = await readJsonlDataset(snapshotDir, datasets, 'sleep-days')
  const healthMetrics = await readJsonlDataset(snapshotDir, datasets, 'health-metrics')
  const diagnostics = await readJsonDataset(snapshotDir, datasets, 'diagnostics')
  const records = toSleepRecords(canonicalRecords)
  const analysis = analyzeSleepRecords(records)

  return {
    snapshotId: manifest.snapshotId,
    generatedAt: manifest.generatedAt,
    processorVersion: manifest.processorVersion,
    processingConfig: manifest.processingConfig,
    records,
    analysis,
    warnings: toWarnings(diagnostics),
    latestImport: toLatestImport(inputFiles, records.length, manifest.generatedAt),
    inputFiles,
    healthMetrics,
    sleepDays,
    diagnostics,
  }
}

export function buildProcessedSleepHealthContext(
  runtime: ProcessedDataRuntime,
): ProcessedSleepHealthContext[] {
  const metricNames = [
    'step_count',
    'walking_running_distance',
    'active_energy',
    'heart_rate',
    'respiratory_rate',
    'heart_rate_variability',
  ]
  const days = runtime.sleepDays
    .map((day) => optionalString(day.sleepDay))
    .filter((day): day is string => Boolean(day))

  return days.map((sleepDay) => {
    const metrics = runtime.healthMetrics.filter((metric) =>
      metric.sleepDay === sleepDay || metric.date === sleepDay,
    )
    const activityMetrics = new Set(
      metrics
        .filter((metric) => metric.aggregation === 'daily_total')
        .map((metric) => optionalString(metric.metricName))
        .filter((metric): metric is string => Boolean(metric)),
    )
    const sleepWindowMetrics = new Set(
      metrics
        .filter((metric) => metric.aggregation === 'sleep_window_summary')
        .map((metric) => optionalString(metric.metricName))
        .filter((metric): metric is string => Boolean(metric)),
    )
    const missingMetrics = metricNames.filter(
      (metric) => !activityMetrics.has(metric) && !sleepWindowMetrics.has(metric),
    )
    const blockCount = toNumber(
      runtime.sleepDays.find((day) => day.sleepDay === sleepDay)?.blockCount,
    )
    const candidateFlags = [
      ...(blockCount !== null && blockCount > 1 ? ['fragmented_sleep_candidate'] : []),
      ...(missingMetrics.length > 0 ? ['insufficient_data'] : []),
    ]

    return {
      sleepDay,
      candidateFlags,
      dataAvailability: {
        hasDailyActivityMetrics: activityMetrics.size > 0,
        hasSleepWindowMetrics: sleepWindowMetrics.size > 0,
        missingMetrics,
      },
      sleep: blockCount === null ? undefined : { sleepBlockCount: blockCount },
    }
  })
}

async function readJsonlDataset(
  snapshotDir: string,
  datasets: Map<string, ProcessedSnapshotManifest['datasets'][number]>,
  name: string,
): Promise<Array<Record<string, unknown>>> {
  const dataset = datasets.get(name)
  if (!dataset) throw new Error(`Snapshot dataset is missing: ${name}`)

  const text = await readFile(join(snapshotDir, dataset.path), 'utf8')
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return asRecord(JSON.parse(line) as unknown, `${name} line ${index + 1}`)
      } catch (error) {
        if (error instanceof Error && error.message.startsWith(`${name} line`)) throw error
        throw new Error(`Invalid JSONL in ${name} at line ${index + 1}`, { cause: error })
      }
    })
}

async function readJsonDataset(
  snapshotDir: string,
  datasets: Map<string, ProcessedSnapshotManifest['datasets'][number]>,
  name: string,
): Promise<Record<string, unknown>> {
  const dataset = datasets.get(name)
  if (!dataset) throw new Error(`Snapshot dataset is missing: ${name}`)
  return asRecord(JSON.parse(await readFile(join(snapshotDir, dataset.path), 'utf8')) as unknown, name)
}

function toSleepRecords(values: Array<Record<string, unknown>>): SleepRecord[] {
  return values.flatMap((value) => {
    const integrationStatus = optionalString(value.integrationStatus)
    if (integrationStatus === 'excluded_duplicate' || integrationStatus === 'ignored') {
      return []
    }

    const id = optionalString(value.recordId)
    const sourceKey = optionalString(value.sourceKey)
    const stage = toNormalizedStage(value.stage)
    if (!id || !sourceKey || !stage) return []

    const originalValue = optionalString(value.originalValue) ?? stage
    const start = optionalString(value.start)
    const end = optionalString(value.end)
    const sourceFileId = optionalString(value.sourceFileId)
    const sourceName = optionalString(value.sourceName)

    return [{
      id,
      value: originalValue,
      sourceFormat: optionalString(value.sourceFormat) ?? 'health_auto_export_json',
      sourceFile: sourceFileId ?? undefined,
      sourceKey,
      sourceApp: sourceName ?? undefined,
      originalValue,
      start: start ?? undefined,
      end: end ?? undefined,
      stage,
      startDate: start ?? undefined,
      endDate: end ?? undefined,
      durationMinutes: toNumber(value.durationMinutes) ?? 0,
      hasStartDate: Boolean(start),
      hasEndDate: Boolean(end),
      hasSource: true,
      source: sourceName ?? undefined,
      sourceName: sourceName ?? undefined,
      sourceKind: 'processed_data',
      sourceLabel: sourceName ?? sourceKey,
    }]
  })
}

function toLatestImport(
  inputFiles: Array<Record<string, unknown>>,
  recordCount: number,
  importedAt: string,
): HealthStoreImportStats | null {
  const processed = inputFiles
    .filter((file) => file.status === 'processed')
    .sort((left, right) => String(right.modifiedAt ?? '').localeCompare(String(left.modifiedAt ?? '')))
  const latest = processed[0]
  if (!latest && inputFiles.length === 0) return null

  return {
    importedFileName: optionalString(latest?.fileName) ?? 'processed-data snapshot',
    importedAt,
    readFileCount: inputFiles.length,
    normalizedCount: recordCount,
    newRecordCount: recordCount,
    duplicateSkippedCount: inputFiles.reduce(
      (sum, file) => sum + (file.status === 'skipped' ? 1 : 0),
      0,
    ),
    rejectedRows: inputFiles.reduce((sum, file) => sum + (toNumber(file.rejectedRowCount) ?? 0), 0),
    warningCount: inputFiles.reduce((sum, file) => sum + (toNumber(file.warningCount) ?? 0), 0),
  }
}

function toWarnings(diagnostics: Record<string, unknown>): string[] {
  const warnings = diagnostics.warnings
  if (!Array.isArray(warnings)) return []

  return warnings.flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    const record = value as Record<string, unknown>
    const code = optionalString(record.code)
    if (!code) return []
    const count = toNumber(record.count)
    return [count && count > 1 ? `${code} (${count})` : code]
  })
}

function toNormalizedStage(value: unknown): SleepRecord['stage'] | null {
  if (value === 'awake' || value === 'in_bed' || value === 'asleep' ||
    value === 'asleep_core' || value === 'asleep_rem' || value === 'asleep_deep' ||
    value === 'asleep_unspecified') {
    return value
  }

  return null
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getAvailableSleepDays(
  sleepDays: Array<Record<string, unknown>>,
  recordSleepDays: Array<string | null>,
): string[] {
  return Array.from(new Set([
    ...sleepDays.flatMap((day) => {
      const value = optionalString(day.sleepDay)
      return value ? [value] : []
    }),
    ...recordSleepDays.flatMap((day) => day ? [day] : []),
  ])).sort((left, right) => right.localeCompare(left))
}

function selectSleepDays(
  availableSleepDays: string[],
  query: ProcessedDataQuery,
): string[] {
  const sorted = Array.from(new Set(availableSleepDays)).sort((left, right) => right.localeCompare(left))
  if (query.month !== null) {
    return sorted.filter((sleepDay) => sleepDay.startsWith(`${query.month}-`))
  }
  if (query.days !== null) return sorted.slice(0, query.days)
  return sorted
}

function createRange(
  query: ProcessedDataQuery,
  selectedSleepDays: string[],
  counts: { recordCount?: number; contextCount?: number },
): ProcessedDataRange {
  return {
    type: query.month !== null ? 'month' : query.days !== null ? 'days' : 'all',
    month: query.month,
    days: query.days,
    boundaryHour: query.boundaryHour,
    sleepDayCount: selectedSleepDays.length,
    firstSleepDay: selectedSleepDays[selectedSleepDays.length - 1] ?? null,
    lastSleepDay: selectedSleepDays[0] ?? null,
    ...counts,
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    String((error as { code?: unknown }).code) === 'ENOENT'
}
