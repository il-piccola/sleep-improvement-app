import type { SleepRecord } from '../src/types/sleep.ts'
import { buildProcessorSleepBlocks } from './sleepBlocks.ts'
import { buildProcessorSleepDays } from './sleepDays.ts'
import { integrateProcessorSleep } from './integrateSleep.ts'
import { detectProcessorOverlaps } from './overlaps.ts'
import {
  DEFAULT_PROCESSOR_CONFIG,
  DEFAULT_SOURCE_INTEGRATION_POLICY,
  type ClassifiedProcessorSleepBlock,
  type ProcessedSleepDay,
  type ProcessorConfig,
  type ProcessorIntegrationResult,
  type ProcessorOverlap,
  type ProcessorSleepBlock,
  type SourceIntegrationPolicy,
} from './types.ts'

export type CanonicalSleepProcessingResult = {
  config: ProcessorConfig
  policy: SourceIntegrationPolicy
  candidateBlocks: ProcessorSleepBlock[]
  overlaps: ProcessorOverlap[]
  integration: ProcessorIntegrationResult
  blocks: ClassifiedProcessorSleepBlock[]
  sleepDays: ProcessedSleepDay[]
}

export function processCanonicalSleep(
  records: SleepRecord[],
  config: ProcessorConfig = DEFAULT_PROCESSOR_CONFIG,
  policy: SourceIntegrationPolicy = DEFAULT_SOURCE_INTEGRATION_POLICY,
): CanonicalSleepProcessingResult {
  const candidateBlocks = buildProcessorSleepBlocks(records, config)
  const overlaps = detectProcessorOverlaps(candidateBlocks, config)
  const integration = integrateProcessorSleep({ candidateBlocks, blocks: candidateBlocks, config, overlaps, policy } as never)
  const sleepDayResult = buildProcessorSleepDays({
    adoptedBlockIds: integration.adoptedBlockIds,
    blocks: candidateBlocks,
    config,
  })

  return {
    config: { ...config },
    policy: { ...policy },
    candidateBlocks,
    overlaps,
    integration,
    blocks: sleepDayResult.blocks,
    sleepDays: sleepDayResult.sleepDays,
  }
}
