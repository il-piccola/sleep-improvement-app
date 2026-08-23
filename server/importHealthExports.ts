import { readFile } from 'node:fs/promises'
import type { HealthAutoExportAuditResult } from '../src/lib/importers/importTypes.ts'
import { processHealthAutoExportText } from '../processor/healthAutoExport.ts'
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
  const processed = processHealthAutoExportText({
    sourceFile: fileName,
    text,
  })
  const state = await mergeAndAnalyzeSleepRecords({
    dataDir,
    records: processed.records,
    sourceFile: fileName,
    warnings: processed.warnings,
    rejectedRows: processed.rejectedRows,
  })

  return {
    filePath,
    fileName,
    importedAt: state.latestImport?.importedAt ?? new Date().toISOString(),
    audit: processed.audit,
    state,
  }
}
