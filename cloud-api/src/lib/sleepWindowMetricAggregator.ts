import { createHash } from 'node:crypto'
import type { HealthMetricRecordDocument, SleepRecordDocument } from '../types/firestore.js'

type RawRecord = Record<string, unknown>

type TargetMetricName = Extract<
  HealthMetricRecordDocument['metricName'],
  'heart_rate' | 'heart_rate_variability' | 'respiratory_rate'
>

type SleepWindowBlock = {
  id: string
  start: string
  end: string
  sleepDay: string
  type: NonNullable<HealthMetricRecordDocument['sleepBlockType']>
  isMainSleep: boolean
}

type MetricPoint = {
  startMs: number
  endMs: number
  valueAvg: number
  valueMin: number
  valueMax: number
  sourceKey: string
  sourceName?: string
}

type WindowBucket = {
  block: SleepWindowBlock
  metricName: TargetMetricName
  sourceKey: string
  sourceName?: string
  sourceFiles: Set<string>
  valueAvgSum: number
  valueAvgCount: number
  valueMin: number
  valueMax: number
  sourceRowCount: number
}

export type SleepWindowMetricAggregationResult = {
  records: HealthMetricRecordDocument[]
  targetMetricCount: number
  skippedMetricCount: number
  rejectedRowCount: number
}

const TARGET_METRICS: TargetMetricName[] = [
  'heart_rate',
  'respiratory_rate',
  'heart_rate_variability',
]

const METRIC_UNITS: Record<TargetMetricName, HealthMetricRecordDocument['unit']> = {
  heart_rate: 'bpm',
  respiratory_rate: 'breaths_per_min',
  heart_rate_variability: 'ms_raw',
}

const MERGE_GAP_MINUTES = 30
const NAP_MAX_MINUTES = 90
const EVENING_START_HOUR = 16

export function aggregateSleepWindowMetrics({
  input,
  runId,
  sleepRecords,
  sourceFile,
  userId,
}: {
  input: unknown
  runId: string
  sleepRecords: SleepRecordDocument[]
  sourceFile: string
  userId: string
}): SleepWindowMetricAggregationResult {
  const metrics = getMetrics(input)
  const blocks = buildSleepWindowBlocks(sleepRecords)

  if (!metrics || blocks.length === 0) {
    return {
      records: [],
      targetMetricCount: 0,
      skippedMetricCount: metrics?.length ?? 0,
      rejectedRowCount: 0,
    }
  }

  const buckets = new Map<string, WindowBucket>()
  let targetMetricCount = 0
  let skippedMetricCount = 0
  let rejectedRowCount = 0

  for (const metric of metrics) {
    const metricName = getString(metric.name)

    if (!metricName || !isTargetMetric(metricName)) {
      skippedMetricCount += metricName === 'sleep_analysis' ? 0 : 1
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

      const point = toMetricPoint(metricName, row)

      if (!point) {
        rejectedRowCount += 1
        continue
      }

      for (const block of blocks) {
        const blockStart = Date.parse(block.start)
        const blockEnd = Date.parse(block.end)

        if (!Number.isFinite(blockStart) || !Number.isFinite(blockEnd)) {
          continue
        }

        if (!overlaps(point.startMs, point.endMs, blockStart, blockEnd)) {
          continue
        }

        const key = [metricName, block.id, point.sourceKey].join('|')
        const existing =
          buckets.get(key) ??
          ({
            block,
            metricName,
            sourceKey: point.sourceKey,
            ...(point.sourceName ? { sourceName: point.sourceName } : {}),
            sourceFiles: new Set<string>(),
            valueAvgSum: 0,
            valueAvgCount: 0,
            valueMin: point.valueMin,
            valueMax: point.valueMax,
            sourceRowCount: 0,
          } satisfies WindowBucket)

        existing.valueAvgSum += point.valueAvg
        existing.valueAvgCount += 1
        existing.valueMin = Math.min(existing.valueMin, point.valueMin)
        existing.valueMax = Math.max(existing.valueMax, point.valueMax)
        existing.sourceRowCount += 1
        existing.sourceFiles.add(sourceFile)
        buckets.set(key, existing)
      }
    }
  }

  return {
    records: Array.from(buckets.values()).map((bucket) =>
      toHealthMetricRecord({ bucket, runId, userId }),
    ),
    targetMetricCount,
    skippedMetricCount,
    rejectedRowCount,
  }
}

export function getSleepWindowMetricTargetMetrics(): TargetMetricName[] {
  return [...TARGET_METRICS]
}

function buildSleepWindowBlocks(records: SleepRecordDocument[]): SleepWindowBlock[] {
  const sorted = records
    .filter((record) => isSleepStage(record.stage))
    .map((record) => ({
      end: Date.parse(record.end),
      record,
      start: Date.parse(record.start),
    }))
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
    .sort((left, right) => left.start - right.start)
  const blocks: Array<{ start: number; end: number }> = []

  for (const item of sorted) {
    const previous = blocks.at(-1)

    if (previous) {
      const gapMinutes = (item.start - previous.end) / 60_000

      if (gapMinutes >= 0 && gapMinutes <= MERGE_GAP_MINUTES) {
        previous.end = Math.max(previous.end, item.end)
        continue
      }
    }

    blocks.push({ start: item.start, end: item.end })
  }

  const longest = [...blocks].sort((left, right) => right.end - right.start - (left.end - left.start))[0]

  return blocks.map((block) => {
    const start = new Date(block.start).toISOString()
    const end = new Date(block.end).toISOString()
    const durationMinutes = Math.round((block.end - block.start) / 60_000)
    const isMainSleep = Boolean(longest && block.start === longest.start && block.end === longest.end)
    const type = getSleepBlockType({ durationMinutes, isMainSleep, startMs: block.start })
    const sleepDay = getSleepDay(block.start)

    return {
      id: createSleepBlockId({ end, sleepDay, start }),
      start,
      end,
      sleepDay,
      type,
      isMainSleep,
    }
  })
}

function toMetricPoint(metricName: TargetMetricName, row: RawRecord): MetricPoint | null {
  const start = parseHealthDate(getString(row.start) ?? getString(row.startDate) ?? getString(row.date))
  const end = parseHealthDate(getString(row.end) ?? getString(row.endDate))

  if (!start) {
    return null
  }

  const startMs = start.getTime()
  const endMs = end ? end.getTime() : startMs

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null
  }

  const values = getMetricValues(metricName, row)

  if (!values) {
    return null
  }

  const sourceName = getString(row.source)
  const sourceKey = sourceName ? toSourceKey(sourceName) : 'unknown_source'

  return {
    startMs,
    endMs,
    sourceKey,
    ...(sourceName ? { sourceName } : {}),
    ...values,
  }
}

function getMetricValues(
  metricName: TargetMetricName,
  row: RawRecord,
): Pick<MetricPoint, 'valueAvg' | 'valueMax' | 'valueMin'> | null {
  if (metricName === 'heart_rate') {
    const avg = getNumber(row.Avg)
    const min = getNumber(row.Min)
    const max = getNumber(row.Max)

    if (avg === null || min === null || max === null) {
      return null
    }

    return { valueAvg: avg, valueMin: min, valueMax: max }
  }

  const value = getNumber(row.qty)

  if (value === null) {
    return null
  }

  return { valueAvg: value, valueMin: value, valueMax: value }
}

function toHealthMetricRecord({
  bucket,
  runId,
  userId,
}: {
  bucket: WindowBucket
  runId: string
  userId: string
}): HealthMetricRecordDocument {
  const recordId = createHealthMetricRecordId(bucket)

  return {
    recordId,
    userId,
    metricName: bucket.metricName,
    metricGroup: 'vitals',
    aggregation: 'sleep_window_summary',
    granularity: 'sleep_block',
    sleepDay: bucket.block.sleepDay,
    sleepBlockId: bucket.block.id,
    sleepBlockType: bucket.block.type,
    isMainSleep: bucket.block.isMainSleep,
    windowStart: bucket.block.start,
    windowEnd: bucket.block.end,
    timezone: 'Asia/Tokyo',
    valueAvg: round(bucket.valueAvgSum / bucket.valueAvgCount, 6),
    valueMin: round(bucket.valueMin, 6),
    valueMax: round(bucket.valueMax, 6),
    valueCount: bucket.valueAvgCount,
    unit: METRIC_UNITS[bucket.metricName],
    sourceFormat: 'health_auto_export_json',
    sourceKey: bucket.sourceKey,
    ...(bucket.sourceName ? { sourceName: bucket.sourceName } : {}),
    sourceRowCount: bucket.sourceRowCount,
    sourceFileCount: bucket.sourceFiles.size,
    runId,
  }
}

function getSleepBlockType(input: {
  durationMinutes: number
  isMainSleep: boolean
  startMs: number
}): NonNullable<HealthMetricRecordDocument['sleepBlockType']> {
  const hour = getTokyoHour(input.startMs)

  if (input.isMainSleep) return 'main'
  if (hour >= EVENING_START_HOUR) return 'evening'
  if (input.durationMinutes < NAP_MAX_MINUTES) return 'nap'
  return 'supplemental'
}

function getSleepDay(startMs: number): string {
  const dateParts = getTokyoDateParts(new Date(startMs))
  const boundaryDate = new Date(`${dateParts.date}T00:00:00+09:00`)

  if (dateParts.hour < 18) {
    boundaryDate.setUTCDate(boundaryDate.getUTCDate() - 1)
  }

  return formatTokyoDate(boundaryDate)
}

function getTokyoHour(value: number): number {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Asia/Tokyo',
    }).format(new Date(value)),
  )
}

function getTokyoDateParts(date: Date): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    month: '2-digit',
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0)

  return { date: `${year}-${month}-${day}`, hour }
}

function formatTokyoDate(date: Date): string {
  return getTokyoDateParts(date).date
}

function parseHealthDate(value: string | undefined): Date | null {
  if (!value) {
    return null
  }

  const normalized = normalizeDate(value)
  const parsed = new Date(normalized)

  return Number.isNaN(parsed.getTime()) ? null : parsed
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

function overlaps(startA: number, endA: number, startB: number, endB: number): boolean {
  const pointA = startA === endA

  if (pointA) {
    return startA >= startB && startA <= endB
  }

  return Math.max(startA, startB) < Math.min(endA, endB)
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

function isSleepStage(stage: SleepRecordDocument['stage']): boolean {
  return stage === 'asleep' || stage.startsWith('asleep_')
}

function createSleepBlockId(input: { end: string; sleepDay: string; start: string }): string {
  return createHash('sha256')
    .update([input.sleepDay, input.start, input.end].join('|'))
    .digest('hex')
    .slice(0, 32)
}

function createHealthMetricRecordId(input: WindowBucket): string {
  return createHash('sha256')
    .update([input.metricName, input.block.id, input.sourceKey, 'sleep_window_summary'].join('|'))
    .digest('hex')
    .slice(0, 32)
}

function toSourceKey(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'unknown_source'
  )
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
