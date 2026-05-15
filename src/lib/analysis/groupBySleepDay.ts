import type { AnalysisConfig, SleepBlock, SleepDayGroup } from '../../types/sleep'
import { normalizeAnalysisConfig } from '../../types/sleep'

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
    const boundaryStart = new Date(start)

    if (start.getHours() < config.sleepDayBoundaryHour) {
      boundaryStart.setDate(boundaryStart.getDate() - 1)
    }

    boundaryStart.setHours(config.sleepDayBoundaryHour, 0, 0, 0)

    const boundaryEnd = new Date(boundaryStart)
    boundaryEnd.setDate(boundaryEnd.getDate() + 1)

    return {
      key: formatDateKey(boundaryStart),
      sleepDayKey: formatDateKey(boundaryStart),
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

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
