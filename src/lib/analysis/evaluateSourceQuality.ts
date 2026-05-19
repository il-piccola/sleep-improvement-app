import type {
  SourceQualityBreakdownItem,
  SourceQualityReport,
  SleepRecord,
  SleepOverlapReport,
} from '../../types/sleep'
import { buildSleepBlocks } from './buildSleepBlocks'
import { groupBySleepDay } from './groupBySleepDay'
import { resolveSleepSource } from '../source/resolveSleepSource'

const MIN_REASONABLE_DURATION_MINUTES = 3
const MAX_REASONABLE_DURATION_MINUTES = 18 * 60
const RECENT_DAYS = 14

export function evaluateSourceQuality(
  records: SleepRecord[],
  now = new Date(),
  overlapReport?: SleepOverlapReport,
): SourceQualityReport[] {
  const groups = new Map<string, SleepRecord[]>()

  for (const record of records) {
    const sourceKey = resolveSleepSource(record).sourceKey
    const current = groups.get(sourceKey)

    if (current) {
      current.push(record)
    } else {
      groups.set(sourceKey, [record])
    }
  }

  return Array.from(groups.entries())
    .map(([sourceKey, sourceRecords]) =>
      evaluateOneSource(sourceKey, sourceRecords, now, getOverlapRate(sourceKey, overlapReport)),
    )
    .sort((left, right) => right.qualityScore - left.qualityScore)
}

function evaluateOneSource(
  sourceKey: string,
  records: SleepRecord[],
  now: Date,
  overlapRate: number,
): SourceQualityReport {
  const strengths: string[] = []
  const warnings: string[] = []
  const displayName = getDisplayName(sourceKey, records)
  const durations = records.map(getDurationMinutes)
  const startEndRatio = ratio(records, (record) => Boolean(getStart(record) && getEnd(record)))
  const interpretableStageRatio = ratio(records, (record) => getStageKind(record) !== 'unknown')
  const positiveDurationRatio = ratio(records, (_record, index) => durations[index] > 0)
  const reasonableDurationRatio = ratio(
    records,
    (_record, index) =>
      durations[index] >= MIN_REASONABLE_DURATION_MINUTES &&
      durations[index] <= MAX_REASONABLE_DURATION_MINUTES,
  )
  const actualSleepCount = records.filter((record) => getStageKind(record) === 'actualSleep').length
  const inBedCount = records.filter((record) => getStageKind(record) === 'inBed').length
  const awakeCount = records.filter((record) => getStageKind(record) === 'awake').length
  const detailedStageCount = records.filter(hasDetailedStage).length
  const hasActualSleep = actualSleepCount > 0
  const hasInBed = inBedCount > 0
  const isInBedOnly = records.length > 0 && inBedCount === records.length
  const hasAwake = awakeCount > 0
  const hasDetailedStages = detailedStageCount > 0
  const validDates = records.map(getStart).filter((date): date is Date => date !== null)
  const recordDayCount = new Set(validDates.map(formatDateKey)).size
  const latestDate = validDates.sort((left, right) => right.getTime() - left.getTime())[0] ?? null
  const hasRecentData = latestDate ? daysBetween(latestDate, now) <= RECENT_DAYS : false
  const hasMultipleSleeps = detectsMultipleSleeps(records)
  const stableSourceKeyScore = getStableSourceKeyScore(sourceKey)

  const breakdown: SourceQualityBreakdownItem[] = [
    item('time-range', '開始・終了時刻', startEndRatio * 15, 15),
    item('stage', '睡眠ステージの解釈', interpretableStageRatio * 10, 10),
    item('duration', '睡眠時間の計算', positiveDurationRatio * 10, 10),
    item('duration-range', '極端すぎない睡眠時間', reasonableDurationRatio * 10, 10),
    item('actual-sleep', '実睡眠ステージ', hasActualSleep ? 18 : hasInBed ? 5 : 0, 18),
    item('detailed-stage', 'REM/Core/Deep', hasDetailedStages ? 10 : 0, 10),
    item('awake', 'Awake記録', hasAwake ? 5 : 0, 5),
    item('not-in-bed-only', 'In Bedだけではない', isInBedOnly ? 0 : 8, 8),
    item('record-days', '記録日数', Math.min(recordDayCount, 4) * 2, 8),
    item('recent', '直近データ', hasRecentData ? 4 : 0, 4),
    item('multiple-sleeps', '1日複数睡眠', hasMultipleSleeps ? 2 : 0, 2),
    item('source-key', 'sourceKeyの安定性', stableSourceKeyScore, 5),
  ]
  const qualityScore = clampScore(breakdown.reduce((sum, part) => sum + part.score, 0))

  if (startEndRatio === 1) strengths.push('開始・終了時刻が揃っています。')
  if (hasActualSleep) strengths.push('実睡眠ステージが含まれています。')
  if (hasDetailedStages) strengths.push('REM/Core/Deepの細かいステージがあります。')
  if (hasAwake) strengths.push('Awakeがあり、中途覚醒の目安に使いやすいデータです。')
  if (recordDayCount >= 4) strengths.push('複数日の記録があり、傾向を見る材料になります。')
  if (hasRecentData) strengths.push('直近のデータが含まれています。')
  if (hasMultipleSleeps) strengths.push('1日に複数回の睡眠を検出できます。')

  if (startEndRatio < 1) warnings.push('開始・終了時刻が不足しているレコードがあります。')
  if (!hasActualSleep && hasInBed) warnings.push('In Bed中心のため、実睡眠時間の分析では補助データです。')
  if (!hasActualSleep && !hasInBed) warnings.push('実睡眠として扱えるstageが見つかりません。')
  if (reasonableDurationRatio < 1) warnings.push('極端に短い、または長いdurationを含みます。')
  if (!hasRecentData) warnings.push('直近データが少ないため、最新傾向の目安としては弱めです。')
  if (sourceKey.startsWith('unknown_source')) {
    warnings.push('source情報が不足していますが、時刻とstageがあれば候補として扱えます。')
  }
  if (sourceKey === 'manual') {
    warnings.push('手入力らしいデータのため、補助データ候補として扱います。')
  }
  if (overlapRate > 0) {
    warnings.push(`他のデータと重なりがあります（重なり率${Math.round(overlapRate * 100)}%）。`)
  }

  return {
    sourceKey,
    displayName,
    qualityScore,
    overlapRate,
    scoreBreakdown: breakdown,
    strengths: strengths.length > 0 ? strengths : ['利用できる特徴は少なめですが、形式は確認できました。'],
    warnings,
    recommendedUse: getRecommendedUse({
      qualityScore,
      isInBedOnly,
      hasActualSleep,
      sourceKey,
      positiveDurationRatio,
      interpretableStageRatio,
    }),
  }
}

function getOverlapRate(sourceKey: string, overlapReport: SleepOverlapReport | undefined): number {
  return overlapReport?.sourceSummaries.find((summary) => summary.sourceKey === sourceKey)?.overlapRate ?? 0
}

function getRecommendedUse({
  qualityScore,
  isInBedOnly,
  hasActualSleep,
  sourceKey,
  positiveDurationRatio,
  interpretableStageRatio,
}: {
  qualityScore: number
  isInBedOnly: boolean
  hasActualSleep: boolean
  sourceKey: string
  positiveDurationRatio: number
  interpretableStageRatio: number
}): SourceQualityReport['recommendedUse'] {
  if (qualityScore < 25 || positiveDurationRatio === 0 || interpretableStageRatio === 0) {
    return 'ignore'
  }

  if (isInBedOnly || sourceKey === 'manual') {
    return 'fallback'
  }

  if (qualityScore >= 75 && hasActualSleep) {
    return 'primary'
  }

  if (qualityScore >= 45) {
    return 'secondary'
  }

  return 'fallback'
}

function getDisplayName(sourceKey: string, records: SleepRecord[]): string {
  const first = records[0]
  return first?.sourceLabel ?? first?.sourceApp ?? first?.sourceName ?? first?.source ?? sourceKey
}

function detectsMultipleSleeps(records: SleepRecord[]): boolean {
  const blocks = buildSleepBlocks(records)
  const groups = groupBySleepDay(blocks)
  return groups.some((group) => group.blocks.length > 1)
}

function getStageKind(record: SleepRecord): 'actualSleep' | 'inBed' | 'awake' | 'unknown' {
  const value = String(record.stage ?? record.value).toLowerCase()

  if (value.includes('awake')) return 'awake'
  if (value.includes('inbed') || value === 'in_bed') return 'inBed'
  if (value.includes('asleep') || value === 'core' || value === 'rem' || value === 'deep') {
    return 'actualSleep'
  }

  return 'unknown'
}

function hasDetailedStage(record: SleepRecord): boolean {
  const value = String(record.stage ?? record.value).toLowerCase()
  return value.includes('core') || value.includes('rem') || value.includes('deep')
}

function getDurationMinutes(record: SleepRecord): number {
  const start = getStart(record)
  const end = getEnd(record)

  if (start && end) {
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000))
  }

  return Math.max(0, Math.round(record.durationMinutes ?? 0))
}

function getStart(record: SleepRecord): Date | null {
  return parseDate(record.start ?? record.startDate)
}

function getEnd(record: SleepRecord): Date | null {
  return parseDate(record.end ?? record.endDate)
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getStableSourceKeyScore(sourceKey: string): number {
  if (!sourceKey.startsWith('unknown_source')) return 5
  return sourceKey.includes(':') ? 3 : 0
}

function ratio(records: SleepRecord[], predicate: (record: SleepRecord, index: number) => boolean): number {
  return records.length > 0
    ? records.filter((record, index) => predicate(record, index)).length / records.length
    : 0
}

function item(id: string, label: string, score: number, maxScore: number): SourceQualityBreakdownItem {
  return {
    id,
    label,
    score: Math.round(score),
    maxScore,
  }
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)))
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

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
