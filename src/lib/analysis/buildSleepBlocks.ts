import type { AnalysisConfig, SleepBlock, SleepRecord, SleepRecordKind } from '../../types/sleep'
import { normalizeAnalysisConfig } from '../../types/sleep'

type TimedRecord = {
  record: SleepRecord
  kind: SleepRecordKind
  start: Date | null
  end: Date | null
  durationMinutes: number
  timeConfidence: SleepBlock['timeConfidence']
}

export function buildSleepBlocks(
  records: SleepRecord[],
  config: Partial<AnalysisConfig> = {},
): SleepBlock[] {
  const normalizedConfig = normalizeAnalysisConfig(config)
  const timedRecords = records
    .map(toTimedRecord)
    .filter((record) => record.durationMinutes > 0 && record.kind === 'asleep')
    .sort(compareTimedRecords)

  const blocks: SleepBlock[] = []

  for (const timedRecord of timedRecords) {
    const previous = blocks.at(-1)

    if (previous && canMerge(previous, timedRecord, normalizedConfig)) {
      mergeIntoBlock(previous, timedRecord)
      continue
    }

    blocks.push(createBlock(timedRecord, blocks.length))
  }

  return blocks
}

function toTimedRecord(record: SleepRecord): TimedRecord {
  const start = parseDate(record.startDate ?? record.start)
  const end = parseDate(record.endDate ?? record.end)
  const durationMinutes =
    start && end
      ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000))
      : Math.max(0, Math.round(record.durationMinutes ?? 0))

  return {
    record,
    kind: getSleepRecordKind(record.stage ?? record.value),
    start,
    end,
    durationMinutes,
    timeConfidence: start && end ? 'actual' : record.dayIndex ? 'estimated' : 'durationOnly',
  }
}

function getSleepRecordKind(value: string): SleepRecordKind {
  const normalized = value.toLowerCase()

  if (value.includes('Awake') || normalized === 'awake') {
    return 'awake'
  }

  if (value.includes('Asleep') || normalized.startsWith('asleep')) {
    return 'asleep'
  }

  if (value.includes('InBed') || normalized === 'in_bed') {
    return 'inBed'
  }

  return 'unknown'
}

function compareTimedRecords(left: TimedRecord, right: TimedRecord): number {
  if (left.start && right.start) {
    return left.start.getTime() - right.start.getTime()
  }

  if (left.record.dayIndex !== undefined && right.record.dayIndex !== undefined) {
    return left.record.dayIndex - right.record.dayIndex
  }

  return left.record.id.localeCompare(right.record.id)
}

function canMerge(
  block: SleepBlock,
  timedRecord: TimedRecord,
  config: AnalysisConfig,
): boolean {
  if (!block.endDate || !timedRecord.start || block.timeConfidence !== 'actual') {
    return false
  }

  const blockEnd = new Date(block.endDate)
  const gapMinutes = (timedRecord.start.getTime() - blockEnd.getTime()) / 60_000

  return gapMinutes >= 0 && gapMinutes <= config.mergeGapMinutes
}

function createBlock(timedRecord: TimedRecord, index: number): SleepBlock {
  return {
    id: `sleep-block-${index + 1}`,
    sourceRecordIds: [timedRecord.record.id],
    recordKinds: [timedRecord.kind],
    values: [timedRecord.record.value],
    startDate: timedRecord.start?.toISOString() ?? null,
    endDate: timedRecord.end?.toISOString() ?? null,
    durationMinutes: timedRecord.durationMinutes,
    startMinutesFromMidnight: timedRecord.start ? getMinutesFromMidnight(timedRecord.start) : null,
    endMinutesFromMidnight: timedRecord.end ? getMinutesFromMidnight(timedRecord.end) : null,
    dayIndex: timedRecord.record.dayIndex ?? null,
    timeConfidence: timedRecord.timeConfidence,
  }
}

function mergeIntoBlock(block: SleepBlock, timedRecord: TimedRecord): void {
  block.sourceRecordIds.push(timedRecord.record.id)
  block.values.push(timedRecord.record.value)

  if (!block.recordKinds.includes(timedRecord.kind)) {
    block.recordKinds.push(timedRecord.kind)
  }

  if (timedRecord.end) {
    block.endDate = timedRecord.end.toISOString()
    block.endMinutesFromMidnight = getMinutesFromMidnight(timedRecord.end)
  }

  block.durationMinutes += timedRecord.durationMinutes
}

function parseDate(value: string | undefined): Date | null {
  if (!value) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getMinutesFromMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}
