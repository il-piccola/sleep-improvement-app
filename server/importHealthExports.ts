import { readFile } from 'node:fs/promises'
import type { HealthAutoExportAuditResult } from '../src/lib/importers/importTypes.ts'
import {
  auditHealthAutoExportJson,
  getSleepAnalysisRows,
  parseHealthAutoExportJson,
} from '../src/lib/importers/healthAutoExportJsonAuditor.ts'
import { normalizeHealthAutoExportSleepRows } from '../src/lib/importers/healthAutoExportJsonNormalizer.ts'
import type { HealthStoreState } from './healthStore.ts'
import { mergeAndAnalyzeSleepRecords } from './healthStore.ts'

export type HealthExportImportResult = {
  filePath: string
  fileName: string
  importedAt: string
  audit: HealthAutoExportAuditResult
  state: HealthStoreState
}

export async function importHealthExportFile({
  dataDir,
  filePath,
}: {
  dataDir: string
  filePath: string
}): Promise<HealthExportImportResult> {
  const text = await readFile(filePath, 'utf8')
  const fileName = filePath.split(/[\\/]/).at(-1) ?? filePath
  const parsed = parseHealthAutoExportJson(text)

  if (!parsed.jsonReadable) {
    throw new Error('JSONではありません')
  }

  const audit = auditHealthAutoExportJson(parsed.parsed)
  const rows = getSleepAnalysisRows(parsed.parsed)
  const normalized = normalizeHealthAutoExportSleepRows(rows, fileName)
  const finalAudit: HealthAutoExportAuditResult = {
    ...audit,
    convertibleRows: normalized.records.length,
    rejectedRows: normalized.rejectedCount,
  }
  const warnings = finalAudit.messages
    .filter((message) => message.severity !== 'info')
    .map((message) => message.message)
  const state = await mergeAndAnalyzeSleepRecords({
    dataDir,
    records: normalized.records,
    sourceFile: fileName,
    warnings,
    rejectedRows: normalized.rejectedCount,
  })

  return {
    filePath,
    fileName,
    importedAt: state.latestImport?.importedAt ?? new Date().toISOString(),
    audit: finalAudit,
    state,
  }
}
