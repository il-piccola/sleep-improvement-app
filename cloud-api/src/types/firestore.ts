export type IngestBatchStatus = 'received' | 'completed' | 'completed_with_warnings'

export type IngestBatchDocument = {
  batchId: string
  receivedAt: string
  source: 'health_auto_export'
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
