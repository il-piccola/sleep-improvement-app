import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type {
  DataQualityReport,
  ImprovementAction,
  SleepDaySummary,
  SleepRecord,
  SourceQualityReport,
  UnifiedSleepTimeline,
} from '../src/types/sleep.ts'
import { buildUnifiedSleepTimeline } from '../src/lib/analysis/buildUnifiedSleepTimeline.ts'
import { checkDataQuality } from '../src/lib/analysis/checkDataQuality.ts'
import { evaluateSourceQuality } from '../src/lib/analysis/evaluateSourceQuality.ts'
import { generateImprovementActions } from '../src/lib/analysis/generateImprovementActions.ts'
import { groupBySleepDay } from '../src/lib/analysis/groupBySleepDay.ts'
import { summarizeSleepDay } from '../src/lib/analysis/summarizeSleepDay.ts'
import { resolveSleepSource } from '../src/lib/source/resolveSleepSource.ts'

export type HealthStoreImportStats = {
  importedFileName: string
  importedAt: string
  readFileCount: number
  normalizedCount: number
  newRecordCount: number
  duplicateSkippedCount: number
  rejectedRows: number
  warningCount: number
}

export type HealthStoreImportHistoryEntry = HealthStoreImportStats & {
  sourceFile: string
}

export type HealthStoreAnalysis = {
  summaries: SleepDaySummary[]
  actions: ImprovementAction[]
  sourceQuality: SourceQualityReport[]
  dataQuality: DataQualityReport
  unifiedTimeline: UnifiedSleepTimeline
}

export type HealthStoreState = {
  generatedAt: string | null
  records: SleepRecord[]
  analysis: HealthStoreAnalysis | null
  importHistory: HealthStoreImportHistoryEntry[]
  latestImport: HealthStoreImportStats | null
  warnings: string[]
}

const emptyState: HealthStoreState = {
  generatedAt: null,
  records: [],
  analysis: null,
  importHistory: [],
  latestImport: null,
  warnings: [],
}

export async function loadHealthStore(dataDir: string): Promise<HealthStoreState> {
  const path = getStorePath(dataDir)

  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<HealthStoreState>
    return {
      ...emptyState,
      ...parsed,
      records: Array.isArray(parsed.records) ? parsed.records : [],
      importHistory: Array.isArray(parsed.importHistory) ? parsed.importHistory : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    }
  } catch {
    return emptyState
  }
}

export async function mergeAndAnalyzeSleepRecords({
  dataDir,
  records,
  sourceFile,
  warnings,
  rejectedRows,
}: {
  dataDir: string
  records: SleepRecord[]
  sourceFile: string
  warnings: string[]
  rejectedRows: number
}): Promise<HealthStoreState> {
  const importedAt = new Date().toISOString()
  const current = await loadHealthStore(dataDir)
  const existingKeys = new Set(current.records.flatMap(getRecordDuplicateKeys))
  const newRecords: SleepRecord[] = []
  let duplicateSkippedCount = 0

  for (const record of records) {
    const keys = getRecordDuplicateKeys(record)

    if (keys.some((key) => existingKeys.has(key))) {
      duplicateSkippedCount += 1
      continue
    }

    for (const key of keys) {
      existingKeys.add(key)
    }
    newRecords.push(record)
  }

  const allRecords = [...current.records, ...newRecords].sort(compareRecordsByStart)
  const analysis = analyzeSleepRecords(allRecords)
  const latestImport: HealthStoreImportStats = {
    importedFileName: sourceFile,
    importedAt,
    readFileCount: 1,
    normalizedCount: records.length,
    newRecordCount: newRecords.length,
    duplicateSkippedCount,
    rejectedRows,
    warningCount: warnings.length,
  }
  const importHistory = [
    {
      ...latestImport,
      sourceFile,
    },
    ...current.importHistory,
  ].slice(0, 50)
  const nextState: HealthStoreState = {
    generatedAt: importedAt,
    records: allRecords,
    analysis,
    importHistory,
    latestImport,
    warnings,
  }

  await saveHealthStore(dataDir, nextState)

  return nextState
}

export function analyzeSleepRecords(records: SleepRecord[]): HealthStoreAnalysis {
  const unifiedTimeline = buildUnifiedSleepTimeline(records)
  const groups = groupBySleepDay(unifiedTimeline.blocks)
  const summaries = groups.map((group) => summarizeSleepDay(group))
  const actions = generateImprovementActions(summaries)
  const sourceQuality = evaluateSourceQuality(records, new Date(), unifiedTimeline.overlapReport)
  const dataQuality = checkDataQuality(records)

  return {
    summaries,
    actions,
    sourceQuality,
    dataQuality,
    unifiedTimeline,
  }
}

export async function saveHealthStore(
  dataDir: string,
  state: HealthStoreState,
): Promise<void> {
  const path = getStorePath(dataDir)

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(state, null, 2), 'utf8')
}

export function getRecordDuplicateKey(record: SleepRecord): string {
  return getRecordDuplicateKeys(record)[0]
}

export function getRecordDuplicateKeys(record: SleepRecord): string[] {
  const source = resolveSleepSource(record)
  const start = record.start ?? record.startDate ?? ''
  const end = record.end ?? record.endDate ?? ''
  const stage = record.stage ?? ''
  const originalValue = record.originalValue ?? ''
  const exactKey = ['exact', source.sourceKey, start, end, stage, originalValue].join('|')

  if (!source.sourceKey.startsWith('unknown_source')) {
    return [exactKey]
  }

  return [
    exactKey,
    [
      'unknown-cross-file',
      record.sourceFormat ?? '',
      start,
      end,
      stage,
      originalValue,
    ].join('|'),
    [
      'unknown-cross-file-stage',
      record.sourceFormat ?? '',
      start,
      end,
      stage,
    ].join('|'),
    [
      'unknown-file-scoped',
      record.sourceFormat ?? '',
      record.sourceFile ?? '',
      start,
      end,
      stage,
    ].join('|'),
  ]
}

function compareRecordsByStart(left: SleepRecord, right: SleepRecord): number {
  return (
    Date.parse(left.start ?? left.startDate ?? '') -
      Date.parse(right.start ?? right.startDate ?? '') ||
    Date.parse(left.end ?? left.endDate ?? '') - Date.parse(right.end ?? right.endDate ?? '')
  )
}

function getStorePath(dataDir: string): string {
  return resolve(dataDir, 'health-store.json')
}
