import type { AnalysisConfig, ClassifiedSleepBlock, ScoreResult, TimeConfidence } from '../../types/sleep'
import { normalizeAnalysisConfig } from '../../types/sleep'

export function calculateCircadianScore(
  blocks: ClassifiedSleepBlock[],
  config: Partial<AnalysisConfig> = {},
): ScoreResult {
  const normalizedConfig = normalizeAnalysisConfig(config)
  const totalMinutes = blocks.reduce((sum, block) => sum + block.durationMinutes, 0)
  const daytimeMinutes = blocks.reduce(
    (sum, block) => sum + estimateMinutesInDaytime(block, normalizedConfig),
    0,
  )
  const eveningCount = blocks.filter((block) => block.isEveningSleep).length
  const daytimeRatio = totalMinutes > 0 ? daytimeMinutes / totalMinutes : 0
  const score = clampScore(daytimeRatio * 100 + eveningCount * 15)
  const reasons: string[] = []

  if (daytimeMinutes > 0) {
    reasons.push(`日中帯の睡眠が約${Math.round(daytimeMinutes)}分あります。`)
  }

  if (eveningCount > 0) {
    reasons.push(`夕方睡眠の目安に当てはまるブロックが${eveningCount}回あります。`)
  }

  return {
    score,
    level: toLevel(score, normalizedConfig),
    label: `昼夜逆転の傾向: ${toJapaneseLevel(score, normalizedConfig)}`,
    reasons: reasons.length > 0 ? reasons : ['昼夜逆転の目立つ傾向は少なめです。'],
    confidence: getConfidence(blocks),
  }
}

function estimateMinutesInDaytime(block: ClassifiedSleepBlock, config: AnalysisConfig): number {
  if (!block.startDate || !block.endDate) {
    return 0
  }

  const start = new Date(block.startDate)
  const end = new Date(block.endDate)
  let total = 0
  const cursor = new Date(start)
  cursor.setSeconds(0, 0)

  while (cursor < end) {
    const next = new Date(cursor)
    next.setMinutes(cursor.getMinutes() + 15)
    const segmentEnd = next < end ? next : end
    const hour = cursor.getHours() + cursor.getMinutes() / 60

    if (hour >= config.daytimeStartHour && hour < config.daytimeEndHour) {
      total += (segmentEnd.getTime() - cursor.getTime()) / 60_000
    }

    cursor.setTime(segmentEnd.getTime())
  }

  return total
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function toLevel(score: number, config: AnalysisConfig): ScoreResult['level'] {
  if (score >= config.circadianHighDaytimeRatio * 100) {
    return 'high'
  }

  if (score >= config.circadianModerateDaytimeRatio * 100) {
    return 'moderate'
  }

  return 'low'
}

function toJapaneseLevel(score: number, config: AnalysisConfig): string {
  if (score >= config.circadianHighDaytimeRatio * 100) {
    return '高め'
  }

  if (score >= config.circadianModerateDaytimeRatio * 100) {
    return '中くらい'
  }

  return '低め'
}

function getConfidence(blocks: ClassifiedSleepBlock[]): TimeConfidence {
  if (blocks.some((block) => block.timeConfidence === 'durationOnly')) {
    return 'durationOnly'
  }

  if (blocks.some((block) => block.timeConfidence === 'estimated')) {
    return 'estimated'
  }

  return 'actual'
}
