import type {
  AnalysisConfig,
  ClassifiedSleepBlock,
  SleepBlock,
  SleepBlockLabel,
} from '../../types/sleep'
import { normalizeAnalysisConfig } from '../../types/sleep'

export function classifySleepBlocks(
  blocks: SleepBlock[],
  config: Partial<AnalysisConfig> = {},
): ClassifiedSleepBlock[] {
  const normalizedConfig = normalizeAnalysisConfig(config)

  return blocks.map((block) => classifySleepBlock(block, normalizedConfig))
}

function classifySleepBlock(block: SleepBlock, config: AnalysisConfig): ClassifiedSleepBlock {
  const labels: SleepBlockLabel[] = []
  const notes: string[] = []
  const isNapCandidate = block.durationMinutes < config.napCandidateMaxMinutes
  const isEveningSleep = startsWithinEveningWindow(block, config)
  const isMain = block.durationMinutes >= config.mainSleepMinMinutes

  if (isMain) {
    labels.push('main')
  }

  if (isNapCandidate) {
    labels.push('napCandidate')
    notes.push(`${config.napCandidateMaxMinutes}分未満のため、仮眠候補の目安です。`)
  }

  if (isEveningSleep) {
    labels.push('eveningSleep')
    notes.push(
      `${config.eveningSleepStartHour}:00以降、${config.nightStartHour}:00前に始まるため、夕方睡眠の傾向として注意します。`,
    )
  }

  if (labels.length === 0) {
    labels.push('other')
  }

  if (block.timeConfidence !== 'actual') {
    notes.push('開始・終了時刻がないため、時刻に基づく判定は参考値です。')
  }

  return {
    ...block,
    labels,
    isNapCandidate,
    isEveningSleep,
    notes,
  }
}

function startsWithinEveningWindow(block: SleepBlock, config: AnalysisConfig): boolean {
  if (block.startMinutesFromMidnight === null) {
    return false
  }

  return (
    block.startMinutesFromMidnight >= config.eveningSleepStartHour * 60 &&
    block.startMinutesFromMidnight < config.nightStartHour * 60
  )
}
