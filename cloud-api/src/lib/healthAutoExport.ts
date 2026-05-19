import { createHash } from 'node:crypto'
import type { SleepRecordDocument } from '../types/firestore.js'

type RawRecord = Record<string, unknown>

type NormalizedStage = SleepRecordDocument['stage']

export type HealthAutoExportImportResult = {
  records: SleepRecordDocument[]
  warnings: string[]
  totalRows: number
  rejectedRows: number
}

export function normalizeHealthAutoExportJson({
  batchId,
  input,
  sourceFile,
  userId,
}: {
  batchId: string
  input: unknown
  sourceFile: string
  userId: string
}): HealthAutoExportImportResult {
  const warnings: string[] = []
  const metrics = getMetrics(input)

  if (!metrics) {
    return {
      records: [],
      warnings: ['Health Auto Export JSONのmetrics配列が見つかりません。'],
      totalRows: 0,
      rejectedRows: 0,
    }
  }

  const sleepMetric = metrics.find((metric) => metric.name === 'sleep_analysis')

  if (!sleepMetric) {
    return {
      records: [],
      warnings: ['sleep_analysis が見つかりません。Health Auto Exportの睡眠分析を書き出してください。'],
      totalRows: 0,
      rejectedRows: 0,
    }
  }

  if (!Array.isArray(sleepMetric.data)) {
    return {
      records: [],
      warnings: ['sleep_analysis の data が見つかりません。'],
      totalRows: 0,
      rejectedRows: 0,
    }
  }

  const rows = sleepMetric.data.filter(isRecord)
  const records: SleepRecordDocument[] = []
  let rejectedRows = 0

  for (const row of rows) {
    const normalized = normalizeSleepRow({
      batchId,
      row,
      sourceFile,
      userId,
    })

    if (!normalized) {
      rejectedRows += 1
      continue
    }

    records.push(normalized)
  }

  if (rejectedRows > 0) {
    warnings.push(`startDate / endDate / value が不足または未対応の行が${rejectedRows}件あります。`)
  }

  if (records.length === 0 && rows.length > 0) {
    warnings.push('sleep_analysis は見つかりましたが、保存できる睡眠レコードがありません。')
  }

  return {
    records,
    warnings,
    totalRows: rows.length,
    rejectedRows,
  }
}

function normalizeSleepRow({
  batchId,
  row,
  sourceFile,
  userId,
}: {
  batchId: string
  row: RawRecord
  sourceFile: string
  userId: string
}): SleepRecordDocument | null {
  const start = normalizeDate(getString(row.startDate))
  const end = normalizeDate(getString(row.endDate))
  const originalValue = getString(row.value)
  const stage = normalizeStage(originalValue)

  if (!start || !end || !originalValue || !stage) {
    return null
  }

  const startDate = new Date(start)
  const endDate = new Date(end)

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null
  }

  const sourceName = getString(row.sourceName) ?? getString(row.source)
  const sourceKey = resolveSourceKey({
    sourceName,
    sourceApp: getString(row.sourceApp),
    source: getString(row.source),
    sourceKind: getString(row.sourceKind),
    deviceName: getString(row.deviceName),
    sourceBundleId: getString(row.sourceBundleId),
  })
  const durationMinutes = Math.max(
    0,
    Math.round((endDate.getTime() - startDate.getTime()) / 60_000),
  )
  const recordId = createRecordId({
    end,
    originalValue,
    sourceKey,
    stage,
    start,
  })

  return {
    recordId,
    userId,
    batchId,
    start,
    end,
    durationMinutes,
    stage,
    originalValue,
    sourceKey,
    ...(sourceName ? { sourceName } : {}),
    sourceFormat: 'health_auto_export_json',
    sourceFile,
  }
}

function getMetrics(input: unknown): RawRecord[] | null {
  if (Array.isArray(input)) {
    return input.filter(isRecord)
  }

  if (!isRecord(input)) {
    return null
  }

  if (Array.isArray(input.metrics)) {
    return input.metrics.filter(isRecord)
  }

  if (isRecord(input.data) && Array.isArray(input.data.metrics)) {
    return input.data.metrics.filter(isRecord)
  }

  return null
}

function normalizeStage(value: string | undefined): NormalizedStage | null {
  if (!value) {
    return null
  }

  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  const compact = normalized.replace(/\s+/g, '')

  if (
    normalized === 'awake' ||
    normalized === '起きている' ||
    normalized === '覚醒' ||
    compact === 'hkcategoryvaluesleepanalysisawake'
  ) {
    return 'awake'
  }

  if (
    normalized === 'in bed' ||
    normalized === 'ベッド' ||
    normalized === 'ベッド内' ||
    normalized === 'ベッドにいる' ||
    normalized === '就寝中' ||
    compact === 'inbed' ||
    compact === 'hkcategoryvaluesleepanalysisinbed'
  ) {
    return 'in_bed'
  }

  if (
    normalized === 'core' ||
    normalized === 'コア' ||
    compact === 'hkcategoryvaluesleepanalysisasleepcore'
  ) {
    return 'asleep_core'
  }

  if (normalized === 'rem' || compact === 'hkcategoryvaluesleepanalysisasleeprem') {
    return 'asleep_rem'
  }

  if (
    normalized === 'deep' ||
    normalized === '深い' ||
    compact === 'hkcategoryvaluesleepanalysisasleepdeep'
  ) {
    return 'asleep_deep'
  }

  if (
    normalized === 'unspecified' ||
    normalized === '未指定' ||
    compact === 'hkcategoryvaluesleepanalysisasleepunspecified'
  ) {
    return 'asleep_unspecified'
  }

  if (
    normalized === 'asleep' ||
    normalized === '睡眠' ||
    normalized === '睡眠中' ||
    normalized === '眠っている' ||
    compact === 'hkcategoryvaluesleepanalysisasleep'
  ) {
    return 'asleep'
  }

  return null
}

function normalizeDate(value: string | undefined): string | null {
  if (!value) {
    return null
  }

  const raw = value.trim()
  const appleMatch = raw.match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?\s*([+-]\d{2})(\d{2})$/,
  )

  if (appleMatch) {
    return `${appleMatch[1]}T${appleMatch[2]}${appleMatch[3]}:${appleMatch[4]}`
  }

  const isoOffsetMatch = raw.match(/^(.+)([+-]\d{2})(\d{2})$/)

  if (isoOffsetMatch && raw.includes('T')) {
    return `${isoOffsetMatch[1]}${isoOffsetMatch[2]}:${isoOffsetMatch[3]}`
  }

  if (/^\d{4}-\d{2}-\d{2} /.test(raw)) {
    return raw.replace(' ', 'T')
  }

  return raw
}

function resolveSourceKey(input: {
  sourceApp?: string
  sourceName?: string
  source?: string
  sourceKind?: string
  deviceName?: string
  sourceBundleId?: string
}): string {
  const values = [
    input.sourceApp,
    input.sourceName,
    input.source,
    input.sourceKind,
    input.deviceName,
    input.sourceBundleId,
  ].filter((value): value is string => Boolean(value))
  const joined = values.join(' ').toLowerCase()

  if (joined.includes('withings')) return 'withings'
  if (joined.includes('watch')) return 'apple_watch'
  if (joined.includes('iphone')) return 'iphone'
  if (joined.includes('manual') || joined.includes('手入力')) return 'manual'
  if (joined.includes('health')) return 'apple_health'

  const label = values[0]
  return label ? toSourceKey(label) : 'unknown_source:health_auto_export_json'
}

function createRecordId(input: {
  start: string
  end: string
  stage: string
  originalValue: string
  sourceKey: string
}): string {
  const key = [
    input.sourceKey,
    input.start,
    input.end,
    input.stage,
    input.originalValue,
  ].join('|')

  return createHash('sha256').update(key).digest('hex').slice(0, 32)
}

function toSourceKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown_source:health_auto_export_json'
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
