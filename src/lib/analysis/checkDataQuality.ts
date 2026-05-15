import type { DataQualityIssue, DataQualityReport, SleepRecord } from '../../types/sleep'
import { buildSleepBlocks } from './buildSleepBlocks'
import { groupBySleepDay } from './groupBySleepDay'

const SUFFICIENT_RECORD_COUNT = 7
const RECENT_DAYS = 7

export function checkDataQuality(records: SleepRecord[], now = new Date()): DataQualityReport {
  const issues: DataQualityIssue[] = []
  const datedRecords = records
    .map((record) => getRecordDate(record))
    .filter((date): date is Date => date !== null)
    .sort((left, right) => left.getTime() - right.getTime())
  const latestDate = datedRecords.at(-1) ?? null
  const hasDateRange = datedRecords.length > 0
  const stageCounts = countStages(records)
  const hasSleepStage = records.some((record) => Boolean(record.value))
  const hasActualSleepStage = stageCounts.asleep > 0
  const isOnlyInBed = records.length > 0 && stageCounts.inBed === records.length
  const isOnlyAwake = records.length > 0 && stageCounts.awake === records.length
  const hasSourceInfo = records.some((record) => Boolean(record.sourceName ?? record.source))
  const isLikelyAggregated = isAggregatedLike(records)
  const blocks = buildSleepBlocks(records)
  const sleepDayGroups = groupBySleepDay(blocks)
  const hasMultipleSleepsInOneDay = sleepDayGroups.some((group) => group.blocks.length > 1)
  const hasTodayOrRecent = latestDate ? daysBetween(latestDate, now) <= RECENT_DAYS : false

  if (records.length === 0) {
    issues.push(error('no-records', '睡眠レコードがありません。ファイル形式または読み込み対象を確認してください。'))
  } else if (records.length < SUFFICIENT_RECORD_COUNT) {
    issues.push(
      warning(
        'few-records',
        `睡眠レコードが${records.length}件です。傾向を見るには${SUFFICIENT_RECORD_COUNT}件以上あると安定します。`,
      ),
    )
  } else {
    issues.push(info('enough-records', `睡眠レコードは${records.length}件あり、基本的な傾向表示に使えます。`))
  }

  if (!hasDateRange) {
    issues.push(error('no-date-range', '日付範囲を表示できません。startDate/endDateまたはdateが必要です。'))
  }

  if (!hasTodayOrRecent) {
    issues.push(
      warning(
        'no-recent-data',
        `今日または直近${RECENT_DAYS}日以内の睡眠データがありません。読み込まれた範囲の最新データを表示します。`,
      ),
    )
  }

  if (!hasSleepStage) {
    issues.push(error('no-stage', '睡眠ステージがありません。value/stage/categoryのいずれかが必要です。'))
  }

  if (isOnlyInBed) {
    issues.push(error('only-in-bed', 'In Bedだけのデータです。実睡眠時間として扱える睡眠ステージがありません。'))
  }

  if (isOnlyAwake) {
    issues.push(error('only-awake', 'Awakeだけのデータです。実睡眠として扱えるレコードがありません。'))
  }

  if (!hasActualSleepStage) {
    issues.push(error('no-actual-sleep', 'REM/Core/Deep/Asleepなど、実睡眠として扱えるstageがありません。'))
  }

  if (hasMultipleSleepsInOneDay) {
    issues.push(info('multiple-sleeps', '1日に複数回の睡眠が検出されています。分割睡眠として分析できます。'))
  } else {
    issues.push(info('single-sleep-days', '1日に複数回の睡眠は検出されていません。通常睡眠パターンとして扱います。'))
  }

  if (!hasSourceInfo) {
    issues.push(info('no-source', 'source/sourceNameはありませんが、睡眠時刻とstageがあれば処理できます。'))
  }

  if (isLikelyAggregated) {
    issues.push(warning('aggregated-like', '集計済みデータらしい形式です。分割睡眠や時刻ベースの分析は参考値になります。'))
  }

  const hasError = issues.some((issue) => issue.severity === 'error')
  const hasWarning = issues.some((issue) => issue.severity === 'warning')

  return {
    level: hasError ? 'insufficient' : hasWarning ? 'caution' : 'good',
    label: hasError ? '不足' : hasWarning ? '注意' : '良好',
    recordCount: records.length,
    dateRangeLabel: formatDateRange(datedRecords),
    latestRecordDateLabel: latestDate ? formatDate(latestDate) : '不明',
    hasMultipleSleepsInOneDay,
    hasSourceInfo,
    isLikelyAggregated,
    issues,
  }
}

function countStages(records: SleepRecord[]): { asleep: number; awake: number; inBed: number; unknown: number } {
  return records.reduce(
    (counts, record) => {
      const value = record.stage ?? record.value

      if (isAwake(value)) {
        counts.awake += 1
      } else if (isInBed(value)) {
        counts.inBed += 1
      } else if (isActualSleep(value)) {
        counts.asleep += 1
      } else {
        counts.unknown += 1
      }

      return counts
    },
    { asleep: 0, awake: 0, inBed: 0, unknown: 0 },
  )
}

function isActualSleep(value: string): boolean {
  return value.includes('Asleep') || value.startsWith('asleep')
}

function isAwake(value: string): boolean {
  return value.includes('Awake') || value === 'awake'
}

function isInBed(value: string): boolean {
  return value.includes('InBed') || value === 'in_bed'
}

function isAggregatedLike(records: SleepRecord[]): boolean {
  if (records.length === 0) {
    return false
  }

  const recordsWithoutFullTime = records.filter((record) => !record.startDate || !record.endDate)
  return recordsWithoutFullTime.length / records.length >= 0.8
}

function getRecordDate(record: SleepRecord): Date | null {
  const value = record.startDate ?? record.start ?? record.endDate ?? record.end

  if (!value) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysBetween(date: Date, now: Date): number {
  const day = 24 * 60 * 60 * 1000
  return Math.abs(startOfDay(now).getTime() - startOfDay(date).getTime()) / day
}

function startOfDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function formatDateRange(dates: Date[]): string {
  const first = dates[0]
  const last = dates.at(-1)

  if (!first || !last) {
    return '不明'
  }

  if (formatDate(first) === formatDate(last)) {
    return formatDate(first)
  }

  return `${formatDate(first)} - ${formatDate(last)}`
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function info(id: string, message: string): DataQualityIssue {
  return { id, message, severity: 'info' }
}

function warning(id: string, message: string): DataQualityIssue {
  return { id, message, severity: 'warning' }
}

function error(id: string, message: string): DataQualityIssue {
  return { id, message, severity: 'error' }
}
