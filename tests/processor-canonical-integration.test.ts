import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import type { SleepRecord } from '../src/types/sleep.ts'
import { processCanonicalSleep } from '../processor/canonicalSleep.ts'
import { buildProcessorSleepDays } from '../processor/sleepDays.ts'
import { detectProcessorOverlaps } from '../processor/overlaps.ts'
import {
  DEFAULT_PROCESSOR_CONFIG,
  DEFAULT_SOURCE_INTEGRATION_POLICY,
  type ProcessorConfig,
  type ProcessorSleepBlock,
} from '../processor/types.ts'

function run(): void {
  testDeterministicIdsIgnoreInputOrderAndAbsoluteSourcePath()
  testOverlapThresholdsAreConfigDriven()
  testCanonicalIntegrationHasNoUiPreferenceDependency()
  testMainSleepUsesLongestBlockPerSleepDay()
  testMainSleepTieBreakIsDeterministic()
  testInBedSupportAndFallbackReasonsAreObjective()
  console.log('processor canonical integration tests passed')
}

function testDeterministicIdsIgnoreInputOrderAndAbsoluteSourcePath(): void {
  const leftRecords = unknownSourceRecords('C:\\Users\\example\\Health Auto Export\\Sleep\\a.json')
  const rightRecords = unknownSourceRecords('/mnt/drive/Health Auto Export/Sleep/a.json')
  rightRecords.reverse()

  const left = processCanonicalSleep(leftRecords)
  const right = processCanonicalSleep(rightRecords)

  assert.deepEqual(
    left.candidateBlocks.map((block) => block.blockId),
    right.candidateBlocks.map((block) => block.blockId),
  )
  assert.deepEqual(left.integration.adoptedBlockIds, right.integration.adoptedBlockIds)
  assert.equal(left.candidateBlocks[0]?.sourceKeys[0], 'unknown_source')
}

function testOverlapThresholdsAreConfigDriven(): void {
  const blocks = [
    block('a', 'source_a', '2026-08-20T00:00:00Z', '2026-08-20T02:00:00Z'),
    block('b', 'source_b', '2026-08-20T00:12:00Z', '2026-08-20T02:12:00Z'),
    block('c', 'source_c', '2026-08-20T01:12:00Z', '2026-08-20T03:12:00Z'),
  ]
  const standard = detectProcessorOverlaps(blocks, DEFAULT_PROCESSOR_CONFIG)
  const full = findPair(standard, 'a', 'b')
  const partial = findPair(standard, 'a', 'c')

  assert.equal(full?.kind, 'full_duplicate_candidate')
  assert.equal(partial?.kind, 'partial_overlap_candidate')

  const stricter: ProcessorConfig = {
    ...DEFAULT_PROCESSOR_CONFIG,
    fullDuplicateOverlapRatio: 0.95,
    partialOverlapRatio: 0.5,
  }
  const changed = detectProcessorOverlaps(blocks, stricter)
  assert.equal(findPair(changed, 'a', 'b')?.kind, 'partial_overlap_candidate')
  assert.equal(findPair(changed, 'a', 'c'), undefined)
}

function testCanonicalIntegrationHasNoUiPreferenceDependency(): void {
  const source = readFileSync(new URL('../processor/integrateSleep.ts', import.meta.url), 'utf8')
  assert.equal(source.includes('SleepSourcePreferenceMap'), false)
  assert.equal(source.includes('sourcePreferences'), false)
  assert.equal('message' in DEFAULT_SOURCE_INTEGRATION_POLICY, false)

  const result = processCanonicalSleep(knownSourceRecords())
  assert.equal(result.policy.version, result.config.sourceIntegrationPolicyVersion)
  assert.equal(result.integration.policyVersion, '1')
  assert.ok(result.integration.blockDecisions.every((item) => !('message' in item)))
}

function testMainSleepUsesLongestBlockPerSleepDay(): void {
  const config = DEFAULT_PROCESSOR_CONFIG
  const blocks = [
    block('long', 'source_a', '2026-08-20T13:00:00Z', '2026-08-20T18:00:00Z', 300),
    block('short', 'source_b', '2026-08-20T19:00:00Z', '2026-08-20T20:00:00Z', 60),
  ]
  const result = buildProcessorSleepDays({
    adoptedBlockIds: blocks.map((item) => item.blockId),
    blocks,
    config,
  })

  assert.equal(result.sleepDays.length, 1)
  assert.equal(result.sleepDays[0]?.mainBlockId, 'long')
  assert.equal(result.blocks.find((item) => item.blockId === 'long')?.blockType, 'main')
}

function testMainSleepTieBreakIsDeterministic(): void {
  const blocks = [
    block('later', 'source_a', '2026-08-20T15:00:00Z', '2026-08-20T17:00:00Z', 120),
    block('earlier', 'source_b', '2026-08-20T13:00:00Z', '2026-08-20T15:00:00Z', 120),
  ]
  const result = buildProcessorSleepDays({
    adoptedBlockIds: ['later', 'earlier'],
    blocks: [...blocks].reverse(),
    config: DEFAULT_PROCESSOR_CONFIG,
  })

  assert.equal(result.sleepDays[0]?.mainBlockId, 'earlier')
}

function testInBedSupportAndFallbackReasonsAreObjective(): void {
  const records: SleepRecord[] = [
    record('sleep', 'asleep_core', 'apple_watch', '2026-08-20T22:00:00+09:00', '2026-08-21T00:00:00+09:00'),
    record('support', 'in_bed', 'iphone', '2026-08-20T22:10:00+09:00', '2026-08-20T23:50:00+09:00'),
    record('fallback', 'in_bed', 'iphone', '2026-08-21T13:00:00+09:00', '2026-08-21T14:00:00+09:00'),
  ]
  const result = processCanonicalSleep(records)
  const supportBlock = result.candidateBlocks.find((item) => item.sourceRecordIds.includes('support'))
  const fallbackBlock = result.candidateBlocks.find((item) => item.sourceRecordIds.includes('fallback'))

  assert.equal(
    result.integration.blockDecisions.find((item) => item.blockId === supportBlock?.blockId)?.reasonCode,
    'in_bed_support_only',
  )
  assert.equal(
    result.integration.blockDecisions.find((item) => item.blockId === fallbackBlock?.blockId)?.reasonCode,
    'in_bed_fallback',
  )
}

function unknownSourceRecords(sourceFile: string): SleepRecord[] {
  return [
    {
      ...record('u1', 'asleep_core', 'unknown_source:health_auto_export_json:path_a', '2026-08-20T22:00:00+09:00', '2026-08-20T23:00:00+09:00'),
      sourceFile,
      sourceFormat: 'health_auto_export_json',
    },
    {
      ...record('u2', 'asleep_deep', 'unknown_source:health_auto_export_json:path_a', '2026-08-20T23:05:00+09:00', '2026-08-21T00:05:00+09:00'),
      sourceFile,
      sourceFormat: 'health_auto_export_json',
    },
  ]
}

function knownSourceRecords(): SleepRecord[] {
  return [
    record('a1', 'asleep_core', 'apple_watch', '2026-08-20T22:00:00+09:00', '2026-08-21T00:00:00+09:00'),
    record('w1', 'asleep', 'withings', '2026-08-20T22:05:00+09:00', '2026-08-21T00:05:00+09:00'),
  ]
}

function record(
  id: string,
  stage: SleepRecord['stage'],
  sourceKey: string,
  start: string,
  end: string,
): SleepRecord {
  return {
    id,
    value: stage ?? 'asleep_unspecified',
    stage,
    sourceKey,
    start,
    end,
    startDate: start,
    endDate: end,
    durationMinutes: Math.round((Date.parse(end) - Date.parse(start)) / 60_000),
  }
}

function block(
  blockId: string,
  sourceKey: string,
  start: string,
  end: string,
  durationMinutes = Math.round((Date.parse(end) - Date.parse(start)) / 60_000),
): ProcessorSleepBlock {
  return {
    blockId,
    sourceRecordIds: [`rec-${blockId}`],
    sourceKeys: [sourceKey],
    kind: 'asleep',
    start,
    end,
    durationMinutes,
    timeConfidence: 'actual',
    dayIndex: null,
    stageSegments: [
      {
        stage: 'asleep',
        start,
        end,
        durationMinutes,
      },
    ],
  }
}

function findPair(
  overlaps: ReturnType<typeof detectProcessorOverlaps>,
  left: string,
  right: string,
) {
  return overlaps.find((item) => item.blockIds.includes(left) && item.blockIds.includes(right))
}

run()
