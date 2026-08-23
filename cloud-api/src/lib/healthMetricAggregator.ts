import { createHash } from 'node:crypto'
import type { HealthMetricRecordDocument } from '../types/firestore.js'

type RawRecord = Record<string, unknown>

export type HealthMetricAggregationResult = {
  records: HealthMetricRecordDocument[]
  targetMetricCount: number
  skippedMetricCount: number
  rejectedRowCount: number
}

type TargetMetricName = Extract<
  HealthMetricRecordDocument['metricName'],
  'active_energy' | 'step_count' | 'walking_running_distance'
>

type AggregateKey = {
  date: string
  metricName: TargetMetricName
  sourceKey: string
}

type AggregateBucket = AggregateKey & {
  sourceName?: string
  sourceRowCount: number
  sourceFiles: Set<string>
  value: number
}

const TARGET_METRICS: TargetMetricName[] = [
  'step_count',
  'walking_running_distance',
  'active_energy',
]

const METRIC_UNITS: Record<TargetMetricName, HealthMetricRecordDocument['unit']> = {
  step_count: 'count',
  walking_running_distance: 'distance_raw',
  active_energy: 'energy_raw',
}

export function aggregateHealthAutoExportMetrics({
  input,
  runId,
  sourceFile,
  userId,
}: {
  input: unknown
  runId: string
  sourceFile: string
  userId: string
}): HealthMetricAggregationResult {
  const metrics = getMetrics(input)

  if (!metrics) {
    return {
      records: [],
      targetMetricCount: 0,
      skippedMetricCount: 0,
      rejectedRowCount: 0,
    }
  }

  const buckets = new Map<string, AggregateBucket>()
  let targetMetricCount = 0
  let skippedMetricCount = 0
  let rejectedRowCount = 0

  for (const metric of metrics) {
    const metricName = getString(metric.name)

    if (!metricName || metricName === 'sleep_analysis') {
      skippedMetricCount += metricName === 'sleep_analysis' ? 1 : 0
      continue
    }

    if (!isTargetMetric(metricName)) {
      skippedMetricCount += 1
      continue
    }

    targetMetricCount += 1

    if (!Array.isArray(metric.data)) {
      rejectedRowCount += 1
      continue
    }

    for (const row of metric.data) {
      if (!isRecord(row)) {
        rejectedRowCount += 1
        continue
      }

      const date = toTokyoDate(getString(row.date))
      const qty = getNumber(row.qty)

      if (!date || qty === null) {
        rejectedRowCount += 1
        continue
      }

      const sourceName = getString(row.source)
      const sourceKey = sourceName ? toSourceKey(sourceName) : 'unknown_source'
      const key = buildAggregateKey({ date, metricName, sourceKey })
      const existing =
        buckets.get(key) ??
        ({
          date,
          metricName,
          sourceKey,
          ...(sourceName ? { sourceName } : {}),
          sourceRowCount: 0,
          sourceFiles: new Set<string>(),
          value: 0,
        } satisfies AggregateBucket)

      existing.value += qty
      existing.sourceRowCount += 1
      existing.sourceFiles.add(sourceFile)
      buckets.set(key, existing)
    }
  }

  const records = Array.from(buckets.values()).map((bucket) =>
    toHealthMetricRecord({ bucket, runId, userId }),
  )

  return {
    records,
    targetMetricCount,
    skippedMetricCount,
    rejectedRowCount,
  }
}

export function getHealthMetricTargetMetrics(): TargetMetricName[] {
  return [...TARGET_METRICS]
}

function toHealthMetricRecord({
  bucket,
  runId,
  userId,
}: {
  bucket: AggregateBucket
  runId: string
  userId: string
}): HealthMetricRecordDocument {
  const recordId = createHealthMetricRecordId(bucket)

  return {
    recordId,
    userId,
    metricName: bucket.metricName,
    metricGroup: 'activity',
    aggregation: 'daily_total',
    granularity: 'day',
    date: bucket.date,
    windowStart: `${bucket.date}T00:00:00+09:00`,
    windowEnd: `${addDays(bucket.date, 1)}T00:00:00+09:00`,
    value: round(bucket.value, 6),
    unit: METRIC_UNITS[bucket.metricName],
    sourceFormat: 'health_auto_export_json',
    sourceKey: bucket.sourceKey,
    ...(bucket.sourceName ? { sourceName: bucket.sourceName } : {}),
    sourceRowCount: bucket.sourceRowCount,
    sourceFileCount: bucket.sourceFiles.size,
    runId,
  }
}

function getMetrics(input: unknown): RawRecord[] | null {
  if (Array.isArray(input)) {
    return input.filter(isRecord)
  }

  if (!isRecord(input)) {
    return null
  }

  if (Array.isArray(input.metrics)) {
    return input.metrics.filter(isRecord)
  }

  if (isRecord(input.data) && Array.isArray(input.data.metrics)) {
    return input.data.metrics.filter(isRecord)
  }

  return null
}

function isTargetMetric(metricName: string): metricName is TargetMetricName {
  return TARGET_METRICS.includes(metricName as TargetMetricName)
}

function buildAggregateKey(input: AggregateKey): string {
  return [input.metricName, input.date, input.sourceKey].join('|')
}

function createHealthMetricRecordId(input: AggregateKey): string {
  return createHash('sha256').update(buildAggregateKey(input)).digest('hex').slice(0, 32)
}

function toTokyoDate(value: string | undefined): string | null {
  if (!value) {
    return null
  }

  const parsed = new Date(normalizeDate(value))

  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return formatTokyoDate(parsed)
}

function normalizeDate(value: string): string {
  const raw = value.trim()
  const dateOnlyMatch = raw.match(/^(\d{4}-\d{2}-\d{2})$/)

  if (dateOnlyMatch) {
    return `${dateOnlyMatch[1]}T00:00:00+09:00`
  }

  const dateTimeMatch = raw.match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:\s*(Z)|\s*([+-]\d{2}):?(\d{2}))?$/,
  )

  if (dateTimeMatch) {
    const offset = dateTimeMatch[3]
      ? 'Z'
      : dateTimeMatch[4] && dateTimeMatch[5]
        ? `${dateTimeMatch[4]}:${dateTimeMatch[5]}`
        : '+09:00'

    return `${dateTimeMatch[1]}T${dateTimeMatch[2]}${offset}`
  }

  return raw
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00+09:00`)
  parsed.setUTCDate(parsed.getUTCDate() + days)

  return formatTokyoDate(parsed)
}

function formatTokyoDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  return `${year}-${month}-${day}`
}

function getNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)

    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function toSourceKey(value: string): string {
  const normalized =
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'unknown_source'

  return normalized
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits

  return Math.round(value * factor) / factor
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
