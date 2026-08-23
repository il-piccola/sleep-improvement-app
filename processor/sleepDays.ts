import type {
  ClassifiedProcessorSleepBlock,
  ProcessedSleepDay,
  ProcessorBlockType,
  ProcessorConfig,
  ProcessorSleepBlock,
} from './types.ts'

export function buildProcessorSleepDays({
  adoptedBlockIds,
  blocks,
  config,
}: {
  adoptedBlockIds: string[]
  blocks: ProcessorSleepBlock[]
  config: ProcessorConfig
}): {
  blocks: ClassifiedProcessorSleepBlock[]
  sleepDays: ProcessedSleepDay[]
} {
  const adopted = new Set(adoptedBlockIds)
  const groups = new Map<string, ProcessorSleepBlock[]>()

  for (const block of blocks.filter((candidate) => adopted.has(candidate.blockId))) {
    const sleepDay = getSleepDay(block, config)
    const group = groups.get(sleepDay) ?? []
    group.push(block)
    groups.set(sleepDay, group)
  }

  const classifiedBlocks: ClassifiedProcessorSleepBlock[] = []
  const sleepDays: ProcessedSleepDay[] = []

  for (const [sleepDay, group] of Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right))) {
    const sorted = [...group].sort(compareBlocksForMainSleep)
    const mainBlockId = sorted[0]?.blockId ?? null
    const classified = group
      .map((block) => ({
        ...block,
        sleepDay,
        isMainSleep: block.blockId === mainBlockId,
        blockType: classifyBlock(block, block.blockId === mainBlockId, config),
      }))
      .sort(compareClassifiedBlocks)

    classifiedBlocks.push(...classified)
    sleepDays.push({
      sleepDay,
      blockIds: classified.map((block) => block.blockId),
      mainBlockId,
      totalSleepMinutes: classified.reduce((sum, block) => sum + block.durationMinutes, 0),
    })
  }

  return {
    blocks: classifiedBlocks,
    sleepDays,
  }
}

export function getProcessorSleepDayKey(
  isoDate: string,
  config: Pick<ProcessorConfig, 'timeZone' | 'sleepDayBoundaryHour'>,
): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid sleep date: ${isoDate}`)
  }

  const local = getLocalParts(date, config.timeZone)
  const base = new Date(Date.UTC(local.year, local.month - 1, local.day))

  if (local.hour < config.sleepDayBoundaryHour) {
    base.setUTCDate(base.getUTCDate() - 1)
  }

  return base.toISOString().slice(0, 10)
}

function getSleepDay(block: ProcessorSleepBlock, config: ProcessorConfig): string {
  if (block.start) {
    return getProcessorSleepDayKey(block.start, config)
  }

  return block.dayIndex === null ? 'duration-only' : `sample-day-${block.dayIndex}`
}

function compareBlocksForMainSleep(left: ProcessorSleepBlock, right: ProcessorSleepBlock): number {
  return (
    right.durationMinutes - left.durationMinutes ||
    compareNullableTime(left.start, right.start) ||
    left.blockId.localeCompare(right.blockId)
  )
}

function classifyBlock(
  block: ProcessorSleepBlock,
  isMainSleep: boolean,
  config: ProcessorConfig,
): ProcessorBlockType {
  if (isMainSleep) return 'main'
  if (!block.start) return 'unknown'

  const hour = getLocalParts(new Date(block.start), config.timeZone).hour
  if (isHourInRange(hour, config.eveningSleepStartHour, config.eveningSleepEndHour)) {
    return 'evening'
  }

  if (block.durationMinutes < config.napCandidateMaxMinutes) {
    return 'nap'
  }

  return 'supplemental'
}

function isHourInRange(hour: number, startHour: number, endHour: number): boolean {
  if (startHour === endHour) return false
  if (startHour < endHour) return hour >= startHour && hour < endHour
  return hour >= startHour || hour < endHour
}

function getLocalParts(date: Date, timeZone: string): {
  year: number
  month: number
  day: number
  hour: number
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value)

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour') % 24,
  }
}

function compareClassifiedBlocks(
  left: ClassifiedProcessorSleepBlock,
  right: ClassifiedProcessorSleepBlock,
): number {
  return compareNullableTime(left.start, right.start) || left.blockId.localeCompare(right.blockId)
}

function compareNullableTime(left: string | null, right: string | null): number {
  if (left === null && right === null) return 0
  if (left === null) return 1
  if (right === null) return -1
  return Date.parse(left) - Date.parse(right)
}
