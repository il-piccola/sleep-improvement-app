import type { AnalysisConfig, SleepBlock, SleepRecord, SleepRecordKind } from '../../types/sleep'
import { normalizeAnalysisConfig } from '../../types/sleep'
import { resolveSleepSource } from '../source/resolveSleepSource'

type TimedRecord = {
  record: SleepRecord
  kind: SleepRecordKind
  stage: NonNullable<SleepRecord['stage']>
  sourceKey: string
  sourceLabel: string
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
    const previous = findMergeTarget(blocks, timedRecord, normalizedConfig)

    if (previous) {
      mergeIntoBlock(previous, timedRecord)
      continue
    }

    blocks.push(createBlock(timedRecord, blocks.length))
  }

  return blocks.sort(compareBlocks)
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
    stage: getNormalizedSleepStage(record.stage ?? record.value),
    ...resolveSleepSource(record),
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

  if (!block.sourceKeys.includes(timedRecord.sourceKey)) {
    return false
  }

  const blockEnd = new Date(block.endDate)
  const gapMinutes = (timedRecord.start.getTime() - blockEnd.getTime()) / 60_000

  return gapMinutes >= 0 && gapMinutes <= config.mergeGapMinutes
}

function findMergeTarget(
  blocks: SleepBlock[],
  timedRecord: TimedRecord,
  config: AnalysisConfig,
): SleepBlock | undefined {
  return [...blocks]
    .reverse()
    .find((block) => block.sourceKeys.includes(timedRecord.sourceKey) && canMerge(block, timedRecord, config))
}

function compareBlocks(left: SleepBlock, right: SleepBlock): number {
  if (left.startDate && right.startDate) {
    return Date.parse(left.startDate) - Date.parse(right.startDate)
  }

  if (left.dayIndex !== null && right.dayIndex !== null) {
    return left.dayIndex - right.dayIndex
  }

  return left.id.localeCompare(right.id)
}

function createBlock(timedRecord: TimedRecord, index: number): SleepBlock {
  return {
    id: `sleep-block-${index + 1}`,
    sourceRecordIds: [timedRecord.record.id],
    sourceKeys: [timedRecord.sourceKey],
    sourceLabels: [timedRecord.sourceLabel],
    recordKinds: [timedRecord.kind],
    values: [timedRecord.record.value],
    stageSegments: createStageSegments(timedRecord),
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
  block.stageSegments.push(...createStageSegments(timedRecord))

  if (!block.sourceKeys.includes(timedRecord.sourceKey)) {
    block.sourceKeys.push(timedRecord.sourceKey)
  }

  if (!block.sourceLabels.includes(timedRecord.sourceLabel)) {
    block.sourceLabels.push(timedRecord.sourceLabel)
  }

  if (!block.recordKinds.includes(timedRecord.kind)) {
    block.recordKinds.push(timedRecord.kind)
  }

  if (timedRecord.end) {
    block.endDate = timedRecord.end.toISOString()
    block.endMinutesFromMidnight = getMinutesFromMidnight(timedRecord.end)
  }

  block.durationMinutes += timedRecord.durationMinutes
}

function createStageSegments(timedRecord: TimedRecord): SleepBlock['stageSegments'] {
  if (!timedRecord.start || !timedRecord.end) {
    return []
  }

  return [
    {
      durationMinutes: timedRecord.durationMinutes,
      end: timedRecord.end.toISOString(),
      stage: timedRecord.stage,
      start: timedRecord.start.toISOString(),
    },
  ]
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

function getNormalizedSleepStage(value: string): NonNullable<SleepRecord['stage']> {
  const normalized = value.toLowerCase()

  if (normalized.includes('rem')) {
    return 'asleep_rem'
  }

  if (normalized.includes('deep')) {
    return 'asleep_deep'
  }

  if (normalized.includes('core')) {
    return 'asleep_core'
  }

  if (normalized.includes('unspecified')) {
    return 'asleep_unspecified'
  }

  if (value.includes('Awake') || normalized === 'awake') {
    return 'awake'
  }

  if (value.includes('InBed') || normalized === 'in_bed') {
    return 'in_bed'
  }

  if (value.includes('Asleep') || normalized.startsWith('asleep')) {
    return 'asleep'
  }

  return 'asleep_unspecified'
}
