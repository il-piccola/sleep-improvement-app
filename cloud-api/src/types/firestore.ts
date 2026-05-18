export type IngestBatchStatus = 'received'

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
