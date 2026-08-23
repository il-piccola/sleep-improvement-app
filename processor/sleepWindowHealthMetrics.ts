import { createHash } from 'node:crypto'
import type { ClassifiedProcessorSleepBlock, ProcessorConfig } from './types.ts'
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
  type RawHealthMetricRecord,
} from './healthMetricTypes.ts'
import { parseHealthDateInTimeZone } from './time.ts'

type SleepWindowMetricName = Extract<
  ProcessorHealthMetricName,
  'heart_rate' | 'heart_rate_variability' | 'respiratory_rate'
>

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
  block: ClassifiedProcessorSleepBlock
  metricName: SleepWindowMetricName
  sourceKey: string
  sourceName?: string
  valueAvgSum: number
  valueAvgCount: number
  valueMin: number
  valueMax: number
  sourceRowCount: number
}

const TARGET_METRICS: SleepWindowMetricName[] = [
  'heart_rate',
  'respiratory_rate',
  'heart_rate_variability',
]

const METRIC_UNITS: Record<SleepWindowMetricName, ProcessorHealthMetricUnit> = {
  heart_rate: 'bpm',
  respiratory_rate: 'breaths_per_min',
  heart_rate_variability: 'ms_raw',
}

export function aggregateProcessorSleepWindowHealthMetrics({
  blocks,
  config,
  input,
}: {
  blocks: ClassifiedProcessorSleepBlock[]
  config: Pick<ProcessorConfig, 'sleepDayBoundaryHour' | 'timeZone'>
  input: unknown
}): ProcessorMetricAggregationResult {
  const metrics = getRawHealthMetrics(input)
  const usableBlocks = blocks.filter(
    (block) =>
      block.start &&
      block.end &&
      Number.isFinite(Date.parse(block.start)) &&
      Number.isFinite(Date.parse(block.end)) &&
      Date.parse(block.end) > Date.parse(block.start),
  )

  if (!metrics || usableBlocks.length === 0) {
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
    const metricName = getMetricString(metric.name)
    if (!metricName || !isSleepWindowMetricName(metricName)) {
      skippedMetricCount += metricName === 'sleep_analysis' ? 0 : 1
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

      const point = toMetricPoint(metricName, row as RawHealthMetricRecord, config.timeZone)
      if (!point) {
        rejectedRowCount += 1
        continue
      }

      for (const block of usableBlocks) {
        const blockStart = Date.parse(block.start as string)
        const blockEnd = Date.parse(block.end as string)
        if (!overlaps(point.startMs, point.endMs, blockStart, blockEnd)) continue

        const key = [metricName, block.blockId, point.sourceKey].join('|')
        const bucket = buckets.get(key) ?? {
          block,
          metricName,
          sourceKey: point.sourceKey,
          ...(point.sourceName ? { sourceName: point.sourceName } : {}),
          valueAvgSum: 0,
          valueAvgCount: 0,
          valueMin: point.valueMin,
          valueMax: point.valueMax,
          sourceRowCount: 0,
        }
        bucket.valueAvgSum += point.valueAvg
        bucket.valueAvgCount += 1
        bucket.valueMin = Math.min(bucket.valueMin, point.valueMin)
        bucket.valueMax = Math.max(bucket.valueMax, point.valueMax)
        bucket.sourceRowCount += 1
        buckets.set(key, bucket)
      }
    }
  }

  return {
    records: Array.from(buckets.values())
      .map((bucket) => toSleepWindowRecord(bucket, config))
      .sort(compareMetricRecords),
    targetMetricCount,
    skippedMetricCount,
    rejectedRowCount,
  }
}

export function getProcessorSleepWindowHealthMetricTargetMetrics(): SleepWindowMetricName[] {
  return [...TARGET_METRICS]
}

function toMetricPoint(
  metricName: SleepWindowMetricName,
  row: RawHealthMetricRecord,
  timeZone: string,
): MetricPoint | null {
  const start = parseHealthDateInTimeZone(
    getMetricString(row.start) ?? getMetricString(row.startDate) ?? getMetricString(row.date),
    timeZone,
  )
  const end = parseHealthDateInTimeZone(
    getMetricString(row.end) ?? getMetricString(row.endDate),
    timeZone,
  )
  if (!start) return null

  const startMs = start.getTime()
  const endMs = end?.getTime() ?? startMs
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null

  const values = getMetricValues(metricName, row)
  if (!values) return null
  const sourceName = getMetricString(row.source)

  return {
    startMs,
    endMs,
    sourceKey: toMetricSourceKey(sourceName),
    ...(sourceName ? { sourceName } : {}),
    ...values,
  }
}

function getMetricValues(
  metricName: SleepWindowMetricName,
  row: RawHealthMetricRecord,
): Pick<MetricPoint, 'valueAvg' | 'valueMax' | 'valueMin'> | null {
  if (metricName === 'heart_rate') {
    const valueAvg = getMetricNumber(row.Avg)
    const valueMin = getMetricNumber(row.Min)
    const valueMax = getMetricNumber(row.Max)
    if (valueAvg === null || valueMin === null || valueMax === null) return null
    return { valueAvg, valueMin, valueMax }
  }

  const value = getMetricNumber(row.qty)
  return value === null ? null : { valueAvg: value, valueMin: value, valueMax: value }
}

function toSleepWindowRecord(
  bucket: WindowBucket,
  config: Pick<ProcessorConfig, 'sleepDayBoundaryHour' | 'timeZone'>,
): ProcessorHealthMetricRecord {
  const metricRecordId = createHash('sha256')
    .update([
      'sleep_window_summary',
      bucket.metricName,
      bucket.block.blockId,
      bucket.sourceKey,
      config.timeZone,
      config.sleepDayBoundaryHour,
    ].join('|'))
    .digest('hex')
    .slice(0, 32)

  return {
    metricRecordId,
    metricName: bucket.metricName,
    metricGroup: 'vitals',
    aggregation: 'sleep_window_summary',
    granularity: 'sleep_block',
    date: null,
    sleepDay: bucket.block.sleepDay,
    sleepDayBoundaryHour: config.sleepDayBoundaryHour,
    sleepBlockId: bucket.block.blockId,
    sleepBlockType: bucket.block.blockType,
    isMainSleep: bucket.block.isMainSleep,
    windowStart: bucket.block.start as string,
    windowEnd: bucket.block.end as string,
    timeZone: config.timeZone,
    value: null,
    valueAvg: roundMetric(bucket.valueAvgSum / bucket.valueAvgCount, 6),
    valueMin: roundMetric(bucket.valueMin, 6),
    valueMax: roundMetric(bucket.valueMax, 6),
    valueCount: bucket.valueAvgCount,
    unit: METRIC_UNITS[bucket.metricName],
    sourceKey: bucket.sourceKey,
    ...(bucket.sourceName ? { sourceName: bucket.sourceName } : {}),
    sourceFileCount: 1,
    sourceRowCount: bucket.sourceRowCount,
  }
}

function overlaps(startA: number, endA: number, startB: number, endB: number): boolean {
  if (startA === endA) return startA >= startB && startA <= endB
  return Math.max(startA, startB) < Math.min(endA, endB)
}

function isSleepWindowMetricName(value: string): value is SleepWindowMetricName {
  return TARGET_METRICS.includes(value as SleepWindowMetricName)
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
