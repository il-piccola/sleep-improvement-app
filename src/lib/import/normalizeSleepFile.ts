import type { SleepRecord, SleepRecordValue } from '../../types/sleep'
import { resolveSleepSource } from '../source/resolveSleepSource'

export type NormalizedSleepFile = {
  generatedAt: string
  sourceKind: 'normalized-sleep-records' | 'health-auto-export-json' | 'apple-health-xml'
  inputFileName: string
  records: SleepRecord[]
  warnings: string[]
}

type UnknownRecord = Record<string, unknown>

type RecordCandidate = {
  records: UnknownRecord[]
  isAggregated: boolean
}

export function normalizeSleepFile(fileName: string, text: string): NormalizedSleepFile {
  const trimmed = text.trim()

  if (trimmed.startsWith('<')) {
    return normalizeAppleHealthXml(fileName, trimmed)
  }

  const parsed: unknown = JSON.parse(trimmed)

  if (isNormalizedSleepRecords(parsed)) {
    return normalizeKnownRecords(fileName, parsed)
  }

  return normalizeHealthAutoExportJson(fileName, parsed)
}

function normalizeKnownRecords(
  fileName: string,
  input: { generatedAt?: unknown; records: unknown[] },
): NormalizedSleepFile {
  const records = input.records
    .map((record, index) =>
      normalizeJsonRecord(record, `normalized-${index + 1}`, 'normalized_sleep_records', fileName),
    )
    .filter((record): record is SleepRecord => record !== null)
  const warnings = buildCommonWarnings(records)

  return {
    generatedAt: getString(input.generatedAt) ?? new Date().toISOString(),
    sourceKind: 'normalized-sleep-records',
    inputFileName: fileName,
    records,
    warnings,
  }
}

function normalizeHealthAutoExportJson(fileName: string, input: unknown): NormalizedSleepFile {
  const candidates = findHealthAutoExportCandidates(input)
  const detailed = candidates.find((candidate) => !candidate.isAggregated)
  const selected = detailed ?? candidates[0]

  if (!selected) {
    throw new Error('睡眠レコードを見つけられませんでした。')
  }

  const records = selected.records
    .map((record, index) =>
      normalizeJsonRecord(record, `hae-${index + 1}`, 'health_auto_export_json', fileName),
    )
    .filter((record): record is SleepRecord => record !== null)
  const warnings = buildCommonWarnings(records)

  if (selected.isAggregated) {
    warnings.unshift('Health Auto Export JSONに集計済みデータしか見つかりませんでした。時刻分析は参考値になります。')
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceKind: 'health-auto-export-json',
    inputFileName: fileName,
    records,
    warnings,
  }
}

function normalizeAppleHealthXml(fileName: string, text: string): NormalizedSleepFile {
  const parser = new DOMParser()
  const document = parser.parseFromString(text, 'application/xml')
  const parseError = document.querySelector('parsererror')

  if (parseError) {
    throw new Error('AppleヘルスXMLを解析できませんでした。')
  }

  const records = Array.from(document.querySelectorAll('Record'))
    .filter((record) => record.getAttribute('type') === 'HKCategoryTypeIdentifierSleepAnalysis')
    .map((record, index): SleepRecord | null => {
      const startDate = normalizeDateString(record.getAttribute('startDate'))
      const endDate = normalizeDateString(record.getAttribute('endDate'))
      const value = record.getAttribute('value') ?? 'HKCategoryValueSleepAnalysisAsleep'

      if (!startDate && !endDate) {
        return null
      }

      const sourceName = record.getAttribute('sourceName') ?? undefined
      const deviceName = record.getAttribute('device') ?? undefined
      const sourceBundleId = record.getAttribute('sourceBundleId') ?? undefined
      const source = resolveSleepSource({
        sourceName,
        deviceName,
        sourceBundleId,
        sourceFormat: 'apple_health_xml',
        sourceFile: fileName,
      })

      return {
        id: `apple-health-${index + 1}`,
        value,
        sourceFormat: 'apple_health_xml',
        sourceFile: fileName,
        sourceKey: source.sourceKey,
        sourceApp: source.sourceApp,
        sourceLabel: source.sourceLabel,
        startDate: startDate ?? undefined,
        endDate: endDate ?? undefined,
        durationMinutes: calculateDurationMinutes(startDate, endDate),
        hasStartDate: Boolean(startDate),
        hasEndDate: Boolean(endDate),
        hasSource: Boolean(sourceName ?? deviceName ?? sourceBundleId),
        sourceKind: sourceName ? 'present' : undefined,
        source: sourceName,
        sourceName,
        deviceName,
        sourceBundleId,
      }
    })
    .filter((record): record is SleepRecord => record !== null)

  return {
    generatedAt: new Date().toISOString(),
    sourceKind: 'apple-health-xml',
    inputFileName: fileName,
    records,
    warnings: buildCommonWarnings(records),
  }
}

function findHealthAutoExportCandidates(input: unknown): RecordCandidate[] {
  const candidates: RecordCandidate[] = []

  walk(input, (value, parentKey) => {
    if (!Array.isArray(value) || !isSleepAnalysisKey(parentKey)) {
      return
    }

    const records = value.filter(isObjectRecord)

    if (records.length > 0) {
      candidates.push({
        records,
        isAggregated: records.every(isAggregatedRecord),
      })
    }
  })

  walk(input, (value) => {
    if (!isObjectRecord(value)) {
      return
    }

    const name = getString(value.name) ?? getString(value.metric) ?? getString(value.identifier)
    const data = value.data ?? value.records ?? value.values

    if (name && isSleepAnalysisKey(name) && Array.isArray(data)) {
      const records = data.filter(isObjectRecord)

      if (records.length > 0) {
        candidates.push({
          records,
          isAggregated: records.every(isAggregatedRecord),
        })
      }
    }
  })

  return candidates.sort((left, right) => Number(left.isAggregated) - Number(right.isAggregated))
}

function normalizeJsonRecord(
  input: unknown,
  fallbackId: string,
  sourceFormat: SleepRecord['sourceFormat'],
  sourceFile: string,
): SleepRecord | null {
  if (!isObjectRecord(input)) {
    return null
  }

  const startDate = firstDate(input, ['startDate', 'start_date', 'start', 'sleepStart', 'sleep_start', 'date'])
  const endDate = firstDate(input, ['endDate', 'end_date', 'end', 'sleepEnd', 'sleep_end'])
  const durationMinutes = firstNumber(input, [
    'durationMinutes',
    'duration_minutes',
    'duration',
    'minutes',
    'qty',
    'valueNumeric',
  ])
  const value = firstString(input, ['value', 'sleepValue', 'sleep_value', 'stage', 'category'])
  const sourceKey = firstString(input, ['sourceKey', 'source_key'])
  const sourceApp = firstString(input, ['sourceApp', 'source_app'])
  const sourceName = firstString(input, ['sourceName', 'source_name', 'source'])
  const sourceKind = firstString(input, ['sourceKind', 'source_kind'])
  const deviceName = firstString(input, ['deviceName', 'device_name', 'device'])
  const sourceBundleId = firstString(input, ['sourceBundleId', 'source_bundle_id'])
  const source = resolveSleepSource({
    sourceKey,
    sourceApp,
    sourceName,
    source: firstString(input, ['source']),
    sourceKind,
    deviceName,
    sourceBundleId,
    sourceFormat,
    sourceFile,
  })
  const dayIndex = firstNumber(input, ['dayIndex', 'day_index'])
  const normalizedDuration = startDate && endDate ? calculateDurationMinutes(startDate, endDate) : durationMinutes

  if (!startDate && !endDate && !normalizedDuration) {
    return null
  }

  return {
    id: firstString(input, ['id', 'uuid']) ?? fallbackId,
    value: normalizeSleepValue(value),
    sourceFormat,
    sourceFile,
    sourceKey: source.sourceKey,
    sourceApp: source.sourceApp,
    sourceLabel: source.sourceLabel,
    startDate: startDate ?? undefined,
    endDate: endDate ?? undefined,
    durationMinutes: normalizedDuration,
    dayIndex,
    hasStartDate: Boolean(startDate),
    hasEndDate: Boolean(endDate),
    hasSource: Boolean(sourceName ?? sourceApp ?? sourceKey ?? deviceName ?? sourceBundleId ?? sourceKind),
    sourceKind: sourceKind ?? (sourceName ? 'present' : undefined),
    source: sourceName,
    sourceName,
    deviceName,
    sourceBundleId,
  }
}

function buildCommonWarnings(records: SleepRecord[]): string[] {
  const warnings: string[] = []

  if (records.length === 0) {
    warnings.push('睡眠レコードがありません。')
  }

  if (records.length > 0 && records.every((record) => !record.startDate || !record.endDate)) {
    warnings.push('開始・終了時刻がないため、夕方睡眠や睡眠中央時刻は参考値になります。')
  }

  if (!hasTodayRecord(records)) {
    warnings.push('今日の睡眠データがありません。最新日ではなく、読み込まれた範囲のデータを表示します。')
  }

  return warnings
}

function hasTodayRecord(records: SleepRecord[]): boolean {
  const todayKey = formatLocalDateKey(new Date())

  return records.some((record) => {
    const date = normalizeDateString(record.startDate ?? record.endDate)
    return date ? formatLocalDateKey(new Date(date)) === todayKey : false
  })
}

function walk(value: unknown, visitor: (value: unknown, parentKey: string) => void, parentKey = ''): void {
  visitor(value, parentKey)

  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, visitor, parentKey)
    }

    return
  }

  if (!isObjectRecord(value)) {
    return
  }

  for (const [key, child] of Object.entries(value)) {
    walk(child, visitor, key)
  }
}

function isNormalizedSleepRecords(value: unknown): value is { generatedAt?: unknown; records: unknown[] } {
  return isObjectRecord(value) && Array.isArray(value.records)
}

function isObjectRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSleepAnalysisKey(value: string): boolean {
  const normalized = value.toLowerCase().replaceAll('-', '_').replaceAll(' ', '_')
  return normalized.includes('sleep_analysis') || normalized.includes('sleepanalysis')
}

function isAggregatedRecord(record: UnknownRecord): boolean {
  const hasStart = firstDate(record, ['startDate', 'start_date', 'start', 'sleepStart', 'sleep_start'])
  const hasEnd = firstDate(record, ['endDate', 'end_date', 'end', 'sleepEnd', 'sleep_end'])
  return !hasStart || !hasEnd
}

function firstDate(record: UnknownRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = normalizeDateString(record[key])

    if (value) {
      return value
    }
  }

  return undefined
}

function firstString(record: UnknownRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = getString(record[key])

    if (value) {
      return value
    }
  }

  return undefined
}

function firstNumber(record: UnknownRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = getNumber(record[key])

    if (value !== undefined) {
      return value
    }
  }

  return undefined
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value)
  }

  return undefined
}

function normalizeSleepValue(value: string | undefined): SleepRecordValue {
  if (!value) {
    return 'HKCategoryValueSleepAnalysisAsleep'
  }

  const normalized = value.toLowerCase()

  if (normalized.includes('inbed') || normalized.includes('in_bed')) {
    return 'HKCategoryValueSleepAnalysisInBed'
  }

  if (normalized.includes('awake')) {
    return 'HKCategoryValueSleepAnalysisAwake'
  }

  if (normalized.includes('rem')) {
    return 'HKCategoryValueSleepAnalysisAsleepREM'
  }

  if (normalized.includes('deep')) {
    return 'HKCategoryValueSleepAnalysisAsleepDeep'
  }

  if (normalized.includes('core')) {
    return 'HKCategoryValueSleepAnalysisAsleepCore'
  }

  if (normalized.includes('asleep') || normalized.includes('sleep')) {
    return 'HKCategoryValueSleepAnalysisAsleep'
  }

  return value
}

function normalizeDateString(value: unknown): string | undefined {
  const raw = getString(value)

  if (!raw) {
    return undefined
  }

  const appleHealthDate = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})$/,
  )
  const normalized = appleHealthDate
    ? `${appleHealthDate[1]}-${appleHealthDate[2]}-${appleHealthDate[3]}T${appleHealthDate[4]}:${appleHealthDate[5]}:${appleHealthDate[6]}${appleHealthDate[7].slice(0, 3)}:${appleHealthDate[7].slice(3)}`
    : raw
  const date = new Date(normalized)

  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function calculateDurationMinutes(startDate: string | undefined, endDate: string | undefined): number | undefined {
  if (!startDate || !endDate) {
    return undefined
  }

  return Math.max(0, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 60_000))
}

function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
