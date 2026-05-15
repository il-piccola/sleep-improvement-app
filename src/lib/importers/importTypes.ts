import type { NormalizedSleepStage, SleepRecord } from '../../types/sleep'

export type ImportStatus = 'usable' | 'needs_settings' | 'insufficient'

export type AuditSeverity = 'info' | 'warning' | 'error'

export type HealthAutoExportAuditMessage = {
  id: string
  severity: AuditSeverity
  message: string
}

export type HealthAutoExportStageCounts = Partial<Record<NormalizedSleepStage, number>>

export type HealthAutoExportSourceSummary = {
  sourceKey: string
  sourceLabel: string
  count: number
}

export type HealthAutoExportAuditResult = {
  status: ImportStatus
  statusLabel: string
  messages: HealthAutoExportAuditMessage[]
  metricsFound: boolean
  sleepAnalysisFound: boolean
  sleepAnalysisDataFound: boolean
  isNonAggregated: boolean
  isLikelyAggregated: boolean
  totalRows: number
  convertibleRows: number
  rejectedRows: number
  stageCounts: HealthAutoExportStageCounts
  dateRangeLabel: string
  hasMultipleSegmentsInOneDay: boolean
  sourceApp?: string
  sourceSummaries: HealthAutoExportSourceSummary[]
}

export type HealthAutoExportImportResult = {
  audit: HealthAutoExportAuditResult
  records: SleepRecord[]
  importStats: {
    importedFileName: string
    importedAt: string
    normalizedCount: number
    newRecordCount: number
    duplicateSkippedCount: number
    totalSavedRecordCount: number
  }
  importHistory: HealthAutoExportImportHistoryEntry[]
  normalizedFile: {
    generatedAt: string
    sourceKind: 'health_auto_export_json'
    sourceFile: string
    records: SleepRecord[]
  }
}

export type HealthAutoExportImportHistoryEntry = {
  fileName: string
  importedAt: string
  normalizedCount: number
  newRecordCount: number
  duplicateSkippedCount: number
}

export type RawHealthAutoExportMetric = {
  name?: unknown
  data?: unknown
}

export type RawHealthAutoExportRow = Record<string, unknown>
