import type {
  HealthAutoExportAuditMessage,
  HealthAutoExportAuditResult,
  HealthAutoExportStageCounts,
  RawHealthAutoExportMetric,
  RawHealthAutoExportRow,
} from './importTypes'
import type { NormalizedSleepStage } from '../../types/sleep'

type ParsedAuditInput = {
  parsed: unknown
  jsonReadable: boolean
}

const stagePatterns: Record<string, RegExp> = {
  Awake: /\bawake\b|HKCategoryValueSleepAnalysisAwake/i,
  Asleep: /\basleep\b|HKCategoryValueSleepAnalysisAsleep/i,
  'In Bed': /\bin\s*bed\b|inbed|HKCategoryValueSleepAnalysisInBed/i,
  Core: /\bcore\b|HKCategoryValueSleepAnalysisAsleepCore/i,
  REM: /\brem\b|HKCategoryValueSleepAnalysisAsleepREM/i,
  Deep: /\bdeep\b|HKCategoryValueSleepAnalysisAsleepDeep/i,
  Unspecified: /\bunspecified\b|HKCategoryValueSleepAnalysisAsleepUnspecified/i,
}

export function parseHealthAutoExportJson(text: string): ParsedAuditInput {
  try {
    return {
      parsed: JSON.parse(text) as unknown,
      jsonReadable: true,
    }
  } catch {
    return {
      parsed: null,
      jsonReadable: false,
    }
  }
}

export function auditHealthAutoExportJson(input: unknown): HealthAutoExportAuditResult {
  if (!isRecord(input) && !Array.isArray(input)) {
    return buildResult({
      messages: [error('not-json-object', 'JSONではありません。Health Auto ExportのJSONファイルを選んでください。')],
    })
  }

  const metrics = isRecord(input) && Array.isArray(input.metrics)
    ? input.metrics.filter(isRecord)
    : null

  if (!metrics) {
    const directMetric = getSleepMetric(input)

    if (!directMetric) {
      return buildResult({
        messages: [error('no-metrics', 'metrics 配列が見つかりません。Health Auto Export JSONか確認してください。')],
      })
    }

    return auditSleepMetric({
      metric: directMetric,
      metricsCount: 0,
      metricsFound: false,
      messages: [
        warning(
          'no-metrics-direct-sleep-analysis',
          'metrics 配列はありませんが、sleep_analysis 相当のデータを見つけました。',
        ),
      ],
      root: input,
    })
  }

  const sleepMetric = getSleepMetric(input)

  if (!sleepMetric) {
    return buildResult({
      messages: [
        info('metrics-found', `metrics 配列は見つかりました。metric数は${metrics.length}件です。`),
        error('no-sleep-analysis', 'sleep_analysis が見つかりません。Health Auto Exportの睡眠項目を書き出してください。'),
      ],
      metricsFound: true,
    })
  }

  return auditSleepMetric({
    metric: sleepMetric,
    metricsCount: metrics.length,
    metricsFound: true,
    messages: [info('metrics-found', `metrics 配列を確認しました。metric数は${metrics.length}件です。`)],
    root: input,
  })
}

function auditSleepMetric({
  metric,
  metricsFound,
  metricsCount,
  messages,
  root,
}: {
  metric: RawHealthAutoExportMetric
  metricsFound: boolean
  metricsCount: number
  messages: HealthAutoExportAuditMessage[]
  root: unknown
}): HealthAutoExportAuditResult {
  if (!Array.isArray(metric.data)) {
    return buildResult({
      messages: [
        ...messages,
        info(
          'sleep-analysis-found',
          metricsCount > 0 ? 'sleep_analysis は見つかりました。' : 'sleep_analysis 相当の項目は見つかりました。',
        ),
        error('no-sleep-data', 'sleep_analysis の data が見つかりません。'),
      ],
      metricsFound,
      sleepAnalysisFound: true,
    })
  }

  const rows = metric.data.filter(isRecord)
  const rowAudits = rows.map(auditRow)
  const convertibleRows = rowAudits.filter((row) => row.convertible).length
  const rejectedRows = rows.length - convertibleRows
  const stageCounts = countStages(rowAudits.map((row) => row.stage))
  const hasFullDateRows = rowAudits.some((row) => row.hasStartDate && row.hasEndDate)
  const isLikelyAggregated = rows.length > 0 && convertibleRows === 0 && !hasFullDateRows
  const dateRangeLabel = formatDateRange(rowAudits.flatMap((row) => row.dates))
  const hasMultipleSegmentsInOneDay = detectMultipleSegmentsInOneDay(rowAudits)
  const fieldPresence = {
    startDate: rows.some((row) => Object.prototype.hasOwnProperty.call(row, 'startDate')),
    endDate: rows.some((row) => Object.prototype.hasOwnProperty.call(row, 'endDate')),
    qty: rows.some((row) => Object.prototype.hasOwnProperty.call(row, 'qty')),
    value: rows.some((row) => Object.prototype.hasOwnProperty.call(row, 'value')),
  }
  const sourceApp = detectWithings(root)

  messages.push(info('sleep-analysis-found', 'sleep_analysis の data を確認しました。'))

  if (isLikelyAggregated || (fieldPresence.qty && !fieldPresence.value)) {
    messages.push(warning('aggregated-only', '集計済みデータの可能性があります。非集計の sleep_analysis を書き出す設定にしてください。'))
  }

  if (rows.length < 3) {
    messages.push(warning('too-few-records', 'データ件数が少なすぎます。傾向を見るには複数日のデータがあると安定します。'))
  }

  if (rejectedRows > 0) {
    messages.push(warning('rejected-rows', `startDate / endDate / value が不足している行が${rejectedRows}件あります。`))
  }

  if (Object.keys(stageCounts).length === 0) {
    messages.push(error('no-stage', '睡眠ステージが取得できません。value に Awake / Asleep / In Bed / Core / REM / Deep / Unspecified が必要です。'))
  }

  const stageFlags = detectStageFlags(rows.map((row) => getString(row.value)).filter((value): value is string => Boolean(value)))

  if (!Object.values(stageFlags).some(Boolean)) {
    messages.push(error('unknown-stage-values', 'Awake / Asleep / In Bed / Core / REM / Deep / Unspecified のいずれも見つかりません。'))
  }

  if (!hasFullDateRows) {
    messages.push(error('missing-date-fields', 'startDate / endDate / value が不足しています。'))
  }

  if (hasMultipleSegmentsInOneDay) {
    messages.push(info('multiple-segments', '1日に複数回の睡眠セグメントが残っています。分割睡眠分析に使えます。'))
  } else {
    messages.push(info('no-multiple-segments', '1日に複数回の睡眠セグメントは検出されませんでした。'))
  }

  if (sourceApp) {
    messages.push(info('withings-source', `${sourceApp} 由来らしい文字列が見つかりました。`))
  }

  return buildResult({
    messages,
    metricsFound,
    sleepAnalysisFound: true,
    sleepAnalysisDataFound: true,
    isNonAggregated: hasFullDateRows && convertibleRows > 0,
    isLikelyAggregated,
    totalRows: rows.length,
    convertibleRows,
    rejectedRows,
    stageCounts,
    dateRangeLabel,
    hasMultipleSegmentsInOneDay,
    sourceApp,
  })
}

export function getSleepAnalysisRows(input: unknown): RawHealthAutoExportRow[] {
  const metric = getSleepMetric(input)
  return Array.isArray(metric?.data) ? metric.data.filter(isRecord) : []
}

function getSleepMetric(root: unknown): RawHealthAutoExportMetric | null {
  if (Array.isArray(root)) {
    return (root.find((item) => isRecord(item) && item.name === 'sleep_analysis') as RawHealthAutoExportMetric | undefined) ?? null
  }

  if (!isRecord(root)) {
    return null
  }

  if (Array.isArray(root.metrics)) {
    return (root.metrics
      .filter(isRecord)
      .find((item) => item.name === 'sleep_analysis') as RawHealthAutoExportMetric | undefined) ?? null
  }

  if (isRecord(root.sleep_analysis)) {
    return root.sleep_analysis as RawHealthAutoExportMetric
  }

  return null
}

function auditRow(row: RawHealthAutoExportRow): {
  convertible: boolean
  hasStartDate: boolean
  hasEndDate: boolean
  stage: NormalizedSleepStage | null
  dates: Date[]
} {
  const start = parseDate(getString(row.startDate))
  const end = parseDate(getString(row.endDate))
  const stage = normalizeStage(getString(row.value))

  return {
    convertible: Boolean(start && end && stage),
    hasStartDate: Boolean(start),
    hasEndDate: Boolean(end),
    stage,
    dates: [start, end].filter((date): date is Date => date !== null),
  }
}

export function normalizeStage(value: string | undefined): NormalizedSleepStage | null {
  if (!value) {
    return null
  }

  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  const compact = normalized.replace(/\s+/g, '')

  if (normalized === 'awake' || compact === 'hkcategoryvaluesleepanalysisawake') {
    return 'awake'
  }

  if (
    normalized === 'in bed' ||
    compact === 'inbed' ||
    compact === 'hkcategoryvaluesleepanalysisinbed'
  ) {
    return 'in_bed'
  }

  if (normalized === 'core' || compact === 'hkcategoryvaluesleepanalysisasleepcore') {
    return 'asleep_core'
  }

  if (normalized === 'rem' || compact === 'hkcategoryvaluesleepanalysisasleeprem') {
    return 'asleep_rem'
  }

  if (normalized === 'deep' || compact === 'hkcategoryvaluesleepanalysisasleepdeep') {
    return 'asleep_deep'
  }

  if (
    normalized === 'unspecified' ||
    compact === 'hkcategoryvaluesleepanalysisasleepunspecified'
  ) {
    return 'asleep_unspecified'
  }

  if (normalized === 'asleep' || compact === 'hkcategoryvaluesleepanalysisasleep') {
    return 'asleep'
  }

  return null
}

function detectStageFlags(valueTypes: string[]): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(stagePatterns).map(([name, pattern]) => [
      name,
      valueTypes.some((value) => pattern.test(value)),
    ]),
  )
}

function buildResult(
  partial: Partial<HealthAutoExportAuditResult> & { messages: HealthAutoExportAuditMessage[] },
): HealthAutoExportAuditResult {
  const hasError = partial.messages.some((message) => message.severity === 'error')
  const hasWarning = partial.messages.some((message) => message.severity === 'warning')
  const status = hasError ? 'insufficient' : hasWarning ? 'needs_settings' : 'usable'

  return {
    status,
    statusLabel:
      status === 'usable'
        ? 'このJSONは睡眠分析に使えます'
        : status === 'needs_settings'
          ? '設定変更が必要です'
          : 'データ不足です',
    messages: partial.messages,
    metricsFound: partial.metricsFound ?? false,
    sleepAnalysisFound: partial.sleepAnalysisFound ?? false,
    sleepAnalysisDataFound: partial.sleepAnalysisDataFound ?? false,
    isNonAggregated: partial.isNonAggregated ?? false,
    isLikelyAggregated: partial.isLikelyAggregated ?? false,
    totalRows: partial.totalRows ?? 0,
    convertibleRows: partial.convertibleRows ?? 0,
    rejectedRows: partial.rejectedRows ?? 0,
    stageCounts: partial.stageCounts ?? {},
    dateRangeLabel: partial.dateRangeLabel ?? '不明',
    hasMultipleSegmentsInOneDay: partial.hasMultipleSegmentsInOneDay ?? false,
    sourceApp: partial.sourceApp,
  }
}

function countStages(stages: Array<NormalizedSleepStage | null>): HealthAutoExportStageCounts {
  return stages.reduce<HealthAutoExportStageCounts>((counts, stage) => {
    if (stage) {
      counts[stage] = (counts[stage] ?? 0) + 1
    }

    return counts
  }, {})
}

function detectMultipleSegmentsInOneDay(rows: ReturnType<typeof auditRow>[]): boolean {
  const counts = new Map<string, number>()

  for (const row of rows) {
    const firstDate = row.dates[0]

    if (!row.convertible || !firstDate) {
      continue
    }

    const key = formatDateKey(firstDate)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Array.from(counts.values()).some((count) => count > 1)
}

function detectWithings(input: unknown): string | undefined {
  const text = JSON.stringify(input)
  return /withings/i.test(text) ? 'Withings' : undefined
}

function formatDateRange(dates: Date[]): string {
  const sorted = [...dates].sort((left, right) => left.getTime() - right.getTime())
  const first = sorted[0]
  const last = sorted.at(-1)

  if (!first || !last) {
    return '不明'
  }

  const firstLabel = formatDateKey(first)
  const lastLabel = formatDateKey(last)
  return firstLabel === lastLabel ? firstLabel : `${firstLabel} - ${lastLabel}`
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDate(value: string | undefined): Date | null {
  if (!value) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is RawHealthAutoExportRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function info(id: string, message: string): HealthAutoExportAuditMessage {
  return { id, message, severity: 'info' }
}

function warning(id: string, message: string): HealthAutoExportAuditMessage {
  return { id, message, severity: 'warning' }
}

function error(id: string, message: string): HealthAutoExportAuditMessage {
  return { id, message, severity: 'error' }
}
