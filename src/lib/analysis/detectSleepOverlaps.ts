import type {
  SleepBlock,
  SleepOverlapCandidate,
  SleepOverlapReport,
  SleepOverlapSourceSummary,
} from '../../types/sleep'

export const FULL_DUPLICATE_OVERLAP_RATIO = 0.8
export const PARTIAL_OVERLAP_RATIO = 0.3

export function calculateSleepBlockOverlapRatio(left: SleepBlock, right: SleepBlock): number {
  const overlapMinutes = calculateOverlapMinutes(left, right)
  const shorterMinutes = Math.min(left.durationMinutes, right.durationMinutes)

  if (shorterMinutes <= 0) {
    return 0
  }

  return overlapMinutes / shorterMinutes
}

export function detectSleepOverlaps(blocks: SleepBlock[]): SleepOverlapReport {
  const fullDuplicateCandidates: SleepOverlapCandidate[] = []
  const partialOverlapCandidates: SleepOverlapCandidate[] = []
  const overlappedBlockIds = new Set<string>()
  const sourceBlockCounts = new Map<string, Set<string>>()

  for (const block of blocks) {
    for (const sourceKey of block.sourceKeys) {
      const blockIds = sourceBlockCounts.get(sourceKey) ?? new Set<string>()
      blockIds.add(block.id)
      sourceBlockCounts.set(sourceKey, blockIds)
    }
  }

  for (let leftIndex = 0; leftIndex < blocks.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < blocks.length; rightIndex += 1) {
      const left = blocks[leftIndex]
      const right = blocks[rightIndex]

      if (sharesSourceKey(left, right)) {
        continue
      }

      const overlapRatio = calculateSleepBlockOverlapRatio(left, right)

      if (overlapRatio < PARTIAL_OVERLAP_RATIO) {
        continue
      }

      const candidate = createCandidate(left, right, overlapRatio)
      overlappedBlockIds.add(left.id)
      overlappedBlockIds.add(right.id)

      if (overlapRatio >= FULL_DUPLICATE_OVERLAP_RATIO) {
        fullDuplicateCandidates.push(candidate)
      } else {
        partialOverlapCandidates.push(candidate)
      }
    }
  }

  return {
    fullDuplicateCandidates,
    partialOverlapCandidates,
    pendingReviewCandidates: partialOverlapCandidates,
    independentBlockIds: blocks
      .filter((block) => !overlappedBlockIds.has(block.id))
      .map((block) => block.id),
    sourceSummaries: buildSourceSummaries(sourceBlockCounts, overlappedBlockIds),
  }
}

function createCandidate(
  left: SleepBlock,
  right: SleepBlock,
  overlapRatio: number,
): SleepOverlapCandidate {
  return {
    id: `${left.id}__${right.id}`,
    kind:
      overlapRatio >= FULL_DUPLICATE_OVERLAP_RATIO
        ? 'full_duplicate_candidate'
        : 'partial_overlap_candidate',
    overlapRatio: roundRatio(overlapRatio),
    overlapMinutes: Math.round(calculateOverlapMinutes(left, right)),
    sourceKeys: [left.sourceKeys[0] ?? 'unknown_source', right.sourceKeys[0] ?? 'unknown_source'],
    blockIds: [left.id, right.id],
    timeRangeLabel: formatOverlapRange(left, right),
  }
}

function buildSourceSummaries(
  sourceBlockCounts: Map<string, Set<string>>,
  overlappedBlockIds: Set<string>,
): SleepOverlapSourceSummary[] {
  const summaries: SleepOverlapSourceSummary[] = []

  for (const [sourceKey, blockIds] of sourceBlockCounts.entries()) {
    const overlappedBlockCount = Array.from(blockIds).filter((blockId) =>
      overlappedBlockIds.has(blockId),
    ).length
    const totalBlockCount = blockIds.size

    summaries.push({
      sourceKey,
      overlapRate: totalBlockCount > 0 ? roundRatio(overlappedBlockCount / totalBlockCount) : 0,
      overlappedBlockCount,
      totalBlockCount,
    })
  }

  return summaries.sort((left, right) => right.overlapRate - left.overlapRate)
}

function calculateOverlapMinutes(left: SleepBlock, right: SleepBlock): number {
  if (!left.startDate || !left.endDate || !right.startDate || !right.endDate) {
    return 0
  }

  const leftStart = Date.parse(left.startDate)
  const leftEnd = Date.parse(left.endDate)
  const rightStart = Date.parse(right.startDate)
  const rightEnd = Date.parse(right.endDate)

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

function sharesSourceKey(left: SleepBlock, right: SleepBlock): boolean {
  return left.sourceKeys.some((sourceKey) => right.sourceKeys.includes(sourceKey))
}

function formatOverlapRange(left: SleepBlock, right: SleepBlock): string {
  const start = [left.startDate, right.startDate].filter(Boolean).sort()[0]
  const end = [left.endDate, right.endDate].filter(Boolean).sort().at(-1)

  if (!start || !end) {
    return '時刻なし'
  }

  return `${formatClock(new Date(start))} - ${formatClock(new Date(end))}`
}

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function roundRatio(value: number): number {
  return Math.round(value * 100) / 100
}
