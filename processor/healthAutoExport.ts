import type { HealthAutoExportAuditResult } from '../src/lib/importers/importTypes.ts'
import {
  auditHealthAutoExportJson,
  getSleepAnalysisRows,
  parseHealthAutoExportJson,
} from '../src/lib/importers/healthAutoExportJsonAuditor.ts'
import { normalizeHealthAutoExportSleepRows } from '../src/lib/importers/healthAutoExportJsonNormalizer.ts'
import type { SleepRecord } from '../src/types/sleep.ts'

export type ProcessorHealthAutoExportResult = {
  sourceFile: string
  audit: HealthAutoExportAuditResult
  records: SleepRecord[]
  rejectedRows: number
  warnings: string[]
}

export function processHealthAutoExportText({
  sourceFile,
  text,
}: {
  sourceFile: string
  text: string
}): ProcessorHealthAutoExportResult {
  const parsed = parseHealthAutoExportJson(text)

  if (!parsed.jsonReadable) {
    throw new Error('JSONではありません')
  }

  const audit = auditHealthAutoExportJson(parsed.parsed)
  const rows = getSleepAnalysisRows(parsed.parsed)
  const normalized = normalizeHealthAutoExportSleepRows(rows, sourceFile)
  const finalAudit: HealthAutoExportAuditResult = {
    ...audit,
    convertibleRows: normalized.records.length,
    rejectedRows: normalized.rejectedCount,
  }
  const warnings = finalAudit.messages
    .filter((message) => message.severity !== 'info')
    .map((message) => message.message)

  return {
    sourceFile,
    audit: finalAudit,
    records: normalized.records,
    rejectedRows: normalized.rejectedCount,
    warnings,
  }
}
