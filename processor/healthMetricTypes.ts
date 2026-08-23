export type ProcessorHealthMetricName =
  | 'step_count'
  | 'walking_running_distance'
  | 'active_energy'
  | 'heart_rate'
  | 'respiratory_rate'
  | 'heart_rate_variability'

export type ProcessorHealthMetricUnit =
  | 'count'
  | 'distance_raw'
  | 'energy_raw'
  | 'bpm'
  | 'breaths_per_min'
  | 'ms_raw'

export type ProcessorHealthMetricRecord = {
  metricRecordId: string
  metricName: ProcessorHealthMetricName
  metricGroup: 'activity' | 'vitals'
  aggregation: 'daily_total' | 'sleep_window_summary'
  granularity: 'day' | 'sleep_block'
  date: string | null
  sleepDay: string | null
  sleepDayBoundaryHour: number | null
  sleepBlockId: string | null
  sleepBlockType: 'main' | 'nap' | 'evening' | 'supplemental' | 'unknown' | null
  isMainSleep: boolean | null
  windowStart: string
  windowEnd: string
  timeZone: string
  value: number | null
  valueAvg: number | null
  valueMin: number | null
  valueMax: number | null
  valueCount: number | null
  unit: ProcessorHealthMetricUnit
  sourceKey: string
  sourceName?: string
  sourceFileCount: number
  sourceRowCount: number
}

export type ProcessorMetricAggregationResult = {
  records: ProcessorHealthMetricRecord[]
  targetMetricCount: number
  skippedMetricCount: number
  rejectedRowCount: number
}

export type RawHealthMetricRecord = Record<string, unknown>

export function getRawHealthMetrics(input: unknown): RawHealthMetricRecord[] | null {
  if (Array.isArray(input)) {
    return input.filter(isRawHealthMetricRecord)
  }

  if (!isRawHealthMetricRecord(input)) {
    return null
  }

  if (Array.isArray(input.metrics)) {
    return input.metrics.filter(isRawHealthMetricRecord)
  }

  if (isRawHealthMetricRecord(input.data) && Array.isArray(input.data.metrics)) {
    return input.data.metrics.filter(isRawHealthMetricRecord)
  }

  return null
}

export function getMetricString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function getMetricNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export function toMetricSourceKey(value: string | undefined): string {
  if (!value) return 'unknown_source'

  return (
    value
      .trim()
      .toLowerCase()
      .normalize('NFKC')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'unknown_source'
  )
}

export function roundMetric(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function isRawHealthMetricRecord(value: unknown): value is RawHealthMetricRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
