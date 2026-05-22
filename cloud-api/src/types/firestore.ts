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
}
