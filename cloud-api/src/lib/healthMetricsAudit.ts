import type {
  HealthMetricAggregation,
  HealthMetricAggregationV2,
  HealthMetricAuditMetricSummary,
  HealthMetricAuditSummary,
  HealthMetricDateFormat,
  HealthMetricFieldCandidateSummary,
  HealthMetricMixedBoolean,
  HealthMetricRowShapeSummary,
  HealthMetricSaveCandidate,
  HealthMetricStructureSummary,
  HealthMetricUnitCandidateSummary,
} from '../types/healthMetrics.js'

type RawRecord = Record<string, unknown>

type MetricFieldStats = {
  hasStart: boolean
  hasEnd: boolean
  hasDate: boolean
  hasValue: boolean
  hasUnit: boolean
  unitSamples: string[]
  valueTypeSamples: string[]
  rejectedRowCount: number
}

type HealthMetricAuditOptions = {
  includeStructure?: boolean
}

const SAMPLE_LIMIT = 5
const WARNING_LIMIT = 10
const ROW_SHAPE_LIMIT = 5
const STRUCTURE_ITEM_LIMIT = 20

const VALUE_CANDIDATE_FIELDS = [
  'value',
  'qty',
  'quantity',
  'amount',
  'count',
  'sum',
  'total',
  'average',
  'avg',
  'min',
  'max',
  'bpm',
  'beatsPerMinute',
  'doubleValue',
  'numericValue',
  'valueNumeric',
  'HKQuantity',
]

const UNIT_CANDIDATE_FIELDS = [
  'unit',
  'units',
  'unitString',
  'quantityType',
  'type',
  'metadata.unit',
]

const NUMERIC_FIELD_NAME_PATTERN =
  /(value|qty|quantity|amount|count|sum|total|average|avg|min|max|bpm|rate|energy|distance|duration|length|speed|percent|percentage|double|numeric)/i

const NON_NUMERIC_FIELD_NAME_PATTERN = /(date|time|source|unit|metadata|id|name|type)/i

const KNOWN_SAVE_CANDIDATE_METRICS = new Set([
  'active_energy',
  'apple_exercise_time',
  'basal_energy_burned',
  'blood_oxygen',
  'body_mass',
  'distance_walking_running',
  'heart_rate',
  'heart_rate_variability_sdnn',
  'oxygen_saturation',
  'respiratory_rate',
  'resting_heart_rate',
  'step_count',
  'walking_heart_rate_average',
])

export function auditHealthAutoExportMetrics(
  input: unknown,
  options: HealthMetricAuditOptions = {},
): HealthMetricAuditSummary {
  const metrics = getMetrics(input)

  if (!metrics) {
    return {
      status: 'no_metrics',
      metricCount: 0,
      nonSleepMetricCount: 0,
      warningCount: 1,
      rejectedRowCount: 0,
      metrics: [],
    }
  }

  const summaries = metrics.map((metric) => auditMetric(metric, options))
  const warningCount = summaries.reduce((sum, summary) => sum + summary.warningCount, 0)
  const rejectedRowCount = summaries.reduce((sum, summary) => sum + summary.rejectedRowCount, 0)

  return {
    status: warningCount > 0 ? 'completed_with_warnings' : 'completed',
    metricCount: summaries.length,
    nonSleepMetricCount: summaries.filter((summary) => summary.metricName !== 'sleep_analysis')
      .length,
    warningCount,
    rejectedRowCount,
    metrics: summaries,
  }
}

export function mergeMetricAuditSummaries(
  summaries: HealthMetricAuditSummary[],
): HealthMetricAuditSummary {
  if (summaries.length === 0) {
    return {
      status: 'no_metrics',
      metricCount: 0,
      nonSleepMetricCount: 0,
      warningCount: 0,
      rejectedRowCount: 0,
      metrics: [],
    }
  }

  const byMetric = new Map<string, HealthMetricAuditMetricSummary>()

  for (const summary of summaries) {
    for (const metric of summary.metrics) {
      const existing = byMetric.get(metric.metricName)
      byMetric.set(metric.metricName, existing ? mergeMetricSummary(existing, metric) : { ...metric })
    }
  }

  const metrics = Array.from(byMetric.values()).sort((left, right) =>
    left.metricName.localeCompare(right.metricName),
  )
  const warningCount = metrics.reduce((sum, metric) => sum + metric.warningCount, 0)
  const rejectedRowCount = metrics.reduce((sum, metric) => sum + metric.rejectedRowCount, 0)

  return {
    status: warningCount > 0 ? 'completed_with_warnings' : 'completed',
    metricCount: metrics.length,
    nonSleepMetricCount: metrics.filter((metric) => metric.metricName !== 'sleep_analysis').length,
    warningCount,
    rejectedRowCount,
    metrics,
  }
}

function auditMetric(
  metric: RawRecord,
  options: HealthMetricAuditOptions,
): HealthMetricAuditMetricSummary {
  const metricName = getString(metric.name) ?? 'unknown_metric'
  const data = Array.isArray(metric.data) ? metric.data.filter(isRecord) : []
  const warnings: string[] = []

  if (!Array.isArray(metric.data)) {
    warnings.push('data 配列が見つかりません。')
  }

  const fieldStats = data.reduce<MetricFieldStats>(
    (stats, row): MetricFieldStats => {
      const hasStart = hasAny(row, ['startDate', 'start', 'from'])
      const hasEnd = hasAny(row, ['endDate', 'end', 'to'])
      const hasDate = hasAny(row, ['date', 'day'])
      const value = getFirstDefined(row, ['value', 'qty', 'quantity', 'count', 'duration', 'amount'])
      const unit = getFirstDefined(row, ['unit', 'units'])

      stats.hasStart ||= hasStart
      stats.hasEnd ||= hasEnd
      stats.hasDate ||= hasDate
      stats.hasValue ||= value !== undefined
      stats.hasUnit ||= unit !== undefined

      if (unit !== undefined) {
        addSample(stats.unitSamples, String(unit))
      }

      if (value !== undefined) {
        addSample(stats.valueTypeSamples, getValueType(value))
      }

      if (!hasStart && !hasDate) {
        stats.rejectedRowCount += 1
      }

      return stats
    },
    {
      hasStart: false,
      hasEnd: false,
      hasDate: false,
      hasValue: false,
      hasUnit: false,
      unitSamples: [] as string[],
      valueTypeSamples: [] as string[],
      rejectedRowCount: 0,
    },
  )

  if (data.length === 0 && Array.isArray(metric.data)) {
    warnings.push('data 配列はありますが、行がありません。')
  }

  if (data.length > 0 && !fieldStats.hasValue) {
    warnings.push('value 相当の項目が見つかりません。')
  }

  return {
    metricName,
    handling: metricName === 'sleep_analysis' ? 'handled_as_sleep' : 'metric_audit',
    rowCount: data.length,
    hasData: data.length > 0,
    hasStart: fieldStats.hasStart,
    hasEnd: fieldStats.hasEnd,
    hasDate: fieldStats.hasDate,
    hasValue: fieldStats.hasValue,
    hasUnit: fieldStats.hasUnit,
    unitSamples: fieldStats.unitSamples,
    valueTypeSamples: fieldStats.valueTypeSamples,
    inferredAggregation: inferAggregation(fieldStats.hasStart, fieldStats.hasEnd, fieldStats.hasDate),
    saveCandidate: getSaveCandidate(metricName, fieldStats.hasValue),
    warningCount: warnings.length,
    warnings: warnings.slice(0, WARNING_LIMIT),
    rejectedRowCount: fieldStats.rejectedRowCount,
    ...(options.includeStructure ? { structure: auditMetricStructure(data, fieldStats) } : {}),
  }
}

function mergeMetricSummary(
  left: HealthMetricAuditMetricSummary,
  right: HealthMetricAuditMetricSummary,
): HealthMetricAuditMetricSummary {
  const warnings = mergeSamples(left.warnings, right.warnings, WARNING_LIMIT)
  const unitSamples = mergeSamples(left.unitSamples, right.unitSamples, SAMPLE_LIMIT)
  const valueTypeSamples = mergeSamples(left.valueTypeSamples, right.valueTypeSamples, SAMPLE_LIMIT)

  return {
    metricName: left.metricName,
    handling: left.handling === 'handled_as_sleep' ? 'handled_as_sleep' : right.handling,
    rowCount: left.rowCount + right.rowCount,
    hasData: left.hasData || right.hasData,
    hasStart: left.hasStart || right.hasStart,
    hasEnd: left.hasEnd || right.hasEnd,
    hasDate: left.hasDate || right.hasDate,
    hasValue: left.hasValue || right.hasValue,
    hasUnit: left.hasUnit || right.hasUnit,
    unitSamples,
    valueTypeSamples,
    inferredAggregation: mergeAggregation(left.inferredAggregation, right.inferredAggregation),
    saveCandidate: mergeSaveCandidate(left.saveCandidate, right.saveCandidate),
    warningCount: left.warningCount + right.warningCount,
    warnings,
    rejectedRowCount: left.rejectedRowCount + right.rejectedRowCount,
    ...(left.structure || right.structure
      ? { structure: mergeMetricStructure(left.structure, right.structure) }
      : {}),
  }
}

function auditMetricStructure(
  data: RawRecord[],
  fieldStats: MetricFieldStats,
): HealthMetricStructureSummary {
  const keyCounts = new Map<string, number>()
  const rowShapes = new Map<string, HealthMetricRowShapeSummary>()
  const numericCandidates = new Map<string, HealthMetricFieldCandidateSummary>()
  const unitCandidates = new Map<string, HealthMetricUnitCandidateSummary>()
  const dateFormats: HealthMetricDateFormat[] = []
  const startFormats: HealthMetricDateFormat[] = []
  const endFormats: HealthMetricDateFormat[] = []
  const timezoneOffsets: boolean[] = []
  const dateIncludesTimeValues: boolean[] = []
  const rowsByDate = new Map<string, number>()

  for (const row of data) {
    const keys = Object.keys(row).sort()
    const shapeKey = keys.join('|')
    const existingShape = rowShapes.get(shapeKey)

    if (existingShape) {
      existingShape.count += 1
    } else if (rowShapes.size < ROW_SHAPE_LIMIT) {
      rowShapes.set(shapeKey, { keys, count: 1 })
    }

    for (const key of keys) {
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1)
    }

    const flattened = flattenRecord(row)

    for (const [fieldPath, value] of flattened) {
      if (isNumericCandidateField(fieldPath, value)) {
        addFieldCandidate(numericCandidates, fieldPath, value)
      }

      if (isUnitCandidateField(fieldPath, value)) {
        addUnitCandidate(unitCandidates, fieldPath, value)
      }
    }

    collectDateShape(row, ['date', 'day'], dateFormats, timezoneOffsets, dateIncludesTimeValues)
    collectDateShape(row, ['startDate', 'start', 'from'], startFormats, timezoneOffsets)
    collectDateShape(row, ['endDate', 'end', 'to'], endFormats, timezoneOffsets)

    const dateBucket = getDateBucket(row)

    if (dateBucket) {
      rowsByDate.set(dateBucket, (rowsByDate.get(dateBucket) ?? 0) + 1)
    }
  }

  const uniqueDateCount = rowsByDate.size
  const maxRowsPerDate = Math.max(0, ...Array.from(rowsByDate.values()))
  const avgRowsPerDate =
    uniqueDateCount > 0 ? round(data.length / uniqueDateCount, 2) : 0
  const inferredAggregationV2 = inferAggregationV2({
    avgRowsPerDate,
    dateFormat: mergeDateFormats(dateFormats),
    hasDate: fieldStats.hasDate,
    hasEnd: fieldStats.hasEnd,
    hasStart: fieldStats.hasStart,
    maxRowsPerDate,
  })

  return {
    rowKeyCounts: Array.from(keyCounts.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
      .slice(0, STRUCTURE_ITEM_LIMIT),
    rowShapes: Array.from(rowShapes.values()).slice(0, ROW_SHAPE_LIMIT),
    numericFieldCandidates: Array.from(numericCandidates.values())
      .sort((left, right) => right.occurrenceCount - left.occurrenceCount)
      .slice(0, STRUCTURE_ITEM_LIMIT),
    unitFieldCandidates: Array.from(unitCandidates.values())
      .sort((left, right) => right.occurrenceCount - left.occurrenceCount)
      .slice(0, STRUCTURE_ITEM_LIMIT),
    dateFormat: mergeDateFormats(dateFormats),
    startFormat: mergeDateFormats(startFormats),
    endFormat: mergeDateFormats(endFormats),
    hasTimezoneOffset: mergeBooleans(timezoneOffsets),
    dateIncludesTime: mergeBooleans(dateIncludesTimeValues),
    uniqueDateCount,
    maxRowsPerDate,
    avgRowsPerDate,
    inferredAggregationV2,
    aggregationReason: getAggregationReason(inferredAggregationV2, {
      avgRowsPerDate,
      hasEnd: fieldStats.hasEnd,
      hasStart: fieldStats.hasStart,
      maxRowsPerDate,
      uniqueDateCount,
    }),
  }
}

function mergeMetricStructure(
  left: HealthMetricStructureSummary | undefined,
  right: HealthMetricStructureSummary | undefined,
): HealthMetricStructureSummary {
  if (!left) {
    return right as HealthMetricStructureSummary
  }

  if (!right) {
    return left
  }

  const rowKeyCounts = mergeCounts(left.rowKeyCounts, right.rowKeyCounts, 'key')
  const rowShapes = mergeRowShapes(left.rowShapes, right.rowShapes)
  const numericFieldCandidates = mergeFieldCandidates(
    left.numericFieldCandidates,
    right.numericFieldCandidates,
  )
  const unitFieldCandidates = mergeUnitCandidates(left.unitFieldCandidates, right.unitFieldCandidates)
  const uniqueDateCount = left.uniqueDateCount + right.uniqueDateCount
  const maxRowsPerDate = Math.max(left.maxRowsPerDate, right.maxRowsPerDate)
  const totalRowsEstimate = left.avgRowsPerDate * left.uniqueDateCount + right.avgRowsPerDate * right.uniqueDateCount
  const avgRowsPerDate =
    uniqueDateCount > 0 ? round(totalRowsEstimate / uniqueDateCount, 2) : 0
  const inferredAggregationV2 = mergeAggregationV2(
    left.inferredAggregationV2,
    right.inferredAggregationV2,
  )

  return {
    rowKeyCounts,
    rowShapes,
    numericFieldCandidates,
    unitFieldCandidates,
    dateFormat: mergeDateFormats([left.dateFormat, right.dateFormat]),
    startFormat: mergeDateFormats([left.startFormat, right.startFormat]),
    endFormat: mergeDateFormats([left.endFormat, right.endFormat]),
    hasTimezoneOffset: mergeMixedBooleans(left.hasTimezoneOffset, right.hasTimezoneOffset),
    dateIncludesTime: mergeMixedBooleans(left.dateIncludesTime, right.dateIncludesTime),
    uniqueDateCount,
    maxRowsPerDate,
    avgRowsPerDate,
    inferredAggregationV2,
    aggregationReason:
      inferredAggregationV2 === 'mixed'
        ? '複数ファイル間でrawと日次集計らしい形が混在しています。'
        : left.aggregationReason,
  }
}

function inferAggregation(
  hasStart: boolean,
  hasEnd: boolean,
  hasDate: boolean,
): HealthMetricAggregation {
  if (hasStart && hasEnd) {
    return 'raw'
  }

  if (hasDate && !hasStart && !hasEnd) {
    return 'daily_summary'
  }

  return 'unknown'
}

function mergeAggregation(
  left: HealthMetricAggregation,
  right: HealthMetricAggregation,
): HealthMetricAggregation {
  return left === right ? left : 'unknown'
}

function mergeAggregationV2(
  left: HealthMetricAggregationV2,
  right: HealthMetricAggregationV2,
): HealthMetricAggregationV2 {
  return left === right ? left : 'mixed'
}

function getSaveCandidate(metricName: string, hasValue: boolean): HealthMetricSaveCandidate {
  if (metricName === 'sleep_analysis') {
    return false
  }

  if (!hasValue) {
    return false
  }

  return KNOWN_SAVE_CANDIDATE_METRICS.has(metricName) ? true : 'unknown'
}

function mergeSaveCandidate(
  left: HealthMetricSaveCandidate,
  right: HealthMetricSaveCandidate,
): HealthMetricSaveCandidate {
  return left === right ? left : 'unknown'
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

function getFirstDefined(row: RawRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      return row[key]
    }
  }

  return undefined
}

function getFirstDefinedWithKey(row: RawRecord, keys: string[]): [string, unknown] | undefined {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      return [key, row[key]]
    }
  }

  return undefined
}

function hasAny(row: RawRecord, keys: string[]): boolean {
  return keys.some((key) => row[key] !== undefined && row[key] !== null)
}

function addSample(samples: string[], value: string): void {
  if (samples.length < SAMPLE_LIMIT && !samples.includes(value)) {
    samples.push(value)
  }
}

function mergeSamples(left: string[], right: string[], limit: number): string[] {
  const values: string[] = []

  for (const value of [...left, ...right]) {
    if (values.length >= limit) {
      break
    }

    if (!values.includes(value)) {
      values.push(value)
    }
  }

  return values
}

function getValueType(value: unknown): string {
  if (Array.isArray(value)) {
    return 'array'
  }

  if (value === null) {
    return 'null'
  }

  return typeof value
}

function flattenRecord(row: RawRecord, prefix = '', depth = 0): Array<[string, unknown]> {
  const entries: Array<[string, unknown]> = []

  for (const [key, value] of Object.entries(row)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key
    entries.push([fieldPath, value])

    if (depth < 2 && isRecord(value)) {
      entries.push(...flattenRecord(value, fieldPath, depth + 1))
    }
  }

  return entries
}

function isNumericCandidateField(fieldPath: string, value: unknown): boolean {
  const fieldName = fieldPath.split('.').at(-1) ?? fieldPath
  const explicitlyAllowed = VALUE_CANDIDATE_FIELDS.includes(fieldName)
  const numericName =
    NUMERIC_FIELD_NAME_PATTERN.test(fieldName) && !NON_NUMERIC_FIELD_NAME_PATTERN.test(fieldName)

  return (explicitlyAllowed || numericName) && isPrimitiveValue(value)
}

function isUnitCandidateField(fieldPath: string, value: unknown): boolean {
  return UNIT_CANDIDATE_FIELDS.includes(fieldPath) && typeof value === 'string' && value.trim() !== ''
}

function isPrimitiveValue(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value)
}

function addFieldCandidate(
  candidates: Map<string, HealthMetricFieldCandidateSummary>,
  fieldPath: string,
  value: unknown,
): void {
  const existing =
    candidates.get(fieldPath) ??
    ({
      fieldPath,
      occurrenceCount: 0,
      valueTypes: [],
    } satisfies HealthMetricFieldCandidateSummary)

  existing.occurrenceCount += 1
  addSample(existing.valueTypes, getValueType(value))
  candidates.set(fieldPath, existing)
}

function addUnitCandidate(
  candidates: Map<string, HealthMetricUnitCandidateSummary>,
  fieldPath: string,
  value: unknown,
): void {
  const existing =
    candidates.get(fieldPath) ??
    ({
      fieldPath,
      occurrenceCount: 0,
      unitNameSamples: [],
    } satisfies HealthMetricUnitCandidateSummary)

  existing.occurrenceCount += 1
  addSample(existing.unitNameSamples, String(value))
  candidates.set(fieldPath, existing)
}

function collectDateShape(
  row: RawRecord,
  keys: string[],
  formats: HealthMetricDateFormat[],
  timezoneOffsets: boolean[],
  includesTime?: boolean[],
): void {
  const found = getFirstDefinedWithKey(row, keys)

  if (!found) {
    return
  }

  const value = String(found[1])
  formats.push(getDateFormat(value))
  timezoneOffsets.push(hasTimezone(value))

  if (includesTime) {
    includesTime.push(includesTimePart(value))
  }
}

function getDateBucket(row: RawRecord): string | undefined {
  const found = getFirstDefinedWithKey(row, ['date', 'day', 'startDate', 'start', 'from'])

  if (!found) {
    return undefined
  }

  const value = String(found[1])
  const dateMatch = value.match(/^(\d{4}-\d{2}-\d{2})/)

  return dateMatch?.[1]
}

function getDateFormat(value: string): HealthMetricDateFormat {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return 'date_only'
  }

  if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(value)) {
    return 'datetime'
  }

  return 'unknown'
}

function hasTimezone(value: string): boolean {
  return /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
}

function includesTimePart(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(value)
}

function mergeDateFormats(formats: HealthMetricDateFormat[]): HealthMetricDateFormat {
  const known = formats.filter((format) => format !== 'unknown')

  if (known.length === 0) {
    return 'unknown'
  }

  return known.every((format) => format === known[0]) ? known[0] : 'mixed'
}

function mergeBooleans(values: boolean[]): HealthMetricMixedBoolean {
  if (values.length === 0) {
    return false
  }

  return values.every((value) => value === values[0]) ? values[0] : 'mixed'
}

function mergeMixedBooleans(
  left: HealthMetricMixedBoolean,
  right: HealthMetricMixedBoolean,
): HealthMetricMixedBoolean {
  if (left === 'mixed' || right === 'mixed') {
    return 'mixed'
  }

  return left === right ? left : 'mixed'
}

function inferAggregationV2(input: {
  avgRowsPerDate: number
  dateFormat: HealthMetricDateFormat
  hasDate: boolean
  hasEnd: boolean
  hasStart: boolean
  maxRowsPerDate: number
}): HealthMetricAggregationV2 {
  if (input.hasStart && input.hasEnd) {
    return 'raw'
  }

  if (!input.hasDate) {
    return 'unknown'
  }

  if (input.dateFormat === 'datetime') {
    return 'raw'
  }

  if (input.maxRowsPerDate <= 1) {
    return 'daily_summary'
  }

  if (input.maxRowsPerDate > 24 || input.avgRowsPerDate > 2) {
    return 'raw'
  }

  return 'mixed'
}

function getAggregationReason(
  aggregation: HealthMetricAggregationV2,
  input: {
    avgRowsPerDate: number
    hasEnd: boolean
    hasStart: boolean
    maxRowsPerDate: number
    uniqueDateCount: number
  },
): string {
  if (aggregation === 'raw' && input.hasStart && input.hasEnd) {
    return 'start/endが揃っているためraw時系列として扱う候補です。'
  }

  if (aggregation === 'raw') {
    return '同じ日付に複数行が多く、日次集計ではなくraw時系列の可能性があります。'
  }

  if (aggregation === 'daily_summary') {
    return '日付ごとの行数が少ないため日次集計として扱う候補です。'
  }

  if (aggregation === 'mixed') {
    return '日次集計とraw時系列のどちらにも見える行密度です。'
  }

  return `日付情報が不足しているため判定できません。uniqueDateCount=${input.uniqueDateCount}, maxRowsPerDate=${input.maxRowsPerDate}, avgRowsPerDate=${input.avgRowsPerDate}`
}

function mergeCounts<T extends { count: number }>(
  left: T[],
  right: T[],
  keyName: keyof T,
): T[] {
  const merged = new Map<string, T>()

  for (const item of [...left, ...right]) {
    const key = String(item[keyName])
    const existing = merged.get(key)
    merged.set(key, existing ? { ...existing, count: existing.count + item.count } : { ...item })
  }

  return Array.from(merged.values())
    .sort((first, second) => second.count - first.count)
    .slice(0, STRUCTURE_ITEM_LIMIT)
}

function mergeRowShapes(
  left: HealthMetricRowShapeSummary[],
  right: HealthMetricRowShapeSummary[],
): HealthMetricRowShapeSummary[] {
  const merged = new Map<string, HealthMetricRowShapeSummary>()

  for (const shape of [...left, ...right]) {
    const key = shape.keys.join('|')
    const existing = merged.get(key)
    merged.set(
      key,
      existing ? { ...existing, count: existing.count + shape.count } : { ...shape },
    )
  }

  return Array.from(merged.values())
    .sort((first, second) => second.count - first.count)
    .slice(0, ROW_SHAPE_LIMIT)
}

function mergeFieldCandidates(
  left: HealthMetricFieldCandidateSummary[],
  right: HealthMetricFieldCandidateSummary[],
): HealthMetricFieldCandidateSummary[] {
  const merged = new Map<string, HealthMetricFieldCandidateSummary>()

  for (const candidate of [...left, ...right]) {
    const existing = merged.get(candidate.fieldPath)
    merged.set(
      candidate.fieldPath,
      existing
        ? {
            fieldPath: existing.fieldPath,
            occurrenceCount: existing.occurrenceCount + candidate.occurrenceCount,
            valueTypes: mergeSamples(existing.valueTypes, candidate.valueTypes, SAMPLE_LIMIT),
          }
        : { ...candidate },
    )
  }

  return Array.from(merged.values())
    .sort((first, second) => second.occurrenceCount - first.occurrenceCount)
    .slice(0, STRUCTURE_ITEM_LIMIT)
}

function mergeUnitCandidates(
  left: HealthMetricUnitCandidateSummary[],
  right: HealthMetricUnitCandidateSummary[],
): HealthMetricUnitCandidateSummary[] {
  const merged = new Map<string, HealthMetricUnitCandidateSummary>()

  for (const candidate of [...left, ...right]) {
    const existing = merged.get(candidate.fieldPath)
    merged.set(
      candidate.fieldPath,
      existing
        ? {
            fieldPath: existing.fieldPath,
            occurrenceCount: existing.occurrenceCount + candidate.occurrenceCount,
            unitNameSamples: mergeSamples(
              existing.unitNameSamples,
              candidate.unitNameSamples,
              SAMPLE_LIMIT,
            ),
          }
        : { ...candidate },
    )
  }

  return Array.from(merged.values())
    .sort((first, second) => second.occurrenceCount - first.occurrenceCount)
    .slice(0, STRUCTURE_ITEM_LIMIT)
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
