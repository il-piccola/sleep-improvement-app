export type HealthMetricAggregation = 'raw' | 'daily_summary' | 'unknown'

export type HealthMetricAggregationV2 = 'raw' | 'daily_summary' | 'mixed' | 'unknown'

export type HealthMetricDateFormat = 'date_only' | 'datetime' | 'mixed' | 'unknown'

export type HealthMetricMixedBoolean = boolean | 'mixed'

export type HealthMetricSaveCandidate = true | false | 'unknown'

export type HealthMetricRowKeyCount = {
  key: string
  count: number
}

export type HealthMetricRowShapeSummary = {
  keys: string[]
  count: number
}

export type HealthMetricFieldCandidateSummary = {
  fieldPath: string
  occurrenceCount: number
  valueTypes: string[]
}

export type HealthMetricUnitCandidateSummary = {
  fieldPath: string
  occurrenceCount: number
  unitNameSamples: string[]
}

export type HealthMetricStructureSummary = {
  rowKeyCounts: HealthMetricRowKeyCount[]
  rowShapes: HealthMetricRowShapeSummary[]
  numericFieldCandidates: HealthMetricFieldCandidateSummary[]
  unitFieldCandidates: HealthMetricUnitCandidateSummary[]
  dateFormat: HealthMetricDateFormat
  startFormat: HealthMetricDateFormat
  endFormat: HealthMetricDateFormat
  hasTimezoneOffset: HealthMetricMixedBoolean
  dateIncludesTime: HealthMetricMixedBoolean
  uniqueDateCount: number
  maxRowsPerDate: number
  avgRowsPerDate: number
  inferredAggregationV2: HealthMetricAggregationV2
  aggregationReason: string
}

export type HealthMetricAuditMetricSummary = {
  metricName: string
  handling: 'handled_as_sleep' | 'metric_audit'
  rowCount: number
  hasData: boolean
  hasStart: boolean
  hasEnd: boolean
  hasDate: boolean
  hasValue: boolean
  hasUnit: boolean
  unitSamples: string[]
  valueTypeSamples: string[]
  inferredAggregation: HealthMetricAggregation
  saveCandidate: HealthMetricSaveCandidate
  warningCount: number
  warnings: string[]
  rejectedRowCount: number
  structure?: HealthMetricStructureSummary
}

export type HealthMetricAuditSummary = {
  status: 'completed' | 'completed_with_warnings' | 'no_metrics'
  metricCount: number
  nonSleepMetricCount: number
  warningCount: number
  rejectedRowCount: number
  metrics: HealthMetricAuditMetricSummary[]
}

export type MetricAuditSummaryDocument = HealthMetricAuditSummary & {
  runId: string
  userId: string
  createdAt?: unknown
}
