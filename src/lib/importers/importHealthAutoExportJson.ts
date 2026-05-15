import type { SleepRecord } from '../../types/sleep'
import type {
  HealthAutoExportImportHistoryEntry,
  HealthAutoExportImportResult,
} from './importTypes'
import {
  auditHealthAutoExportJson,
  getSleepAnalysisRows,
  parseHealthAutoExportJson,
} from './healthAutoExportJsonAuditor'
import { normalizeHealthAutoExportSleepRows } from './healthAutoExportJsonNormalizer'
import { resolveSleepSource } from '../source/resolveSleepSource'

const DB_NAME = 'sleep-improvement-app'
const DB_VERSION = 1
const STORE_NAME = 'normalizedSleepRecords'
const RECORDS_KEY = 'latest'
const HISTORY_KEY = 'history'

export async function importHealthAutoExportJson(
  fileName: string,
  text: string,
): Promise<HealthAutoExportImportResult> {
  const parsed = parseHealthAutoExportJson(text)

  if (!parsed.jsonReadable) {
    throw new Error('JSONではありません')
  }

  const audit = auditHealthAutoExportJson(parsed.parsed)
  const rows = getSleepAnalysisRows(parsed.parsed)
  const normalized = normalizeHealthAutoExportSleepRows(rows, fileName)
  const saved = await mergeAndSaveNormalizedSleepRecords(normalized.records, fileName)
  const finalAudit = {
    ...audit,
    convertibleRows: normalized.records.length,
    rejectedRows: normalized.rejectedCount,
  }
  const normalizedFile = {
    generatedAt: new Date().toISOString(),
    sourceKind: 'health_auto_export_json' as const,
    sourceFile: fileName,
    records: saved.records,
  }

  return {
    audit: finalAudit,
    records: saved.records,
    importStats: saved.stats,
    importHistory: saved.history,
    normalizedFile,
  }
}

export async function mergeAndSaveNormalizedSleepRecords(
  incomingRecords: SleepRecord[],
  fileName: string,
): Promise<{
  records: SleepRecord[]
  history: HealthAutoExportImportHistoryEntry[]
  stats: HealthAutoExportImportResult['importStats']
}> {
  const importedAt = new Date().toISOString()
  const existingRecords = (await loadSavedNormalizedSleepRecords()) ?? []
  const existingKeys = new Set(existingRecords.map(getDuplicateKey))
  const newRecords: SleepRecord[] = []
  let duplicateSkippedCount = 0

  for (const record of incomingRecords) {
    const key = getDuplicateKey(record)

    if (existingKeys.has(key)) {
      duplicateSkippedCount += 1
      continue
    }

    existingKeys.add(key)
    newRecords.push(record)
  }

  const records = [...existingRecords, ...newRecords].sort(compareRecordsByStart)
  const historyEntry: HealthAutoExportImportHistoryEntry = {
    fileName,
    importedAt,
    normalizedCount: incomingRecords.length,
    newRecordCount: newRecords.length,
    duplicateSkippedCount,
  }
  const existingHistory = await loadImportHistory()
  const history = [historyEntry, ...existingHistory].slice(0, 20)

  await saveNormalizedSleepRecords(records, history)

  return {
    records,
    history,
    stats: {
      importedFileName: fileName,
      importedAt,
      normalizedCount: incomingRecords.length,
      newRecordCount: newRecords.length,
      duplicateSkippedCount,
      totalSavedRecordCount: records.length,
    },
  }
}

export async function saveNormalizedSleepRecords(
  records: SleepRecord[],
  history: HealthAutoExportImportHistoryEntry[] = [],
): Promise<void> {
  const database = await openDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    store.put({
      id: RECORDS_KEY,
      savedAt: new Date().toISOString(),
      records,
    })
    store.put({
      id: HISTORY_KEY,
      history,
    })
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })

  database.close()
}

export async function loadImportHistory(): Promise<HealthAutoExportImportHistoryEntry[]> {
  const database = await openDatabase()
  const result = await new Promise<{ history?: HealthAutoExportImportHistoryEntry[] } | undefined>(
    (resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(HISTORY_KEY)
      request.onsuccess = () =>
        resolve(request.result as { history?: HealthAutoExportImportHistoryEntry[] } | undefined)
      request.onerror = () => reject(request.error)
    },
  )

  database.close()
  return Array.isArray(result?.history) ? result.history : []
}

function getDuplicateKey(record: SleepRecord): string {
  return [
    record.start ?? record.startDate ?? '',
    record.end ?? record.endDate ?? '',
    record.stage ?? '',
    record.originalValue ?? '',
    resolveSleepSource(record).sourceKey,
  ].join('|')
}

function compareRecordsByStart(left: SleepRecord, right: SleepRecord): number {
  return (
    Date.parse(left.start ?? left.startDate ?? '') -
      Date.parse(right.start ?? right.startDate ?? '') ||
    Date.parse(left.end ?? left.endDate ?? '') - Date.parse(right.end ?? right.endDate ?? '')
  )
}

export async function loadSavedNormalizedSleepRecords(): Promise<SleepRecord[] | null> {
  const database = await openDatabase()
  const result = await new Promise<{ records?: SleepRecord[] } | undefined>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(RECORDS_KEY)
    request.onsuccess = () => resolve(request.result as { records?: SleepRecord[] } | undefined)
    request.onerror = () => reject(request.error)
  })

  database.close()
  return Array.isArray(result?.records) ? result.records : null
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
