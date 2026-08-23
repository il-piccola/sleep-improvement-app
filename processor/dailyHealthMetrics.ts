import { createHash } from 'node:crypto'
import type { ProcessorConfig } from './types.ts'
import {
  getMetricNumber,
  getMetricString,
  getRawHealthMetrics,
  roundMetric,
  toMetricSourceKey,
  type ProcessorHealthMetricName,
  type ProcessorHealthMetricRecord,
  type ProcessorHealthMetricUnit,
  type ProcessorMetricAggregationResult,
} from './healthMetricTypes.ts'
import { formatDateInTimeZone, getLocalDateWindow, parseHealthDateInTimeZone } from './time.ts'

type DailyMetricName = Extract<
  ProcessorHealthMetricName,
  'step_count' | 'walking_running_distance' | 'active_energy'
>

type DailyBucket = {
  date: string
  metricName: DailyMetricName
  sourceKey: string
  sourceName?: string
  sourceRowCount: number
  value: number
}

const TARGET_METRICS: DailyMetricName[] = [
  'step_count',
  'walking_running_distance',
  'active_energy',
]

const METRIC_UNITS: Record<DailyMetricName, ProcessorHealthMetricUnit> = {
  step_count: 'count',
  walking_running_distance: 'distance_raw',
  active_energy: 'energy_raw',
}

export function aggregateProcessorDailyHealthMetrics({
  input,
  config,
}: {
  input: unknown
  config: Pick<ProcessorConfig, 'timeZone'>
}): ProcessorMetricAggregationResult {
  const metrics = getRawHealthMetrics(input)
  if (!metrics) {
    return emptyResult()
  }

  const buckets = new Map<string, DailyBucket>()
  let targetMetricCount = 0
  let skippedMetricCount = 0
  let rejectedRowCount = 0

  for (const metric of metrics) {
    const metricName = getMetricString(metric.name)
    if (!metricName || metricName === 'sleep_analysis') {
      skippedMetricCount += metricName === 'sleep_analysis' ? 1 : 0
      continue
    }
    if (!isDailyMetricName(metricName)) {
      skippedMetricCount += 1
      continue
    }

    targetMetricCount += 1
    if (!Array.isArray(metric.data)) {
      rejectedRowCount += 1
      continue
    }

    for (const row of metric.data) {
      if (typeof row !== 'object' || row === null || Array.isArray(row)) {
        rejectedRowCount += 1
        continue
      }
      const raw = row as Record<string, unknown>
      const parsed = parseHealthDateInTimeZone(getMetricString(raw.date), config.timeZone)
      const qty = getMetricNumber(raw.qty)
      if (!parsed || qty === null) {
        rejectedRowCount += 1
        continue
      }

      const date = formatDateInTimeZone(parsed, config.timeZone)
      const sourceName = getMetricString(raw.source)
      const sourceKey = toMetricSourceKey(sourceName)
      const key = [metricName, date, sourceKey].join('|')
      const bucket = buckets.get(key) ?? {
        date,
        metricName,
        sourceKey,
        ...(sourceName ? { sourceName } : {}),
        sourceRowCount: 0,
        value: 0,
      }
      bucket.value += qty
      bucket.sourceRowCount += 1
      buckets.set(key, bucket)
    }
  }

  const records = Array.from(buckets.values())
    .map((bucket) => toDailyRecord(bucket, config.timeZone))
    .sort(compareMetricRecords)

  return {
    records,
    targetMetricCount,
    skippedMetricCount,
    rejectedRowCount,
  }
}

export function getProcessorDailyHealthMetricTargetMetrics(): DailyMetricName[] {
  return [...TARGET_METRICS]
}

function toDailyRecord(bucket: DailyBucket, timeZone: string): ProcessorHealthMetricRecord {
  const window = getLocalDateWindow(bucket.date, timeZone)
  const metricRecordId = createHash('sha256')
    .update(['daily_total', bucket.metricName, bucket.date, bucket.sourceKey, timeZone].join('|'))
    .digest('hex')
    .slice(0, 32)

  return {
    metricRecordId,
    metricName: bucket.metricName,
    metricGroup: 'activity',
    aggregation: 'daily_total',
    granularity: 'day',
    date: bucket.date,
    sleepDay: null,
    sleepDayBoundaryHour: null,
    sleepBlockId: null,
    sleepBlockType: null,
    isMainSleep: null,
    windowStart: window.start,
    windowEnd: window.end,
    timeZone,
    value: roundMetric(bucket.value, 6),
    valueAvg: null,
    valueMin: null,
    valueMax: null,
    valueCount: null,
    unit: METRIC_UNITS[bucket.metricName],
    sourceKey: bucket.sourceKey,
    ...(bucket.sourceName ? { sourceName: bucket.sourceName } : {}),
    sourceFileCount: 1,
    sourceRowCount: bucket.sourceRowCount,
  }
}

function isDailyMetricName(value: string): value is DailyMetricName {
  return TARGET_METRICS.includes(value as DailyMetricName)
}

function emptyResult(): ProcessorMetricAggregationResult {
  return {
    records: [],
    targetMetricCount: 0,
    skippedMetricCount: 0,
    rejectedRowCount: 0,
  }
}

function compareMetricRecords(
  left: ProcessorHealthMetricRecord,
  right: ProcessorHealthMetricRecord,
): number {
  return (
    left.windowStart.localeCompare(right.windowStart) ||
    left.metricName.localeCompare(right.metricName) ||
    left.sourceKey.localeCompare(right.sourceKey) ||
    left.metricRecordId.localeCompare(right.metricRecordId)
  )
}
