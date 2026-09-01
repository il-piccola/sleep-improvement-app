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

export async function loadLatestProcessedData(
  processedDataRoot: string,
): Promise<ProcessedDataRuntime | null> {
  const snapshotsRoot = join(resolve(processedDataRoot), 'snapshots')
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
      return await readProcessedSnapshot(join(snapshotsRoot, snapshotName))
    } catch (error) {
      lastError = error
    }
  }

  throw new Error(
    `No valid completed processed-data snapshot: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  )
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

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    String((error as { code?: unknown }).code) === 'ENOENT'
}
