import { calculateProcessorBlockOverlapRatio, detectProcessorOverlaps } from './overlaps.ts'
import type {
  ProcessorBlockDecision,
  ProcessorConfig,
  ProcessorIntegrationReasonCode,
  ProcessorIntegrationResult,
  ProcessorIntegrationStatus,
  ProcessorOverlap,
  ProcessorSleepBlock,
  SourceIntegrationPolicy,
} from './types.ts'

export function integrateProcessorSleep({
  blocks,
  config,
  overlaps,
  policy,
}: {
  blocks: ProcessorSleepBlock[]
  config: ProcessorConfig
  overlaps: ProcessorOverlap[]
  policy: SourceIntegrationPolicy
}): ProcessorIntegrationResult {
  if (policy.version !== config.sourceIntegrationPolicyVersion) {
    throw new Error('Source integration policy version does not match processor config')
  }

  const blockById = new Map(blocks.map((block) => [block.blockId, block]))
  const decisions = new Map<string, ProcessorBlockDecision>()
  const asleepBlocks = blocks.filter((block) => block.kind === 'asleep')
  const inBedBlocks = blocks.filter((block) => block.kind === 'in_bed')

  for (const block of asleepBlocks) {
    decisions.set(block.blockId, decision(block.blockId, 'adopted', 'independent'))
  }

  const asleepOverlaps = overlaps.filter((overlap) =>
    overlap.blockIds.every((blockId) => blockById.get(blockId)?.kind === 'asleep'),
  )

  applyOverlapDecisions({
    blocks: asleepBlocks,
    overlaps: asleepOverlaps,
    decisions,
    defaultReason: 'independent',
  })

  const adoptedAsleepBlocks = asleepBlocks.filter(
    (block) => decisions.get(block.blockId)?.status === 'adopted',
  )
  const fallbackCandidates: ProcessorSleepBlock[] = []

  for (const block of inBedBlocks) {
    const overlapsActualSleep = adoptedAsleepBlocks.some(
      (actualBlock) =>
        calculateProcessorBlockOverlapRatio(block, actualBlock) >= config.partialOverlapRatio,
    )

    if (overlapsActualSleep) {
      decisions.set(block.blockId, decision(block.blockId, 'support', 'in_bed_support_only'))
      continue
    }

    decisions.set(block.blockId, decision(block.blockId, 'adopted', 'in_bed_fallback'))
    fallbackCandidates.push(block)
  }

  if (fallbackCandidates.length > 1) {
    applyOverlapDecisions({
      blocks: fallbackCandidates,
      overlaps: detectProcessorOverlaps(fallbackCandidates, config),
      decisions,
      defaultReason: 'in_bed_fallback',
    })
  }

  const blockDecisions = Array.from(decisions.values()).sort((left, right) =>
    left.blockId.localeCompare(right.blockId),
  )
  const recordIntegrations = blockDecisions
    .flatMap((blockDecision) => {
      const block = blockById.get(blockDecision.blockId)
      if (!block) return []

      return block.sourceRecordIds.map((recordId) => ({
        recordId,
        blockId: block.blockId,
        status: blockDecision.status,
        reasonCode: blockDecision.reasonCode,
      }))
    })
    .sort((left, right) => left.recordId.localeCompare(right.recordId) || left.blockId.localeCompare(right.blockId))

  return {
    policyVersion: policy.version,
    adoptedBlockIds: idsWithStatus(blockDecisions, 'adopted'),
    excludedDuplicateBlockIds: idsWithStatus(blockDecisions, 'excluded_duplicate'),
    pendingOverlapBlockIds: idsWithStatus(blockDecisions, 'pending_overlap'),
    supportBlockIds: idsWithStatus(blockDecisions, 'support'),
    blockDecisions,
    recordIntegrations,
  }
}

function applyOverlapDecisions({
  blocks,
  defaultReason,
  decisions,
  overlaps,
}: {
  blocks: ProcessorSleepBlock[]
  defaultReason: ProcessorIntegrationReasonCode
  decisions: Map<string, ProcessorBlockDecision>
  overlaps: ProcessorOverlap[]
}): void {
  const blockById = new Map(blocks.map((block) => [block.blockId, block]))
  const fullCandidates = overlaps.filter((overlap) => overlap.kind === 'full_duplicate_candidate')

  for (const component of buildOverlapComponents(fullCandidates)) {
    const componentBlocks = component.map((blockId) => blockById.get(blockId)).filter(isBlock)
    const winner = choosePreferredBlock(componentBlocks)
    if (!winner) continue

    for (const block of componentBlocks) {
      if (block.blockId === winner.blockId) continue
      decisions.set(
        block.blockId,
        decision(block.blockId, 'excluded_duplicate', 'full_duplicate_lower_priority', winner.blockId),
      )
    }
  }

  const partialCandidates = overlaps.filter(
    (overlap) =>
      overlap.kind === 'partial_overlap_candidate' &&
      !overlap.blockIds.some((blockId) => decisions.get(blockId)?.status === 'excluded_duplicate'),
  )

  for (const component of buildOverlapComponents(partialCandidates)) {
    const componentBlocks = component
      .map((blockId) => blockById.get(blockId))
      .filter(isBlock)
      .filter((block) => decisions.get(block.blockId)?.status !== 'excluded_duplicate')
    const winner = choosePreferredBlock(componentBlocks)
    if (!winner) continue

    for (const block of componentBlocks) {
      if (block.blockId === winner.blockId) continue
      decisions.set(
        block.blockId,
        decision(block.blockId, 'pending_overlap', 'partial_overlap_lower_priority', winner.blockId),
      )
    }
  }

  for (const block of blocks) {
    if (!decisions.has(block.blockId)) {
      decisions.set(block.blockId, decision(block.blockId, 'adopted', defaultReason))
    }
  }
}

function choosePreferredBlock(blocks: ProcessorSleepBlock[]): ProcessorSleepBlock | null {
  return [...blocks].sort(compareBlockPriority)[0] ?? null
}

function compareBlockPriority(left: ProcessorSleepBlock, right: ProcessorSleepBlock): number {
  const detailedStageDelta = detailedStageCount(right) - detailedStageCount(left)
  if (detailedStageDelta !== 0) return detailedStageDelta

  const actualDelta = Number(right.timeConfidence === 'actual') - Number(left.timeConfidence === 'actual')
  if (actualDelta !== 0) return actualDelta

  const manualDelta = Number(isManualSource(left)) - Number(isManualSource(right))
  if (manualDelta !== 0) return manualDelta

  const sourceDelta = (left.sourceKeys[0] ?? 'unknown_source').localeCompare(
    right.sourceKeys[0] ?? 'unknown_source',
  )
  if (sourceDelta !== 0) return sourceDelta

  return left.blockId.localeCompare(right.blockId)
}

function detailedStageCount(block: ProcessorSleepBlock): number {
  return block.stageSegments.filter((segment) =>
    segment.stage === 'asleep_core' ||
    segment.stage === 'asleep_rem' ||
    segment.stage === 'asleep_deep',
  ).length
}

function isManualSource(block: ProcessorSleepBlock): boolean {
  return block.sourceKeys.some((sourceKey) => sourceKey.includes('manual'))
}

function buildOverlapComponents(overlaps: ProcessorOverlap[]): string[][] {
  const adjacency = new Map<string, Set<string>>()

  for (const overlap of overlaps) {
    const [left, right] = overlap.blockIds
    const leftSet = adjacency.get(left) ?? new Set<string>()
    const rightSet = adjacency.get(right) ?? new Set<string>()
    leftSet.add(right)
    rightSet.add(left)
    adjacency.set(left, leftSet)
    adjacency.set(right, rightSet)
  }

  const components: string[][] = []
  const visited = new Set<string>()

  for (const blockId of Array.from(adjacency.keys()).sort()) {
    if (visited.has(blockId)) continue
    const stack = [blockId]
    const component: string[] = []
    visited.add(blockId)

    while (stack.length > 0) {
      const current = stack.pop()
      if (!current) continue
      component.push(current)

      for (const next of Array.from(adjacency.get(current) ?? []).sort().reverse()) {
        if (visited.has(next)) continue
        visited.add(next)
        stack.push(next)
      }
    }

    components.push(component.sort())
  }

  return components
}

function decision(
  blockId: string,
  status: ProcessorIntegrationStatus,
  reasonCode: ProcessorIntegrationReasonCode,
  selectedOverBlockId?: string,
): ProcessorBlockDecision {
  return {
    blockId,
    status,
    reasonCode,
    ...(selectedOverBlockId ? { selectedOverBlockId } : {}),
  }
}

function idsWithStatus(
  decisions: ProcessorBlockDecision[],
  status: ProcessorIntegrationStatus,
): string[] {
  return decisions.filter((item) => item.status === status).map((item) => item.blockId)
}

function isBlock(value: ProcessorSleepBlock | undefined): value is ProcessorSleepBlock {
  return Boolean(value)
}
