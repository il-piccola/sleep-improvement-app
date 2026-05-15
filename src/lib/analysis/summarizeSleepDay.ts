import type { AnalysisConfig, SleepDayGroup, SleepDaySummary } from '../../types/sleep'
import { calculateCircadianScore } from './calculateCircadianScore'
import { calculateFragmentationScore } from './calculateFragmentationScore'
import { classifySleepBlocks } from './classifySleepBlocks'

export function summarizeSleepDay(
  group: SleepDayGroup,
  config: Partial<AnalysisConfig> = {},
): SleepDaySummary {
  const classifiedBlocks = classifySleepBlocks(group.blocks, config)
  const totalSleepMinutes = classifiedBlocks.reduce(
    (sum, block) => sum + block.durationMinutes,
    0,
  )
  const longestBlockMinutes = Math.max(0, ...classifiedBlocks.map((block) => block.durationMinutes))
  const napCandidateCount = classifiedBlocks.filter((block) => block.isNapCandidate).length
  const eveningSleepCount = classifiedBlocks.filter((block) => block.isEveningSleep).length
  const notes: string[] = []

  if (classifiedBlocks.some((block) => block.timeConfidence !== 'actual')) {
    notes.push('匿名化サンプルなど時刻がないデータでは、時刻に基づく目安の精度が下がります。')
  }

  if (classifiedBlocks.length > 1) {
    notes.push('1日の中の複数睡眠ブロックを合算して扱っています。')
  }

  return {
    sleepDayKey: group.sleepDayKey,
    blockCount: classifiedBlocks.length,
    totalSleepMinutes,
    longestBlockMinutes,
    napCandidateCount,
    eveningSleepCount,
    classifiedBlocks,
    fragmentation: calculateFragmentationScore(classifiedBlocks),
    circadian: calculateCircadianScore(classifiedBlocks, config),
    notes,
  }
}
