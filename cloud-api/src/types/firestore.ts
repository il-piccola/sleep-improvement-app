export type IngestBatchStatus = 'received' | 'completed' | 'completed_with_warnings'

export type IngestBatchDocument = {
  batchId: string
  receivedAt: string
  source: 'health_auto_export' | 'health_auto_export_drive'
  requestSizeBytes: number
  status: IngestBatchStatus
  warningCount: number
  addedCount: number
  skippedDuplicateCount: number
  userId: string
  cloudRun: boolean
}

export type SleepRecordDocument = {
  recordId: string
  userId: string
  batchId: string
  start: string
  end: string
  durationMinutes: number
  stage:
    | 'awake'
    | 'in_bed'
    | 'asleep'
    | 'asleep_core'
    | 'asleep_rem'
    | 'asleep_deep'
    | 'asleep_unspecified'
  originalValue: string
  sourceKey: string
  sourceName?: string
  sourceFormat: 'health_auto_export_json'
  sourceFile: string
}

export type HealthMetricRecordDocument = {
  recordId: string
  userId: string
  metricName:
    | 'step_count'
    | 'walking_running_distance'
    | 'active_energy'
    | 'heart_rate'
    | 'respiratory_rate'
    | 'heart_rate_variability'
  metricGroup: 'activity' | 'vitals'
  aggregation: 'daily_total' | 'sleep_window_summary'
  granularity: 'day' | 'sleep_block'
  date?: string
  sleepDay?: string
  sleepDayBoundaryHour?: number
  sleepBlockId?: string
  sleepBlockType?: 'main' | 'nap' | 'supplemental' | 'evening' | 'unknown'
  isMainSleep?: boolean
  windowStart: string
  windowEnd: string
  timezone?: 'Asia/Tokyo'
  value?: number
  valueAvg?: number
  valueMin?: number
  valueMax?: number
  valueCount?: number
  unit: 'count' | 'distance_raw' | 'energy_raw' | 'bpm' | 'breaths_per_min' | 'ms_raw'
  sourceFormat: 'health_auto_export_json'
  sourceKey: string
  sourceName?: string
  sourceRowCount: number
  sourceFileCount: number
  runId: string
}

export type ProcessedDriveFileStatus = 'processed' | 'failed' | 'skipped'

export type ProcessedDriveFileDocument = {
  fileId: string
  fileName: string
  mimeType?: string
  modifiedTime?: string
  size?: string
  md5Checksum?: string
  sha256?: string
  status: ProcessedDriveFileStatus
  batchId?: string
  processedAt?: string
  errorSummary?: string
  addedCount: number
  skippedDuplicateCount: number
  warningCount: number
  userId: string
}

export type DriveSyncRunDocument = {
  runId: string
  userId: string
  startedAt: string
  completedAt: string
  status: 'completed' | 'completed_with_warnings'
  listedFileCount: number
  checkedFiles: number
  processedFiles: number
  skippedAlreadyProcessed: number
  failedFiles: number
  addedCount: number
  skippedDuplicateCount: number
  warningCount: number
  rejectedRows: number
  metricAuditStatus?: 'completed' | 'completed_with_warnings' | 'no_metrics'
  metricAuditMetricCount?: number
  metricAuditWarningCount?: number
  metricAuditSummaryRef?: string
  metricAuditAuditedFileCount?: number
  metricAuditProcessedFileCount?: number
  metricAuditSkippedProcessedFileCount?: number
  healthMetricSaveStatus?: 'completed' | 'completed_with_warnings' | 'skipped'
  healthMetricSavedRecordCount?: number
  healthMetricUpdatedRecordCount?: number
  healthMetricSkippedMetricCount?: number
  healthMetricRejectedRowCount?: number
  healthMetricTargetMetrics?: string[]
  healthMetricBackfillFileCount?: number
  sleepWindowMetricSaveStatus?: 'completed' | 'completed_with_warnings' | 'skipped'
  sleepWindowMetricSavedRecordCount?: number
  sleepWindowMetricUpdatedRecordCount?: number
  sleepWindowMetricSkippedMetricCount?: number
  sleepWindowMetricRejectedRowCount?: number
  sleepWindowMetricTargetMetrics?: string[]
  sleepWindowMetricBackfillFileCount?: number
  sleepDayBoundaryHour?: number
}
