import type { AnalysisConfig, SleepBlock, SleepDayGroup } from '../../types/sleep'
import { normalizeAnalysisConfig } from '../../types/sleep'
import { getSleepDayBoundaryStart, getSleepDayKeyForDate } from './sleepDayBoundary'

export function groupBySleepDay(
  blocks: SleepBlock[],
  config: Partial<AnalysisConfig> = {},
): SleepDayGroup[] {
  const normalizedConfig = normalizeAnalysisConfig(config)
  const groups = new Map<string, SleepDayGroup>()

  for (const block of blocks) {
    const sleepDay = getSleepDay(block, normalizedConfig)
    const group = groups.get(sleepDay.key)

    if (group) {
      group.blocks.push(block)
      continue
    }

    groups.set(sleepDay.key, {
      sleepDayKey: sleepDay.key,
      boundaryStartDate: sleepDay.boundaryStartDate,
      boundaryEndDate: sleepDay.boundaryEndDate,
      blocks: [block],
    })
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    blocks: sortBlocks(group.blocks),
  }))
}

function getSleepDay(
  block: SleepBlock,
  config: AnalysisConfig,
): Pick<SleepDayGroup, 'sleepDayKey' | 'boundaryStartDate' | 'boundaryEndDate'> & {
  key: string
} {
  if (block.startDate) {
    const start = new Date(block.startDate)
    const key = getSleepDayKeyForDate(start, config.sleepDayBoundaryHour)
    const boundaryStart = getSleepDayBoundaryStart(key, config.sleepDayBoundaryHour)

    const boundaryEnd = new Date(boundaryStart)
    boundaryEnd.setDate(boundaryEnd.getDate() + 1)

    return {
      key,
      sleepDayKey: key,
      boundaryStartDate: boundaryStart.toISOString(),
      boundaryEndDate: boundaryEnd.toISOString(),
    }
  }

  const key = block.dayIndex === null ? 'duration-only' : `sample-day-${block.dayIndex}`

  return {
    key,
    sleepDayKey: key,
    boundaryStartDate: null,
    boundaryEndDate: null,
  }
}

function sortBlocks(blocks: SleepBlock[]): SleepBlock[] {
  return [...blocks].sort((left, right) => {
    if (left.startDate && right.startDate) {
      return new Date(left.startDate).getTime() - new Date(right.startDate).getTime()
    }

    if (left.dayIndex !== null && right.dayIndex !== null) {
      return left.dayIndex - right.dayIndex
    }

    return left.id.localeCompare(right.id)
  })
}
