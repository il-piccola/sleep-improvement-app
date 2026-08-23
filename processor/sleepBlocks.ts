import { createHash } from 'node:crypto'
import type { SleepRecord } from '../src/types/sleep.ts'
import type {
  ProcessorConfig,
  ProcessorSleepBlock,
  ProcessorSleepStage,
  ProcessorStageSegment,
} from './types.ts'

type Candidate = {
  recordId: string
  sourceKey: string
  kind: ProcessorSleepBlock['kind']
  stage: ProcessorSleepStage
  start: Date | null
  end: Date | null
  durationMinutes: number
  dayIndex: number | null
}

type MutableBlock = Omit<ProcessorSleepBlock, 'blockId'>

export function buildProcessorSleepBlocks(
  records: SleepRecord[],
  config: Pick<ProcessorConfig, 'mergeGapMinutes'>,
): ProcessorSleepBlock[] {
  const candidates = records
    .map(toCandidate)
    .filter((candidate): candidate is Candidate => candidate !== null)
    .sort(compareCandidates)

  const blocks: MutableBlock[] = []

  for (const candidate of candidates) {
    const previous = blocks.at(-1)

    if (previous && canMerge(previous, candidate, config.mergeGapMinutes)) {
      mergeIntoBlock(previous, candidate)
      continue
    }

    blocks.push(createMutableBlock(candidate))
  }

  const deduplicated = new Map<string, ProcessorSleepBlock>()

  for (const block of blocks.map(finalizeBlock)) {
    const existing = deduplicated.get(block.blockId)

    if (!existing) {
      deduplicated.set(block.blockId, block)
      continue
    }

    existing.sourceRecordIds = uniqueSorted([...existing.sourceRecordIds, ...block.sourceRecordIds])
  }

  return Array.from(deduplicated.values()).sort(compareBlocks)
}

export function getCanonicalSourceKey(record: SleepRecord): string {
  const explicit = normalizeExplicitSourceKey(record.sourceKey)

  if (explicit && !explicit.startsWith('unknown_source')) {
    return explicit
  }

  const values = [
    record.sourceApp,
    record.sourceName,
    record.source,
    record.deviceName,
    record.sourceBundleId,
    record.sourceKind,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)

  if (values.length === 0) {
    return 'unknown_source'
  }

  const text = values.join(' ').toLowerCase()

  if (text.includes('withings')) return 'withings'
  if (text.includes('apple watch') || /\bwatch\b/.test(text)) return 'apple_watch'
  if (text.includes('iphone') || text.includes('i phone')) return 'iphone'
  if (text.includes('manual') || text.includes('hand input') || text.includes('手入力')) return 'manual'
  if (text.includes('com.apple.health') || text.includes('apple health')) return 'apple_health'

  return toSourceKey(values[0])
}

function toCandidate(record: SleepRecord): Candidate | null {
  const stage = normalizeStage(record.stage ?? record.value)
  const kind = getKind(stage)

  if (!kind) {
    return null
  }

  const start = parseDate(record.startDate ?? record.start)
  const end = parseDate(record.endDate ?? record.end)
  const actualDuration = start && end ? Math.max(0, (end.getTime() - start.getTime()) / 60_000) : null
  const durationMinutes = Math.round(actualDuration ?? Math.max(0, record.durationMinutes ?? 0))

  if (durationMinutes <= 0) {
    return null
  }

  return {
    recordId: record.id,
    sourceKey: getCanonicalSourceKey(record),
    kind,
    stage,
    start,
    end,
    durationMinutes,
    dayIndex: record.dayIndex ?? null,
  }
}

function compareCandidates(left: Candidate, right: Candidate): number {
  return (
    left.sourceKey.localeCompare(right.sourceKey) ||
    left.kind.localeCompare(right.kind) ||
    compareNullableNumber(left.start?.getTime() ?? null, right.start?.getTime() ?? null) ||
    compareNullableNumber(left.end?.getTime() ?? null, right.end?.getTime() ?? null) ||
    compareNullableNumber(left.dayIndex, right.dayIndex) ||
    left.stage.localeCompare(right.stage) ||
    left.recordId.localeCompare(right.recordId)
  )
}

function canMerge(block: MutableBlock, candidate: Candidate, mergeGapMinutes: number): boolean {
  if (
    block.sourceKeys[0] !== candidate.sourceKey ||
    block.kind !== candidate.kind ||
    block.timeConfidence !== 'actual' ||
    !block.end ||
    !candidate.start ||
    !candidate.end
  ) {
    return false
  }

  const gapMinutes = (candidate.start.getTime() - Date.parse(block.end)) / 60_000
  return gapMinutes <= mergeGapMinutes
}

function createMutableBlock(candidate: Candidate): MutableBlock {
  const start = candidate.start?.toISOString() ?? null
  const end = candidate.end?.toISOString() ?? null

  return {
    sourceRecordIds: [candidate.recordId],
    sourceKeys: [candidate.sourceKey],
    kind: candidate.kind,
    start,
    end,
    durationMinutes: candidate.durationMinutes,
    timeConfidence: start && end ? 'actual' : candidate.dayIndex !== null ? 'estimated' : 'durationOnly',
    dayIndex: candidate.dayIndex,
    stageSegments: toSegments(candidate),
  }
}

function mergeIntoBlock(block: MutableBlock, candidate: Candidate): void {
  block.sourceRecordIds.push(candidate.recordId)
  block.sourceRecordIds = uniqueSorted(block.sourceRecordIds)
  block.stageSegments.push(...toSegments(candidate))
  block.stageSegments.sort(compareSegments)

  if (candidate.start && candidate.end && block.start && block.end) {
    const startMs = Math.min(Date.parse(block.start), candidate.start.getTime())
    const endMs = Math.max(Date.parse(block.end), candidate.end.getTime())
    block.start = new Date(startMs).toISOString()
    block.end = new Date(endMs).toISOString()
    block.durationMinutes = Math.round((endMs - startMs) / 60_000)
  } else {
    block.durationMinutes += candidate.durationMinutes
  }
}

function finalizeBlock(block: MutableBlock): ProcessorSleepBlock {
  const sourceKeys = uniqueSorted(block.sourceKeys)
  const stageSegments = [...block.stageSegments].sort(compareSegments)
  const identity = JSON.stringify({
    sourceKeys,
    kind: block.kind,
    start: block.start,
    end: block.end,
    durationMinutes: block.durationMinutes,
    dayIndex: block.dayIndex,
    stages: stageSegments.map((segment) => [segment.stage, segment.start, segment.end]),
  })

  return {
    ...block,
    blockId: `blk-${createHash('sha256').update(identity).digest('hex').slice(0, 32)}`,
    sourceRecordIds: uniqueSorted(block.sourceRecordIds),
    sourceKeys,
    stageSegments,
  }
}

function toSegments(candidate: Candidate): ProcessorStageSegment[] {
  if (!candidate.start || !candidate.end) {
    return []
  }

  return [
    {
      stage: candidate.stage,
      start: candidate.start.toISOString(),
      end: candidate.end.toISOString(),
      durationMinutes: candidate.durationMinutes,
    },
  ]
}

function normalizeStage(value: string): ProcessorSleepStage {
  const normalized = value.toLowerCase()

  if (normalized.includes('rem')) return 'asleep_rem'
  if (normalized.includes('deep')) return 'asleep_deep'
  if (normalized.includes('core')) return 'asleep_core'
  if (normalized.includes('unspecified')) return 'asleep_unspecified'
  if (value.includes('Awake') || normalized === 'awake') return 'awake'
  if (value.includes('InBed') || normalized === 'in_bed' || normalized === 'in bed') return 'in_bed'
  if (value.includes('Asleep') || normalized.startsWith('asleep')) return 'asleep'

  return 'asleep_unspecified'
}

function getKind(stage: ProcessorSleepStage): ProcessorSleepBlock['kind'] | null {
  if (stage === 'in_bed') return 'in_bed'
  if (stage === 'awake') return null
  return 'asleep'
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function normalizeExplicitSourceKey(value: string | undefined): string | null {
  if (!value?.trim()) return null
  return value
    .split(':')
    .map(toSourceKey)
    .filter(Boolean)
    .join(':') || null
}

function toSourceKey(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .normalize('NFKC')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'unknown_source'
  )
}

function compareSegments(left: ProcessorStageSegment, right: ProcessorStageSegment): number {
  return left.start.localeCompare(right.start) || left.end.localeCompare(right.end) || left.stage.localeCompare(right.stage)
}

function compareBlocks(left: ProcessorSleepBlock, right: ProcessorSleepBlock): number {
  return (
    compareNullableNumber(left.start ? Date.parse(left.start) : null, right.start ? Date.parse(right.start) : null) ||
    left.sourceKeys.join('|').localeCompare(right.sourceKeys.join('|')) ||
    left.blockId.localeCompare(right.blockId)
  )
}

function compareNullableNumber(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0
  if (left === null) return 1
  if (right === null) return -1
  return left - right
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort()
}
