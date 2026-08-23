export type ProcessorSleepStage =
  | 'awake'
  | 'in_bed'
  | 'asleep'
  | 'asleep_core'
  | 'asleep_rem'
  | 'asleep_deep'
  | 'asleep_unspecified'

export const PROCESSOR_IDENTITY_POLICY_VERSION = '1'

export type ProcessorConfig = {
  timeZone: string
  sleepDayBoundaryHour: number
  mergeGapMinutes: number
  napCandidateMaxMinutes: number
  eveningSleepStartHour: number
  eveningSleepEndHour: number
  mainSleepRule: 'longest_block_per_sleep_day'
  sourceIntegrationPolicyVersion: string
  fullDuplicateOverlapRatio: number
  partialOverlapRatio: number
}

export type SourceIntegrationPolicy = {
  version: string
  sourcePriority: 'quality_then_source_key'
  unknownSourceMode: 'usable'
  inBedMode: 'fallback_when_no_sleep_overlap'
  partialOverlapMode: 'single_winner_pending'
}

export const DEFAULT_PROCESSOR_CONFIG: ProcessorConfig = {
  timeZone: 'Asia/Tokyo',
  sleepDayBoundaryHour: 18,
  mergeGapMinutes: 30,
  napCandidateMaxMinutes: 90,
  eveningSleepStartHour: 16,
  eveningSleepEndHour: 22,
  mainSleepRule: 'longest_block_per_sleep_day',
  sourceIntegrationPolicyVersion: '1',
  fullDuplicateOverlapRatio: 0.8,
  partialOverlapRatio: 0.3,
}

export const DEFAULT_SOURCE_INTEGRATION_POLICY: SourceIntegrationPolicy = {
  version: '1',
  sourcePriority: 'quality_then_source_key',
  unknownSourceMode: 'usable',
  inBedMode: 'fallback_when_no_sleep_overlap',
  partialOverlapMode: 'single_winner_pending',
}

export type ProcessorStageSegment = {
  stage: ProcessorSleepStage
  start: string
  end: string
  durationMinutes: number
}

export type ProcessorSleepBlock = {
  blockId: string
  sourceRecordIds: string[]
  sourceKeys: string[]
  kind: 'asleep' | 'in_bed'
  start: string | null
  end: string | null
  durationMinutes: number
  timeConfidence: 'actual' | 'estimated' | 'durationOnly'
  dayIndex: number | null
  stageSegments: ProcessorStageSegment[]
}

export type ProcessorOverlapKind = 'full_duplicate_candidate' | 'partial_overlap_candidate'

export type ProcessorOverlap = {
  overlapId: string
  kind: ProcessorOverlapKind
  overlapRatio: number
  overlapMinutes: number
  blockIds: [string, string]
  sourceKeys: [string, string]
}

export type ProcessorIntegrationStatus =
  | 'adopted'
  | 'excluded_duplicate'
  | 'pending_overlap'
  | 'support'
  | 'ignored'

export type ProcessorIntegrationReasonCode =
  | 'independent'
  | 'full_duplicate_lower_priority'
  | 'partial_overlap_lower_priority'
  | 'in_bed_support_only'
  | 'in_bed_fallback'

export type ProcessorBlockDecision = {
  blockId: string
  status: ProcessorIntegrationStatus
  reasonCode: ProcessorIntegrationReasonCode
  selectedOverBlockId?: string
}

export type ProcessorRecordIntegration = {
  recordId: string
  blockId: string
  status: ProcessorIntegrationStatus
  reasonCode: ProcessorIntegrationReasonCode
}

export type ProcessorIntegrationResult = {
  policyVersion: string
  adoptedBlockIds: string[]
  excludedDuplicateBlockIds: string[]
  pendingOverlapBlockIds: string[]
  supportBlockIds: string[]
  blockDecisions: ProcessorBlockDecision[]
  recordIntegrations: ProcessorRecordIntegration[]
}

export type ProcessorBlockType = 'main' | 'evening' | 'nap' | 'supplemental' | 'unknown'

export type ClassifiedProcessorSleepBlock = ProcessorSleepBlock & {
  sleepDay: string
  blockType: ProcessorBlockType
  isMainSleep: boolean
}

export type ProcessedSleepDay = {
  sleepDay: string
  boundaryStart: string | null
  boundaryEnd: string | null
  blockIds: string[]
  mainSleepBlockId: string | null
  blockCount: number
  totalSleepMinutes: number
  longestBlockMinutes: number
  napBlockCount: number
  eveningBlockCount: number
}
