import type { ClassifiedSleepBlock, ScoreResult, TimeConfidence } from '../../types/sleep'

export function calculateFragmentationScore(blocks: ClassifiedSleepBlock[]): ScoreResult {
  const blockCount = blocks.length
  const totalMinutes = blocks.reduce((sum, block) => sum + block.durationMinutes, 0)
  const shortBlockCount = blocks.filter((block) => block.isNapCandidate).length
  const longestBlockMinutes = Math.max(0, ...blocks.map((block) => block.durationMinutes))
  const nonLongestMinutes = Math.max(0, totalMinutes - longestBlockMinutes)
  const nonLongestRatio = totalMinutes > 0 ? nonLongestMinutes / totalMinutes : 0

  const score = clampScore(
    (blockCount - 1) * 22 + shortBlockCount * 12 + nonLongestRatio * 45,
  )
  const reasons: string[] = []

  if (blockCount > 1) {
    reasons.push(`睡眠ブロックが${blockCount}回あります。`)
  }

  if (shortBlockCount > 0) {
    reasons.push(`仮眠候補が${shortBlockCount}回あります。`)
  }

  if (nonLongestMinutes > 0) {
    reasons.push(`最長睡眠以外にも合計${Math.round(nonLongestMinutes)}分の睡眠があります。`)
  }

  return {
    score,
    level: toLevel(score),
    label: `分割睡眠の傾向: ${toJapaneseLevel(score)}`,
    reasons: reasons.length > 0 ? reasons : ['分割睡眠の目立つ傾向は少なめです。'],
    confidence: getConfidence(blocks),
  }
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function toLevel(score: number): ScoreResult['level'] {
  if (score >= 70) {
    return 'high'
  }

  if (score >= 35) {
    return 'moderate'
  }

  return 'low'
}

function toJapaneseLevel(score: number): string {
  if (score >= 70) {
    return '高め'
  }

  if (score >= 35) {
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
