import { createHash } from 'node:crypto'
import type { ProcessorConfig, ProcessorOverlap, ProcessorSleepBlock } from './types.ts'

export function calculateProcessorBlockOverlapRatio(
  left: ProcessorSleepBlock,
  right: ProcessorSleepBlock,
): number {
  const overlapMinutes = calculateOverlapMinutes(left, right)
  const shorterMinutes = Math.min(left.durationMinutes, right.durationMinutes)

  if (shorterMinutes <= 0) {
    return 0
  }

  return overlapMinutes / shorterMinutes
}

export function detectProcessorOverlaps(
  blocks: ProcessorSleepBlock[],
  config: Pick<ProcessorConfig, 'fullDuplicateOverlapRatio' | 'partialOverlapRatio'>,
): ProcessorOverlap[] {
  validateThresholds(config)
  const overlaps: ProcessorOverlap[] = []
  const sorted = [...blocks].sort((left, right) => left.blockId.localeCompare(right.blockId))

  for (let leftIndex = 0; leftIndex < sorted.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sorted.length; rightIndex += 1) {
      const left = sorted[leftIndex]
      const right = sorted[rightIndex]

      if (sharesSourceKey(left, right)) {
        continue
      }

      const overlapRatio = calculateProcessorBlockOverlapRatio(left, right)

      if (overlapRatio < config.partialOverlapRatio) {
        continue
      }

      const kind =
        overlapRatio >= config.fullDuplicateOverlapRatio
          ? 'full_duplicate_candidate'
          : 'partial_overlap_candidate'
      const blockIds = [left.blockId, right.blockId].sort() as [string, string]
      const sourceKeys = [
        left.sourceKeys[0] ?? 'unknown_source',
        right.sourceKeys[0] ?? 'unknown_source',
      ] as [string, string]
      const identity = [kind, ...blockIds].join('|')

      overlaps.push({
        overlapId: `ovl-${createHash('sha256').update(identity).digest('hex').slice(0, 32)}`,
        kind,
        overlapRatio: round(overlapRatio, 6),
        overlapMinutes: round(calculateOverlapMinutes(left, right), 3),
        blockIds,
        sourceKeys,
      })
    }
  }

  return overlaps.sort((left, right) => left.overlapId.localeCompare(right.overlapId))
}

function calculateOverlapMinutes(left: ProcessorSleepBlock, right: ProcessorSleepBlock): number {
  if (!left.start || !left.end || !right.start || !right.end) {
    return 0
  }

  const leftStart = Date.parse(left.start)
  const leftEnd = Date.parse(left.end)
  const rightStart = Date.parse(right.start)
  const rightEnd = Date.parse(right.end)

  if (
    !Number.isFinite(leftStart) ||
    !Number.isFinite(leftEnd) ||
    !Number.isFinite(rightStart) ||
    !Number.isFinite(rightEnd)
  ) {
    return 0
  }

  return Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart)) / 60_000
}

function sharesSourceKey(left: ProcessorSleepBlock, right: ProcessorSleepBlock): boolean {
  return left.sourceKeys.some((sourceKey) => right.sourceKeys.includes(sourceKey))
}

function validateThresholds(
  config: Pick<ProcessorConfig, 'fullDuplicateOverlapRatio' | 'partialOverlapRatio'>,
): void {
  const { fullDuplicateOverlapRatio, partialOverlapRatio } = config

  if (
    partialOverlapRatio < 0 ||
    fullDuplicateOverlapRatio > 1 ||
    partialOverlapRatio >= fullDuplicateOverlapRatio
  ) {
    throw new Error('Invalid overlap thresholds')
  }
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
