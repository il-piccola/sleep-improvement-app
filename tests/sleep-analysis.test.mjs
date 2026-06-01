import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { middlewareMode: true },
  appType: 'custom',
})

const { buildSleepBlocks } = await server.ssrLoadModule('/src/lib/analysis/buildSleepBlocks.ts')
const {
  calculateSleepBlockOverlapRatio,
  detectSleepOverlaps,
} = await server.ssrLoadModule('/src/lib/analysis/detectSleepOverlaps.ts')
const { groupBySleepDay } = await server.ssrLoadModule('/src/lib/analysis/groupBySleepDay.ts')
const { summarizeSleepDay } = await server.ssrLoadModule('/src/lib/analysis/summarizeSleepDay.ts')
const { checkDataQuality } = await server.ssrLoadModule('/src/lib/analysis/checkDataQuality.ts')
const { evaluateSourceQuality } = await server.ssrLoadModule('/src/lib/analysis/evaluateSourceQuality.ts')
const { buildUnifiedSleepTimeline } = await server.ssrLoadModule('/src/lib/analysis/buildUnifiedSleepTimeline.ts')
const {
  getCurrentSleepDayKey,
  selectTodaySleepSummary,
} = await server.ssrLoadModule('/src/lib/analysis/selectTodaySleepSummary.ts')
const { normalizeSleepFile } = await server.ssrLoadModule('/src/lib/import/normalizeSleepFile.ts')
const {
  loadStoredSourcePreferences,
  removeSourcePreference,
  saveStoredSourcePreferences,
  toSourceUseSetting,
  upsertSourcePreference,
} = await server.ssrLoadModule('/src/lib/source/sourcePreferences.ts')
const {
  defaultHealthImportConfig,
  loadHealthImportConfig,
  parseEnv,
  toChokidarOptions,
} = await import('../scripts/healthImportConfig.mjs')
const {
  getRecordDuplicateKeys,
  mergeAndAnalyzeSleepRecords,
} = await server.ssrLoadModule('/server/healthStore.ts')
const {
  auditHealthAutoExportJson,
  getSleepAnalysisRows,
} = await server.ssrLoadModule('/src/lib/importers/healthAutoExportJsonAuditor.ts')

try {
  await runAllCases()
  console.log('sleep analysis test cases passed')
} finally {
  await new Promise((resolve) => setTimeout(resolve, 250))
  await server.close()
}

async function runAllCases() {
  testNormalSingleSleep()
  testTwoSleepsInOneDay()
  testThreeOrMoreSplitSleeps()
  testLongEveningSleep()
  testNapUnder90Minutes()
  testSupportSleepOver90Minutes()
  testCrossDateSleep()
  testSleepDayBoundary()
  testAwakeAndInBedAreNotCounted()
  testSleepStagesAreCounted()
  testDataQuality()
  testSourceQualityHighQuality()
  testSourceQualityInBedOnly()
  testSourceQualityManualFallback()
  testSourceQualityUnknownButUsable()
  testSourceQualityBrokenDuration()
  testSourceQualityDetailedStages()
  testFullDuplicateOverlapCandidate()
  testPartialOverlapCandidate()
  testIndependentSleepCandidate()
  testMainSleepAndNapAreNotRemovedByOverlapDetection()
  testSameSourceStagesAreNotOverlapCandidates()
  testSameSourceStagesMergeWhenOtherSourceIsInterleaved()
  testInBedDoesNotOverwriteActualSleep()
  testUnifiedFullDuplicateIsNotDoubleCounted()
  testUnifiedPartialOverlapIsPendingAndNotDoubleCounted()
  testUnifiedNonOverlappingNapRemains()
  testUnifiedInBedDoesNotOverwriteActualSleep()
  testUnifiedInBedIsUsedOnlyWithoutActualSleep()
  testUnifiedManualSourceIsNotPrimaryByDefault()
  testUnifiedUnknownSourceCanRemainCandidate()
  testUnifiedTotalDoesNotBecomeExcessive()
  testUnifiedSplitSleepDoesNotDisappear()
  testUnifiedIsolatedAwakeIsNotCounted()
  testTodaySleepSummaryUsesCurrentSleepDayOnly()
  testTodaySleepSummaryUsesConfigurableBoundary()
  testTodaySleepSummaryReturnsNullWhenOnlyOldDataExists()
  testTodaySleepSummaryFallsBackAfterBoundaryWhenCurrentDayIsEmpty()
  testSleepDayGroupingUsesConfigurableBoundary()
  testSourcePreferenceExclusionRecalculatesAnalysis()
  testSourcePreferencePrimaryChangesUnifiedWinner()
  testSourcePreferenceFallbackDoesNotOverwriteActualSleep()
  testSourcePreferenceManualCanBePrimary()
  testSourcePreferenceUnknownSourceCanBeExcluded()
  testSourcePreferenceResetRemovesOverride()
  testSourcePreferencePersistsAcrossReload()
  testSourcePreferenceRecalculatesAnomalyChecks()
  testSourcePreferencePartialOverlapStillNotDoubleCounted()
  testHealthImportConfigUsesDefaultsWithoutEnvLocal()
  testHealthImportConfigCanBeOverriddenByEnv()
  testHealthImportConfigBuildsChokidarOptions()
  await testServerStoreSkipsSameRecordsWhenFileIsReprocessed()
  await testServerStoreSkipsUnknownSourceDuplicateAcrossFiles()
  testServerDuplicateKeysForUnknownSourceIncludeFallbackKeys()
  await testSourceKeyGeneration()
  testNormalizeSleepFileAddsSourceKeys()
  await testUnknownSourceKeysUseFileContext()
  await testImportKeepsPartialOverlaps()
  testHealthAutoExportNestedDataMetrics()
  await testHealthAutoExportImportFlow()
  await testLegacyIndexedDbRecordsUseDerivedSourceKey()
}

function testFullDuplicateOverlapCandidate() {
  const blocks = buildSleepBlocks([
    sourceRecord('withings-main', 'withings', 'Withings', '2026-05-15T03:00:00+09:00', '2026-05-15T07:00:00+09:00', 'asleep'),
    sourceRecord('watch-main', 'apple_watch', 'Apple Watch', '2026-05-15T03:10:00+09:00', '2026-05-15T06:50:00+09:00', 'asleep_core'),
  ])
  const report = detectSleepOverlaps(blocks)

  assert.equal(report.fullDuplicateCandidates.length, 1)
  assert.equal(report.partialOverlapCandidates.length, 0)
  assert.ok(calculateSleepBlockOverlapRatio(blocks[0], blocks[1]) >= 0.8)
}

function testPartialOverlapCandidate() {
  const blocks = buildSleepBlocks([
    sourceRecord('source-a-main', 'withings', 'Withings', '2026-05-15T03:00:00+09:00', '2026-05-15T07:00:00+09:00', 'asleep'),
    sourceRecord('source-b-late', 'apple_watch', 'Apple Watch', '2026-05-15T06:30:00+09:00', '2026-05-15T08:00:00+09:00', 'asleep_core'),
  ])
  const report = detectSleepOverlaps(blocks)

  assert.equal(report.fullDuplicateCandidates.length, 0)
  assert.equal(report.partialOverlapCandidates.length, 1)
  assert.equal(report.pendingReviewCandidates.length, 1)
}

function testIndependentSleepCandidate() {
  const blocks = buildSleepBlocks([
    sourceRecord('source-a-main', 'withings', 'Withings', '2026-05-15T03:00:00+09:00', '2026-05-15T07:00:00+09:00', 'asleep'),
    sourceRecord('source-b-nap', 'apple_watch', 'Apple Watch', '2026-05-15T13:00:00+09:00', '2026-05-15T13:30:00+09:00', 'asleep_core'),
  ])
  const report = detectSleepOverlaps(blocks)

  assert.equal(report.fullDuplicateCandidates.length, 0)
  assert.equal(report.partialOverlapCandidates.length, 0)
  assert.equal(report.independentBlockIds.length, 2)
}

function testMainSleepAndNapAreNotRemovedByOverlapDetection() {
  const records = [
    sourceRecord('main', 'withings', 'Withings', '2026-05-15T03:00:00+09:00', '2026-05-15T07:00:00+09:00', 'asleep'),
    sourceRecord('nap', 'apple_watch', 'Apple Watch', '2026-05-15T13:00:00+09:00', '2026-05-15T13:30:00+09:00', 'asleep_core'),
  ]
  const blocks = buildSleepBlocks(records)
  const report = detectSleepOverlaps(blocks)
  const summaries = summarize(records)

  assert.equal(blocks.length, 2)
  assert.equal(report.independentBlockIds.length, 2)
  assert.equal(summaries[0].blockCount, 2)
  assert.equal(summaries[0].napCandidateCount, 1)
}

function testSameSourceStagesAreNotOverlapCandidates() {
  const blocks = buildSleepBlocks([
    sourceRecord('core', 'apple_watch', 'Apple Watch', '2026-05-15T03:00:00+09:00', '2026-05-15T04:00:00+09:00', 'asleep_core'),
    sourceRecord('rem', 'apple_watch', 'Apple Watch', '2026-05-15T04:00:00+09:00', '2026-05-15T05:00:00+09:00', 'asleep_rem'),
    sourceRecord('deep', 'apple_watch', 'Apple Watch', '2026-05-15T05:00:00+09:00', '2026-05-15T06:00:00+09:00', 'asleep_deep'),
  ])
  const report = detectSleepOverlaps(blocks)

  assert.equal(blocks.length, 1)
  assert.equal(report.fullDuplicateCandidates.length, 0)
  assert.equal(report.partialOverlapCandidates.length, 0)
}

function testSameSourceStagesMergeWhenOtherSourceIsInterleaved() {
  const blocks = buildSleepBlocks([
    sourceRecord('core', 'apple_watch', 'Apple Watch', '2026-05-15T03:00:00+09:00', '2026-05-15T04:00:00+09:00', 'asleep_core'),
    sourceRecord('withings-overlap', 'withings', 'Withings', '2026-05-15T03:30:00+09:00', '2026-05-15T03:45:00+09:00', 'asleep'),
    sourceRecord('rem', 'apple_watch', 'Apple Watch', '2026-05-15T04:00:00+09:00', '2026-05-15T05:00:00+09:00', 'asleep_rem'),
    sourceRecord('deep', 'apple_watch', 'Apple Watch', '2026-05-15T05:00:00+09:00', '2026-05-15T06:00:00+09:00', 'asleep_deep'),
  ])
  const appleBlocks = blocks.filter((block) => block.sourceKeys.includes('apple_watch'))
  const report = detectSleepOverlaps(blocks)

  assert.equal(appleBlocks.length, 1)
  assert.equal(appleBlocks[0].durationMinutes, 180)
  assert.equal(report.fullDuplicateCandidates.length, 1)
}

function testInBedDoesNotOverwriteActualSleep() {
  const records = [
    sourceRecord('inbed', 'iphone', 'iPhone', '2026-05-15T02:00:00+09:00', '2026-05-15T08:00:00+09:00', 'in_bed'),
    sourceRecord('actual', 'apple_watch', 'Apple Watch', '2026-05-15T03:00:00+09:00', '2026-05-15T07:00:00+09:00', 'asleep_core'),
  ]
  const blocks = buildSleepBlocks(records)
  const report = detectSleepOverlaps(blocks)
  const summary = summarizeOnlyDay(records)

  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].sourceKeys[0], 'apple_watch')
  assert.equal(report.fullDuplicateCandidates.length, 0)
  assert.equal(summary.totalSleepMinutes, 240)
}

function testUnifiedFullDuplicateIsNotDoubleCounted() {
  const timeline = buildUnifiedSleepTimeline([
    sourceRecord('withings-main', 'withings', 'Withings', '2026-05-15T03:00:00+09:00', '2026-05-15T07:00:00+09:00', 'asleep'),
    sourceRecord('watch-main', 'apple_watch', 'Apple Watch', '2026-05-15T03:10:00+09:00', '2026-05-15T06:50:00+09:00', 'asleep_core'),
  ])

  assert.equal(timeline.overlapReport.fullDuplicateCandidates.length, 1)
  assert.equal(timeline.blocks.length, 1)
  assert.ok(timeline.comparison.unifiedTotalSleepMinutes <= 240)
  assert.equal(timeline.comparison.duplicateExcludedCount, 1)
}

function testUnifiedPartialOverlapIsPendingAndNotDoubleCounted() {
  const timeline = buildUnifiedSleepTimeline([
    sourceRecord('source-a-main', 'withings', 'Withings', '2026-05-15T03:00:00+09:00', '2026-05-15T07:00:00+09:00', 'asleep'),
    sourceRecord('source-b-late', 'apple_watch', 'Apple Watch', '2026-05-15T06:30:00+09:00', '2026-05-15T08:00:00+09:00', 'asleep_core'),
  ])

  assert.equal(timeline.overlapReport.partialOverlapCandidates.length, 1)
  assert.equal(timeline.comparison.pendingOverlapCount, 1)
  assert.ok(timeline.comparison.unifiedTotalSleepMinutes < timeline.comparison.rawTotalSleepMinutes)
  assert.ok(timeline.records.some((record) => record.unifiedStatus === 'pending_overlap'))
}

function testUnifiedNonOverlappingNapRemains() {
  const summaries = summarizeUnified([
    sourceRecord('main', 'withings', 'Withings', '2026-05-15T03:00:00+09:00', '2026-05-15T07:00:00+09:00', 'asleep'),
    sourceRecord('nap', 'apple_watch', 'Apple Watch', '2026-05-15T13:00:00+09:00', '2026-05-15T13:30:00+09:00', 'asleep_core'),
  ])

  assert.equal(summaries[0].totalSleepMinutes, 270)
  assert.equal(summaries[0].blockCount, 2)
  assert.equal(summaries[0].napCandidateCount, 1)
}

function testUnifiedInBedDoesNotOverwriteActualSleep() {
  const timeline = buildUnifiedSleepTimeline([
    sourceRecord('inbed', 'iphone', 'iPhone', '2026-05-15T02:00:00+09:00', '2026-05-15T08:00:00+09:00', 'in_bed'),
    sourceRecord('actual', 'apple_watch', 'Apple Watch', '2026-05-15T03:00:00+09:00', '2026-05-15T07:00:00+09:00', 'asleep_core'),
  ])

  assert.equal(timeline.comparison.unifiedTotalSleepMinutes, 240)
  assert.equal(timeline.comparison.fallbackUsedCount, 0)
  assert.equal(timeline.blocks[0].sourceKeys[0], 'apple_watch')
}

function testUnifiedInBedIsUsedOnlyWithoutActualSleep() {
  const timeline = buildUnifiedSleepTimeline([
    sourceRecord('inbed-only', 'iphone', 'iPhone', '2026-05-15T02:00:00+09:00', '2026-05-15T08:00:00+09:00', 'in_bed'),
  ])

  assert.equal(timeline.comparison.unifiedTotalSleepMinutes, 360)
  assert.equal(timeline.comparison.fallbackUsedCount, 1)
  assert.equal(timeline.blocks[0].isFallbackBlock, true)
}

function testUnifiedManualSourceIsNotPrimaryByDefault() {
  const timeline = buildUnifiedSleepTimeline([
    sourceRecord('manual-main', 'manual', '手入力', '2026-05-15T03:00:00+09:00', '2026-05-15T07:00:00+09:00', 'asleep'),
    sourceRecord('watch-main', 'apple_watch', 'Apple Watch', '2026-05-15T03:05:00+09:00', '2026-05-15T06:55:00+09:00', 'asleep_core'),
  ])

  assert.equal(timeline.blocks.length, 1)
  assert.equal(timeline.blocks[0].sourceKeys[0], 'apple_watch')
  assert.ok(timeline.records.some((record) => record.sourceKey === 'manual' && record.unifiedStatus === 'excluded_duplicate'))
}

function testUnifiedUnknownSourceCanRemainCandidate() {
  const timeline = buildUnifiedSleepTimeline([
    sourceRecord('unknown-rem', 'unknown_source:health_auto_export_json:sample_a_json', '不明ソース', '2026-05-15T01:00:00+09:00', '2026-05-15T02:00:00+09:00', 'asleep_rem'),
    sourceRecord('unknown-core', 'unknown_source:health_auto_export_json:sample_a_json', '不明ソース', '2026-05-15T02:00:00+09:00', '2026-05-15T03:00:00+09:00', 'asleep_core'),
    sourceRecord('unknown-deep', 'unknown_source:health_auto_export_json:sample_a_json', '不明ソース', '2026-05-15T03:00:00+09:00', '2026-05-15T04:00:00+09:00', 'asleep_deep'),
  ])

  assert.equal(timeline.comparison.unifiedTotalSleepMinutes, 180)
  assert.equal(timeline.blocks.length, 1)
  assert.ok(timeline.blocks[0].sourceKeys[0].startsWith('unknown_source'))
}

function testUnifiedTotalDoesNotBecomeExcessive() {
  const timeline = buildUnifiedSleepTimeline([
    sourceRecord('withings-main', 'withings', 'Withings', '2026-05-15T03:00:00+09:00', '2026-05-15T07:00:00+09:00', 'asleep'),
    sourceRecord('watch-main', 'apple_watch', 'Apple Watch', '2026-05-15T03:10:00+09:00', '2026-05-15T06:50:00+09:00', 'asleep_core'),
    sourceRecord('iphone-inbed', 'iphone', 'iPhone', '2026-05-15T02:30:00+09:00', '2026-05-15T07:30:00+09:00', 'in_bed'),
  ])

  assert.ok(timeline.comparison.unifiedTotalSleepMinutes <= 240)
}

function testUnifiedSplitSleepDoesNotDisappear() {
  const summaries = summarizeUnified([
    sourceRecord('main', 'apple_watch', 'Apple Watch', '2026-05-15T00:00:00+09:00', '2026-05-15T04:00:00+09:00', 'asleep_core'),
    sourceRecord('nap', 'apple_watch', 'Apple Watch', '2026-05-15T11:30:00+09:00', '2026-05-15T12:00:00+09:00', 'asleep_rem'),
    sourceRecord('evening', 'apple_watch', 'Apple Watch', '2026-05-15T16:30:00+09:00', '2026-05-15T18:00:00+09:00', 'asleep_deep'),
  ])

  assert.equal(summaries[0].blockCount, 3)
  assert.equal(summaries[0].napCandidateCount, 1)
  assert.equal(summaries[0].eveningSleepCount, 1)
}

function testUnifiedIsolatedAwakeIsNotCounted() {
  const timeline = buildUnifiedSleepTimeline([
    sourceRecord('awake', 'apple_watch', 'Apple Watch', '2026-05-15T01:00:00+09:00', '2026-05-15T01:30:00+09:00', 'awake'),
    sourceRecord('sleep', 'apple_watch', 'Apple Watch', '2026-05-15T02:00:00+09:00', '2026-05-15T06:00:00+09:00', 'asleep_core'),
  ])

  assert.equal(timeline.comparison.unifiedTotalSleepMinutes, 240)
  assert.equal(timeline.blocks.length, 1)
  assert.ok(timeline.records.some((record) => record.id === 'awake' && record.unifiedStatus === 'support'))
}

function testTodaySleepSummaryUsesCurrentSleepDayOnly() {
  const summaries = summarizeUnified([
    sourceRecord('today-main', 'apple_watch', 'Apple Watch', '2026-05-17T23:00:00+09:00', '2026-05-18T06:00:00+09:00', 'asleep_core'),
    sourceRecord('old-main', 'apple_watch', 'Apple Watch', '2026-01-02T23:00:00+09:00', '2026-01-03T05:00:00+09:00', 'asleep_core'),
  ])
  const selected = selectTodaySleepSummary(
    summaries,
    {},
    new Date('2026-05-18T09:00:00+09:00'),
  )

  assert.equal(getCurrentSleepDayKey(new Date('2026-05-18T09:00:00+09:00')), '2026-05-17')
  assert.equal(selected.targetSleepDayKey, '2026-05-17')
  assert.equal(selected.todaySummary?.sleepDayKey, '2026-05-17')
}

function testTodaySleepSummaryUsesConfigurableBoundary() {
  assert.equal(
    getCurrentSleepDayKey(new Date('2026-05-18T13:00:00+09:00'), {
      sleepDayBoundaryHour: 12,
    }),
    '2026-05-18',
  )
  assert.equal(
    getCurrentSleepDayKey(new Date('2026-05-18T05:00:00+09:00'), {
      sleepDayBoundaryHour: 6,
    }),
    '2026-05-17',
  )
  assert.equal(
    getCurrentSleepDayKey(new Date('2026-05-18T07:00:00+09:00'), {
      sleepDayBoundaryHour: 6,
    }),
    '2026-05-18',
  )
}

function testTodaySleepSummaryReturnsNullWhenOnlyOldDataExists() {
  const summaries = summarizeUnified([
    sourceRecord('old-main', 'apple_watch', 'Apple Watch', '2026-01-02T23:00:00+09:00', '2026-01-03T05:00:00+09:00', 'asleep_core'),
  ])
  const selected = selectTodaySleepSummary(
    summaries,
    {},
    new Date('2026-05-18T09:00:00+09:00'),
  )

  assert.equal(selected.targetSleepDayKey, '2026-05-17')
  assert.equal(selected.todaySummary, null)
  assert.equal(selected.latestSummary?.sleepDayKey, '2026-01-02')
  assert.equal(selected.displaySummary?.sleepDayKey, '2026-01-02')
  assert.equal(selected.isFallback, true)
}

function testTodaySleepSummaryFallsBackAfterBoundaryWhenCurrentDayIsEmpty() {
  const summaries = summarizeUnified([
    sourceRecord('latest-main', 'withings', 'Withings', '2026-05-25T00:30:00+09:00', '2026-05-25T06:30:00+09:00', 'asleep_core'),
  ])
  const selected = selectTodaySleepSummary(
    summaries,
    {},
    new Date('2026-05-25T19:00:00+09:00'),
  )

  assert.equal(selected.targetSleepDayKey, '2026-05-25')
  assert.equal(selected.todaySummary, null)
  assert.equal(selected.latestSummary?.sleepDayKey, '2026-05-24')
  assert.equal(selected.displaySummary?.sleepDayKey, '2026-05-24')
  assert.equal(selected.isFallback, true)
}

function testSleepDayGroupingUsesConfigurableBoundary() {
  const summaries = summarizeUnified(
    [
      sourceRecord('before-noon', 'apple_watch', 'Apple Watch', '2026-05-15T11:00:00+09:00', '2026-05-15T11:30:00+09:00', 'asleep_core'),
      sourceRecord('after-noon', 'apple_watch', 'Apple Watch', '2026-05-15T12:30:00+09:00', '2026-05-15T13:00:00+09:00', 'asleep_core'),
    ],
    { sleepDayBoundaryHour: 12 },
  )

  assert.deepEqual(
    summaries.map((summary) => summary.sleepDayKey),
    ['2026-05-14', '2026-05-15'],
  )
}

function testSourcePreferenceExclusionRecalculatesAnalysis() {
  const records = [
    sourceRecord('watch-main', 'apple_watch', 'Apple Watch', '2026-05-15T02:00:00+09:00', '2026-05-15T06:00:00+09:00', 'asleep_core'),
    sourceRecord('nap', 'withings', 'Withings', '2026-05-15T13:00:00+09:00', '2026-05-15T13:30:00+09:00', 'asleep'),
  ]
  const before = buildUnifiedSleepTimeline(records)
  const after = buildUnifiedSleepTimeline(records, {}, {
    apple_watch: { sourceKey: 'apple_watch', use: 'ignored', priority: 1 },
  })

  assert.equal(before.comparison.unifiedTotalSleepMinutes, 270)
  assert.equal(after.comparison.unifiedTotalSleepMinutes, 30)
  assert.ok(after.records.some((record) => record.sourceKey === 'apple_watch' && record.unifiedStatus === 'ignored'))
}

function testSourcePreferencePrimaryChangesUnifiedWinner() {
  const records = [
    sourceRecord('withings-main', 'withings', 'Withings', '2026-05-15T03:00:00+09:00', '2026-05-15T07:00:00+09:00', 'asleep'),
    sourceRecord('watch-main', 'apple_watch', 'Apple Watch', '2026-05-15T03:10:00+09:00', '2026-05-15T06:50:00+09:00', 'asleep_core'),
  ]
  const automatic = buildUnifiedSleepTimeline(records)
  const configured = buildUnifiedSleepTimeline(records, {}, {
    withings: { sourceKey: 'withings', use: 'primary', priority: 1 },
    apple_watch: { sourceKey: 'apple_watch', use: 'secondary', priority: 2 },
  })

  assert.equal(automatic.blocks[0].sourceKeys[0], 'apple_watch')
  assert.equal(configured.blocks[0].sourceKeys[0], 'withings')
}

function testSourcePreferenceFallbackDoesNotOverwriteActualSleep() {
  const timeline = buildUnifiedSleepTimeline([
    sourceRecord('manual-main', 'manual', '手入力', '2026-05-15T02:00:00+09:00', '2026-05-15T08:00:00+09:00', 'asleep'),
    sourceRecord('watch-main', 'apple_watch', 'Apple Watch', '2026-05-15T03:00:00+09:00', '2026-05-15T07:00:00+09:00', 'asleep_core'),
  ], {}, {
    manual: { sourceKey: 'manual', use: 'fallback', priority: 1 },
    apple_watch: { sourceKey: 'apple_watch', use: 'primary', priority: 2 },
  })

  assert.equal(timeline.comparison.unifiedTotalSleepMinutes, 240)
  assert.equal(timeline.blocks[0].sourceKeys[0], 'apple_watch')
}

function testSourcePreferenceManualCanBePrimary() {
  const timeline = buildUnifiedSleepTimeline([
    sourceRecord('manual-main', 'manual', '手入力', '2026-05-15T03:00:00+09:00', '2026-05-15T07:00:00+09:00', 'asleep'),
    sourceRecord('watch-main', 'apple_watch', 'Apple Watch', '2026-05-15T03:05:00+09:00', '2026-05-15T06:55:00+09:00', 'asleep_core'),
  ], {}, {
    manual: { sourceKey: 'manual', use: 'primary', priority: 1 },
    apple_watch: { sourceKey: 'apple_watch', use: 'secondary', priority: 2 },
  })

  assert.equal(timeline.blocks.length, 1)
  assert.equal(timeline.blocks[0].sourceKeys[0], 'manual')
}

function testSourcePreferenceUnknownSourceCanBeExcluded() {
  const sourceKey = 'unknown_source:health_auto_export_json:file_a_json'
  const timeline = buildUnifiedSleepTimeline([
    sourceRecord('unknown-core', sourceKey, '不明ソース', '2026-05-15T03:00:00+09:00', '2026-05-15T07:00:00+09:00', 'asleep_core'),
  ], {}, {
    [sourceKey]: { sourceKey, use: 'ignored', priority: 1 },
  })

  assert.equal(timeline.comparison.unifiedTotalSleepMinutes, 0)
  assert.ok(timeline.records.every((record) => record.unifiedStatus === 'ignored'))
}

function testSourcePreferenceResetRemovesOverride() {
  const preferences = upsertSourcePreference({}, 'apple_watch', { use: 'ignored', priority: 1 })
  const reset = removeSourcePreference(preferences, 'apple_watch')

  assert.equal(preferences.apple_watch.use, 'ignored')
  assert.equal(reset.apple_watch, undefined)
  assert.equal(toSourceUseSetting('ignore'), 'ignored')
}

function testSourcePreferencePersistsAcrossReload() {
  const storage = createMemoryStorage()
  const preferences = {
    apple_watch: { sourceKey: 'apple_watch', use: 'primary', priority: 2 },
    manual: { sourceKey: 'manual', use: 'fallback', priority: 3 },
  }

  saveStoredSourcePreferences(preferences, storage)
  const loaded = loadStoredSourcePreferences(storage)

  assert.deepEqual(loaded, preferences)
}

function testSourcePreferenceRecalculatesAnomalyChecks() {
  const records = [
    sourceRecord('watch-main', 'apple_watch', 'Apple Watch', '2026-05-15T03:00:00+09:00', '2026-05-15T07:00:00+09:00', 'asleep_core'),
    sourceRecord('nap', 'withings', 'Withings', '2026-05-15T13:00:00+09:00', '2026-05-15T13:30:00+09:00', 'asleep'),
  ]
  const before = buildUnifiedSleepTimeline(records)
  const after = buildUnifiedSleepTimeline(records, {}, {
    withings: { sourceKey: 'withings', use: 'ignored', priority: 1 },
  })

  assert.equal(before.anomalyWarnings.length, 0)
  assert.ok(after.anomalyWarnings.some((warning) => warning.includes('仮眠候補')))
}

function testSourcePreferencePartialOverlapStillNotDoubleCounted() {
  const timeline = buildUnifiedSleepTimeline([
    sourceRecord('source-a-main', 'withings', 'Withings', '2026-05-15T03:00:00+09:00', '2026-05-15T07:00:00+09:00', 'asleep'),
    sourceRecord('source-b-late', 'apple_watch', 'Apple Watch', '2026-05-15T06:30:00+09:00', '2026-05-15T08:00:00+09:00', 'asleep_core'),
  ], {}, {
    withings: { sourceKey: 'withings', use: 'primary', priority: 1 },
    apple_watch: { sourceKey: 'apple_watch', use: 'primary', priority: 2 },
  })

  assert.equal(timeline.comparison.pendingOverlapCount, 1)
  assert.equal(timeline.comparison.unifiedTotalSleepMinutes, 240)
}

function testHealthImportConfigUsesDefaultsWithoutEnvLocal() {
  const config = loadHealthImportConfig({
    cwd: 'Z:\\path-that-does-not-exist',
    env: {},
  })

  assert.deepEqual(config, defaultHealthImportConfig)
}

function testHealthImportConfigCanBeOverriddenByEnv() {
  const config = loadHealthImportConfig({
    cwd: 'Z:\\path-that-does-not-exist',
    env: {
      HEALTH_EXPORT_WATCH_DIR: 'D:\\Health\\Sleep',
      HEALTH_IMPORT_SERVER_PORT: '9999',
      HEALTH_IMPORT_SCAN_INTERVAL_MS: '60000',
      HEALTH_IMPORT_USE_POLLING: 'false',
      HEALTH_IMPORT_POLL_INTERVAL_MS: '2000',
      HEALTH_IMPORT_AWAIT_WRITE_STABILITY_MS: '3000',
    },
  })
  const parsed = parseEnv('HEALTH_EXPORT_WATCH_DIR=\"E:\\\\Sleep Export\"\nHEALTH_IMPORT_USE_POLLING=yes')

  assert.equal(config.watchDir, 'D:\\Health\\Sleep')
  assert.equal(config.serverPort, 9999)
  assert.equal(config.scanIntervalMs, 60_000)
  assert.equal(config.usePolling, false)
  assert.equal(config.pollIntervalMs, 2_000)
  assert.equal(config.awaitWriteStabilityMs, 3_000)
  assert.equal(parsed.HEALTH_EXPORT_WATCH_DIR, 'E:\\\\Sleep Export')
  assert.equal(parsed.HEALTH_IMPORT_USE_POLLING, 'yes')
}

function testHealthImportConfigBuildsChokidarOptions() {
  const options = toChokidarOptions({
    ...defaultHealthImportConfig,
    usePolling: true,
    pollIntervalMs: 4_000,
    awaitWriteStabilityMs: 10_000,
  })

  assert.equal(options.usePolling, true)
  assert.equal(options.interval, 4_000)
  assert.equal(options.awaitWriteFinish.stabilityThreshold, 10_000)
  assert.equal(options.awaitWriteFinish.pollInterval, 4_000)
}

async function testServerStoreSkipsSameRecordsWhenFileIsReprocessed() {
  const dataDir = await mkdtemp(join(tmpdir(), 'sleep-store-'))

  try {
    const record = {
      ...sourceRecord('watch-core', 'apple_watch', 'Apple Watch', '2026-05-15T03:00:00+09:00', '2026-05-15T04:00:00+09:00', 'asleep_core'),
      originalValue: 'Core',
      sourceFormat: 'health_auto_export_json',
      sourceFile: 'night-a.json',
    }
    const first = await mergeAndAnalyzeSleepRecords({
      dataDir,
      records: [record],
      sourceFile: 'night-a.json',
      warnings: ['注意'],
      rejectedRows: 2,
    })
    const second = await mergeAndAnalyzeSleepRecords({
      dataDir,
      records: [record],
      sourceFile: 'night-a.json',
      warnings: [],
      rejectedRows: 0,
    })

    assert.equal(first.latestImport?.readFileCount, 1)
    assert.equal(first.latestImport?.newRecordCount, 1)
    assert.equal(first.latestImport?.rejectedRows, 2)
    assert.equal(first.latestImport?.warningCount, 1)
    assert.equal(second.records.length, 1)
    assert.equal(second.latestImport?.newRecordCount, 0)
    assert.equal(second.latestImport?.duplicateSkippedCount, 1)
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
}

async function testServerStoreSkipsUnknownSourceDuplicateAcrossFiles() {
  const dataDir = await mkdtemp(join(tmpdir(), 'sleep-store-'))

  try {
    const firstRecord = {
      ...sourceRecord(
        'unknown-a',
        'unknown_source:health_auto_export_json:night_a_json',
        '不明なソース',
        '2026-05-15T03:00:00+09:00',
        '2026-05-15T04:00:00+09:00',
        'asleep_core',
      ),
      originalValue: 'Core',
      sourceFormat: 'health_auto_export_json',
      sourceFile: 'night-a.json',
    }
    const secondRecord = {
      ...firstRecord,
      id: 'unknown-b',
      sourceKey: 'unknown_source:health_auto_export_json:night_b_json',
      sourceFile: 'night-b.json',
      originalValue: 'HKCategoryValueSleepAnalysisAsleepCore',
    }

    await mergeAndAnalyzeSleepRecords({
      dataDir,
      records: [firstRecord],
      sourceFile: 'night-a.json',
      warnings: [],
      rejectedRows: 0,
    })
    const second = await mergeAndAnalyzeSleepRecords({
      dataDir,
      records: [secondRecord],
      sourceFile: 'night-b.json',
      warnings: [],
      rejectedRows: 0,
    })

    assert.equal(second.records.length, 1)
    assert.equal(second.latestImport?.newRecordCount, 0)
    assert.equal(second.latestImport?.duplicateSkippedCount, 1)
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
}

function testServerDuplicateKeysForUnknownSourceIncludeFallbackKeys() {
  const keys = getRecordDuplicateKeys({
    ...sourceRecord(
      'unknown',
      'unknown_source:health_auto_export_json:file_a_json',
      '不明なソース',
      '2026-05-15T03:00:00+09:00',
      '2026-05-15T04:00:00+09:00',
      'asleep_core',
    ),
    sourceFormat: 'health_auto_export_json',
    sourceFile: 'file-a.json',
    originalValue: 'Core',
  })

  assert.equal(keys.length, 4)
  assert.ok(keys.some((key) => key.startsWith('exact|unknown_source')))
  assert.ok(keys.some((key) => key.startsWith('unknown-cross-file|health_auto_export_json')))
  assert.ok(keys.some((key) => key.startsWith('unknown-cross-file-stage|health_auto_export_json')))
  assert.ok(keys.some((key) => key.startsWith('unknown-file-scoped|health_auto_export_json|file-a.json')))
}

function testSourceQualityHighQuality() {
  const reports = evaluateSourceQuality(
    [
      sourceRecord('watch-1', 'apple_watch', 'Apple Watch', '2026-05-12T23:00:00+09:00', '2026-05-13T01:00:00+09:00', 'asleep_core'),
      sourceRecord('watch-2', 'apple_watch', 'Apple Watch', '2026-05-13T01:00:00+09:00', '2026-05-13T03:00:00+09:00', 'asleep_deep'),
      sourceRecord('watch-3', 'apple_watch', 'Apple Watch', '2026-05-14T02:00:00+09:00', '2026-05-14T02:20:00+09:00', 'awake'),
      sourceRecord('watch-4', 'apple_watch', 'Apple Watch', '2026-05-15T12:00:00+09:00', '2026-05-15T12:40:00+09:00', 'asleep_rem'),
      sourceRecord('watch-5', 'apple_watch', 'Apple Watch', '2026-05-15T23:00:00+09:00', '2026-05-16T01:00:00+09:00', 'asleep_core'),
    ],
    new Date('2026-05-15T12:00:00+09:00'),
  )
  const report = reports.find((item) => item.sourceKey === 'apple_watch')

  assert.ok(report)
  assert.equal(report.recommendedUse, 'primary')
  assert.ok(report.qualityScore >= 75)
  assert.ok(report.strengths.some((message) => message.includes('REM/Core/Deep')))
  assert.ok(report.strengths.some((message) => message.includes('Awake')))
}

function testSourceQualityInBedOnly() {
  const [report] = evaluateSourceQuality(
    [
      sourceRecord('bed-1', 'iphone', 'iPhone', '2026-05-14T23:00:00+09:00', '2026-05-15T07:00:00+09:00', 'in_bed'),
      sourceRecord('bed-2', 'iphone', 'iPhone', '2026-05-15T13:00:00+09:00', '2026-05-15T13:30:00+09:00', 'in_bed'),
    ],
    new Date('2026-05-15T12:00:00+09:00'),
  )

  assert.equal(report.recommendedUse, 'fallback')
  assert.ok(report.warnings.some((message) => message.includes('In Bed中心')))
}

function testSourceQualityManualFallback() {
  const [report] = evaluateSourceQuality(
    [
      sourceRecord('manual-1', 'manual', '手入力', '2026-05-15T00:00:00+09:00', '2026-05-15T07:00:00+09:00', 'asleep'),
    ],
    new Date('2026-05-15T12:00:00+09:00'),
  )

  assert.equal(report.recommendedUse, 'fallback')
  assert.ok(report.warnings.some((message) => message.includes('手入力らしい')))
}

function testSourceQualityUnknownButUsable() {
  const [report] = evaluateSourceQuality(
    [
      sourceRecord(
        'unknown-1',
        'unknown_source:health_auto_export_json:file_a_json',
        '不明なソース',
        '2026-05-15T00:00:00+09:00',
        '2026-05-15T03:00:00+09:00',
        'asleep_core',
      ),
      sourceRecord(
        'unknown-2',
        'unknown_source:health_auto_export_json:file_a_json',
        '不明なソース',
        '2026-05-15T13:00:00+09:00',
        '2026-05-15T13:30:00+09:00',
        'asleep',
      ),
    ],
    new Date('2026-05-15T12:00:00+09:00'),
  )

  assert.notEqual(report.recommendedUse, 'ignore')
  assert.ok(report.warnings.some((message) => message.includes('source情報が不足')))
}

function testSourceQualityBrokenDuration() {
  const [report] = evaluateSourceQuality(
    [
      {
        id: 'broken-1',
        sourceKey: 'broken_source',
        sourceLabel: 'Broken Source',
        value: 'asleep',
        stage: 'asleep',
        durationMinutes: 0,
      },
    ],
    new Date('2026-05-15T12:00:00+09:00'),
  )

  assert.equal(report.recommendedUse, 'ignore')
  assert.ok(report.warnings.some((message) => message.includes('開始・終了時刻')))
}

function testSourceQualityDetailedStages() {
  const [report] = evaluateSourceQuality(
    [
      sourceRecord('detailed-1', 'withings', 'Withings', '2026-05-15T00:00:00+09:00', '2026-05-15T01:00:00+09:00', 'asleep_rem'),
      sourceRecord('detailed-2', 'withings', 'Withings', '2026-05-15T01:00:00+09:00', '2026-05-15T03:00:00+09:00', 'asleep_core'),
      sourceRecord('detailed-3', 'withings', 'Withings', '2026-05-15T03:00:00+09:00', '2026-05-15T05:00:00+09:00', 'asleep_deep'),
    ],
    new Date('2026-05-15T12:00:00+09:00'),
  )
  const detail = report.scoreBreakdown.find((item) => item.id === 'detailed-stage')

  assert.equal(detail?.score, detail?.maxScore)
  assert.ok(report.qualityScore > 70)
}

function testNormalSingleSleep() {
  const summary = summarizeOnlyDay([
    record('normal-main', '2026-05-14T23:00:00+09:00', '2026-05-15T06:00:00+09:00'),
  ])

  assertSummary(summary, {
    totalSleepMinutes: 420,
    blockCount: 1,
    mainCount: 1,
    napCount: 0,
    supportCount: 0,
    eveningCount: 0,
  })
  assert.equal(summary.fragmentation.score, 0)
  assert.equal(summary.circadian.score, 0)
}

function testTwoSleepsInOneDay() {
  const summary = summarizeOnlyDay([
    record('two-main', '2026-05-14T23:00:00+09:00', '2026-05-15T05:00:00+09:00'),
    record('two-nap', '2026-05-15T13:00:00+09:00', '2026-05-15T13:45:00+09:00'),
  ])

  assertSummary(summary, {
    totalSleepMinutes: 405,
    blockCount: 2,
    mainCount: 1,
    napCount: 1,
    supportCount: 0,
    eveningCount: 0,
  })
  assert.ok(summary.fragmentation.score > 0)
  assert.ok(summary.circadian.score > 0)
}

function testThreeOrMoreSplitSleeps() {
  const summary = summarizeOnlyDay([
    record('split-main', '2026-05-14T22:30:00+09:00', '2026-05-15T03:30:00+09:00'),
    record('split-support', '2026-05-15T08:00:00+09:00', '2026-05-15T09:40:00+09:00'),
    record('split-nap', '2026-05-15T14:30:00+09:00', '2026-05-15T15:10:00+09:00'),
  ])

  assertSummary(summary, {
    totalSleepMinutes: 440,
    blockCount: 3,
    mainCount: 1,
    napCount: 1,
    supportCount: 1,
    eveningCount: 0,
  })
  assert.equal(summary.fragmentation.level, 'high')
  assert.ok(summary.circadian.score > 0)
}

function testLongEveningSleep() {
  const summary = summarizeOnlyDay([
    record('evening-main', '2026-05-14T23:00:00+09:00', '2026-05-15T05:00:00+09:00'),
    record('evening-long', '2026-05-15T16:30:00+09:00', '2026-05-15T18:00:00+09:00'),
  ])

  assertSummary(summary, {
    totalSleepMinutes: 450,
    blockCount: 2,
    mainCount: 1,
    napCount: 0,
    supportCount: 1,
    eveningCount: 1,
  })
  assert.ok(summary.fragmentation.score > 0)
  assert.ok(summary.circadian.score > 0)
}

function testNapUnder90Minutes() {
  const summary = summarizeOnlyDay([
    record('nap-main', '2026-05-14T23:00:00+09:00', '2026-05-15T06:00:00+09:00'),
    record('nap-short', '2026-05-15T12:00:00+09:00', '2026-05-15T13:29:00+09:00'),
  ])

  assertSummary(summary, {
    totalSleepMinutes: 509,
    blockCount: 2,
    mainCount: 1,
    napCount: 1,
    supportCount: 0,
    eveningCount: 0,
  })
}

function testSupportSleepOver90Minutes() {
  const summary = summarizeOnlyDay([
    record('support-main', '2026-05-14T23:00:00+09:00', '2026-05-15T05:30:00+09:00'),
    record('support-long', '2026-05-15T10:00:00+09:00', '2026-05-15T11:45:00+09:00'),
  ])

  assertSummary(summary, {
    totalSleepMinutes: 495,
    blockCount: 2,
    mainCount: 1,
    napCount: 0,
    supportCount: 1,
    eveningCount: 0,
  })
}

function testCrossDateSleep() {
  const summary = summarizeOnlyDay([
    record('cross-date', '2026-05-14T23:30:00+09:00', '2026-05-15T07:00:00+09:00'),
  ])

  assert.equal(summary.sleepDayKey, '2026-05-14')
  assertSummary(summary, {
    totalSleepMinutes: 450,
    blockCount: 1,
    mainCount: 1,
    napCount: 0,
    supportCount: 0,
    eveningCount: 0,
  })
}

function testSleepDayBoundary() {
  const summaries = summarize([
    record('boundary-before', '2026-05-15T17:30:00+09:00', '2026-05-15T17:50:00+09:00'),
    record('boundary-after', '2026-05-15T18:30:00+09:00', '2026-05-15T19:10:00+09:00'),
    record('boundary-night', '2026-05-15T23:00:00+09:00', '2026-05-16T06:00:00+09:00'),
  ])

  const previousDay = summaries.find((summary) => summary.sleepDayKey === '2026-05-14')
  const nextDay = summaries.find((summary) => summary.sleepDayKey === '2026-05-15')

  assert.ok(previousDay)
  assert.ok(nextDay)
  assert.equal(previousDay.blockCount, 1)
  assert.equal(previousDay.totalSleepMinutes, 20)
  assert.equal(nextDay.blockCount, 2)
  assert.equal(nextDay.totalSleepMinutes, 460)
}

function testAwakeAndInBedAreNotCounted() {
  const summary = summarizeOnlyDay([
    record('in-bed', '2026-05-14T22:00:00+09:00', '2026-05-15T07:00:00+09:00', 'HKCategoryValueSleepAnalysisInBed'),
    record('awake', '2026-05-15T02:00:00+09:00', '2026-05-15T02:30:00+09:00', 'HKCategoryValueSleepAnalysisAwake'),
    record('actual-sleep', '2026-05-14T23:00:00+09:00', '2026-05-15T06:00:00+09:00'),
  ])

  assertSummary(summary, {
    totalSleepMinutes: 420,
    blockCount: 1,
    mainCount: 1,
    napCount: 0,
    supportCount: 0,
    eveningCount: 0,
  })
}

function testSleepStagesAreCounted() {
  const summary = summarizeOnlyDay([
    record('core', '2026-05-14T23:00:00+09:00', '2026-05-15T01:00:00+09:00', 'HKCategoryValueSleepAnalysisAsleepCore'),
    record('deep', '2026-05-15T01:00:00+09:00', '2026-05-15T03:00:00+09:00', 'HKCategoryValueSleepAnalysisAsleepDeep'),
    record('rem', '2026-05-15T03:00:00+09:00', '2026-05-15T05:00:00+09:00', 'HKCategoryValueSleepAnalysisAsleepREM'),
    record('unspecified', '2026-05-15T05:00:00+09:00', '2026-05-15T06:00:00+09:00', 'HKCategoryValueSleepAnalysisAsleepUnspecified'),
  ])

  assertSummary(summary, {
    totalSleepMinutes: 420,
    blockCount: 1,
    mainCount: 1,
    napCount: 0,
    supportCount: 0,
    eveningCount: 0,
  })
}

function testDataQuality() {
  const now = new Date('2026-05-15T12:00:00+09:00')
  const multipleSleepReport = checkDataQuality(
    [
      record('quality-main', '2026-05-14T23:00:00+09:00', '2026-05-15T06:00:00+09:00'),
      record('quality-nap', '2026-05-15T13:00:00+09:00', '2026-05-15T13:40:00+09:00'),
    ],
    now,
  )
  assert.equal(multipleSleepReport.hasMultipleSleepsInOneDay, true)
  assert.equal(multipleSleepReport.hasSourceInfo, false)
  assert.ok(multipleSleepReport.issues.some((issue) => issue.id === 'no-source'))

  const inBedOnlyReport = checkDataQuality(
    [record('inbed-only', '2026-05-15T00:00:00+09:00', '2026-05-15T08:00:00+09:00', 'HKCategoryValueSleepAnalysisInBed')],
    now,
  )
  assert.equal(inBedOnlyReport.level, 'insufficient')
  assert.ok(inBedOnlyReport.issues.some((issue) => issue.id === 'only-in-bed'))
  assert.ok(inBedOnlyReport.issues.some((issue) => issue.id === 'no-actual-sleep'))

  const awakeOnlyReport = checkDataQuality(
    [record('awake-only', '2026-05-15T00:00:00+09:00', '2026-05-15T01:00:00+09:00', 'HKCategoryValueSleepAnalysisAwake')],
    now,
  )
  assert.equal(awakeOnlyReport.level, 'insufficient')
  assert.ok(awakeOnlyReport.issues.some((issue) => issue.id === 'only-awake'))

  const aggregatedReport = checkDataQuality(
    [{ id: 'aggregate-like', value: 'HKCategoryValueSleepAnalysisAsleep', durationMinutes: 420 }],
    now,
  )
  assert.equal(aggregatedReport.isLikelyAggregated, true)
  assert.ok(aggregatedReport.issues.some((issue) => issue.id === 'aggregated-like'))
  assert.ok(aggregatedReport.issues.some((issue) => issue.id === 'no-date-range'))
}

async function testSourceKeyGeneration() {
  const { resolveSleepSource } = await server.ssrLoadModule('/src/lib/source/resolveSleepSource.ts')

  assert.deepEqual(resolveSleepSource({ sourceName: 'Withings Health Auto Export' }), {
    sourceKey: 'withings',
    sourceLabel: 'Withings',
    sourceApp: 'Withings',
  })
  assert.deepEqual(resolveSleepSource({ sourceName: 'Apple Watch' }), {
    sourceKey: 'apple_watch',
    sourceLabel: 'Apple Watch',
    sourceApp: 'Apple Watch',
  })
  assert.deepEqual(resolveSleepSource({ source: 'iPhone' }), {
    sourceKey: 'iphone',
    sourceLabel: 'iPhone',
    sourceApp: 'iPhone',
  })
  assert.deepEqual(resolveSleepSource({ sourceBundleId: 'com.apple.Health' }), {
    sourceKey: 'apple_health',
    sourceLabel: 'Apple Health',
    sourceApp: 'Apple Health',
  })
  assert.deepEqual(resolveSleepSource({ sourceKind: 'manual' }), {
    sourceKey: 'manual',
    sourceLabel: '手入力',
    sourceApp: '手入力',
  })
  assert.equal(resolveSleepSource({ sourceName: '睡眠アプリ' }).sourceKey.startsWith('source_'), true)
  assert.deepEqual(resolveSleepSource({}), {
    sourceKey: 'unknown_source',
    sourceLabel: '不明なソース',
  })
  assert.deepEqual(
    resolveSleepSource({
      sourceFormat: 'health_auto_export_json',
      sourceFile: 'night-export-a.json',
    }),
    {
      sourceKey: 'unknown_source:health_auto_export_json:night_export_a_json',
      sourceLabel: '不明なソース',
    },
  )
}

async function testLegacyIndexedDbRecordsUseDerivedSourceKey() {
  const previousIndexedDB = globalThis.indexedDB
  globalThis.indexedDB = createFakeIndexedDB()

  try {
    const {
      importHealthAutoExportJson,
      saveNormalizedSleepRecords,
    } = await server.ssrLoadModule('/src/lib/importers/importHealthAutoExportJson.ts')

    await saveNormalizedSleepRecords([
      {
        id: 'legacy-withings',
        value: 'asleep_core',
        sourceApp: 'Withings',
        sourceName: 'Withings Health Auto Export',
        originalValue: 'Core',
        start: '2026-05-14T23:00:00+09:00',
        end: '2026-05-15T00:00:00+09:00',
        startDate: '2026-05-14T23:00:00+09:00',
        endDate: '2026-05-15T00:00:00+09:00',
        stage: 'asleep_core',
        durationMinutes: 60,
      },
    ])

    const result = await importHealthAutoExportJson(
      'legacy-duplicate.json',
      JSON.stringify({
        metrics: [
          {
            name: 'sleep_analysis',
            data: [
              {
                startDate: '2026-05-14T23:00:00+09:00',
                endDate: '2026-05-15T00:00:00+09:00',
                value: 'Core',
                sourceName: 'Withings Health Auto Export',
              },
            ],
          },
        ],
      }),
    )

    assert.equal(result.importStats.newRecordCount, 0)
    assert.equal(result.importStats.duplicateSkippedCount, 1)
    assert.equal(result.importStats.totalSavedRecordCount, 1)
  } finally {
    globalThis.indexedDB = previousIndexedDB
  }
}

function testNormalizeSleepFileAddsSourceKeys() {
  const normalized = normalizeSleepFile(
    'mixed-normalized.json',
    JSON.stringify({
      generatedAt: '2026-05-15T00:00:00+09:00',
      records: [
        {
          id: 'watch-core',
          startDate: '2026-05-14T23:00:00+09:00',
          endDate: '2026-05-15T01:00:00+09:00',
          value: 'Core',
          sourceName: 'Apple Watch',
        },
        {
          id: 'manual-sleep',
          startDate: '2026-05-15T13:00:00+09:00',
          endDate: '2026-05-15T13:30:00+09:00',
          value: 'Asleep',
          sourceKind: 'manual',
        },
        {
          id: 'unknown-sleep',
          startDate: '2026-05-15T14:00:00+09:00',
          endDate: '2026-05-15T14:30:00+09:00',
          value: 'Asleep',
        },
      ],
    }),
  )

  assert.equal(normalized.records[0].sourceKey, 'apple_watch')
  assert.equal(normalized.records[0].sourceApp, 'Apple Watch')
  assert.equal(normalized.records[1].sourceKey, 'manual')
  assert.equal(normalized.records[1].sourceApp, '手入力')
  assert.equal(
    normalized.records[2].sourceKey,
    'unknown_source:normalized_sleep_records:mixed_normalized_json',
  )
  assert.equal(normalized.records[2].sourceApp, undefined)
}

async function testUnknownSourceKeysUseFileContext() {
  const previousIndexedDB = globalThis.indexedDB
  globalThis.indexedDB = createFakeIndexedDB()

  try {
    const { importHealthAutoExportJson } = await server.ssrLoadModule(
      '/src/lib/importers/importHealthAutoExportJson.ts',
    )
    const payload = (startDate) =>
      JSON.stringify({
        metrics: [
          {
            name: 'sleep_analysis',
            data: [
              {
                startDate,
                endDate: '2026-05-15T01:00:00+09:00',
                value: 'Core',
              },
            ],
          },
        ],
      })

    const first = await importHealthAutoExportJson('unknown-a.json', payload('2026-05-15T00:00:00+09:00'))
    const second = await importHealthAutoExportJson('unknown-b.json', payload('2026-05-15T00:00:00+09:00'))

    assert.equal(first.records[0].sourceKey, 'unknown_source:health_auto_export_json:unknown_a_json')
    assert.equal(second.records.length, 2)
    assert.ok(second.records.some((record) => record.sourceKey === 'unknown_source:health_auto_export_json:unknown_a_json'))
    assert.ok(second.records.some((record) => record.sourceKey === 'unknown_source:health_auto_export_json:unknown_b_json'))
    assert.equal(second.importStats.newRecordCount, 1)
    assert.equal(second.importStats.duplicateSkippedCount, 0)
  } finally {
    globalThis.indexedDB = previousIndexedDB
  }
}

async function testImportKeepsPartialOverlaps() {
  const previousIndexedDB = globalThis.indexedDB
  globalThis.indexedDB = createFakeIndexedDB()

  try {
    const { importHealthAutoExportJson } = await server.ssrLoadModule(
      '/src/lib/importers/importHealthAutoExportJson.ts',
    )
    const result = await importHealthAutoExportJson(
      'overlap.json',
      JSON.stringify({
        metrics: [
          {
            name: 'sleep_analysis',
            data: [
              {
                startDate: '2026-05-15T00:00:00+09:00',
                endDate: '2026-05-15T02:00:00+09:00',
                value: 'Core',
                sourceName: 'Apple Watch',
              },
              {
                startDate: '2026-05-15T01:00:00+09:00',
                endDate: '2026-05-15T03:00:00+09:00',
                value: 'Deep',
                sourceName: 'Apple Watch',
              },
            ],
          },
        ],
      }),
    )

    assert.equal(result.importStats.normalizedCount, 2)
    assert.equal(result.importStats.newRecordCount, 2)
    assert.equal(result.importStats.duplicateSkippedCount, 0)
    assert.equal(result.records.length, 2)
  } finally {
    globalThis.indexedDB = previousIndexedDB
  }
}

function testHealthAutoExportNestedDataMetrics() {
  const payload = {
    data: {
      metrics: [
        {
          name: 'sleep_analysis',
          data: [
            {
              startDate: '2026-05-18T00:00:00+09:00',
              endDate: '2026-05-18T03:00:00+09:00',
              value: 'コア',
              sourceName: 'Apple Watch',
            },
            {
              startDate: '2026-05-18T03:00:00+09:00',
              endDate: '2026-05-18T04:00:00+09:00',
              value: 'REM',
              sourceName: 'Apple Watch',
            },
            {
              startDate: '2026-05-18T04:00:00+09:00',
              endDate: '2026-05-18T05:00:00+09:00',
              value: '深い',
              sourceName: 'Apple Watch',
            },
            {
              startDate: '2026-05-18T05:00:00+09:00',
              endDate: '2026-05-18T05:05:00+09:00',
              value: '起きている',
              sourceName: 'Apple Watch',
            },
          ],
        },
      ],
    },
  }

  const audit = auditHealthAutoExportJson(payload)
  const rows = getSleepAnalysisRows(payload)

  assert.equal(audit.metricsFound, true)
  assert.equal(audit.sleepAnalysisFound, true)
  assert.equal(audit.sleepAnalysisDataFound, true)
  assert.equal(audit.isNonAggregated, true)
  assert.equal(audit.convertibleRows, 4)
  assert.equal(audit.stageCounts.asleep_core, 1)
  assert.equal(audit.stageCounts.asleep_rem, 1)
  assert.equal(audit.stageCounts.asleep_deep, 1)
  assert.equal(audit.stageCounts.awake, 1)
  assert.equal(rows.length, 4)
}

async function testHealthAutoExportImportFlow() {
  const previousIndexedDB = globalThis.indexedDB
  globalThis.indexedDB = createFakeIndexedDB()

  try {
    const {
      importHealthAutoExportJson,
      loadImportHistory,
      loadSavedNormalizedSleepRecords,
    } = await server.ssrLoadModule('/src/lib/importers/importHealthAutoExportJson.ts')

    const fileName = '任意名_睡眠export(検証).json'
    const json = JSON.stringify({
      metrics: [
        {
          name: 'sleep_analysis',
          data: [
            {
              startDate: '2026-05-14 23:00:00 +0900',
              endDate: '2026-05-15 02:00:00 +0900',
              value: 'Core',
              sourceName: 'Withings Health Auto Export',
            },
            {
              startDate: '2026-05-15 02:00:00 +0900',
              endDate: '2026-05-15 03:00:00 +0900',
              value: 'REM',
              sourceName: 'Withings Health Auto Export',
            },
            {
              startDate: '2026-05-15 03:00:00 +0900',
              endDate: '2026-05-15 06:00:00 +0900',
              value: 'Deep',
              sourceName: 'Withings Health Auto Export',
            },
            {
              startDate: '2026-05-15 13:00:00 +0900',
              endDate: '2026-05-15 13:45:00 +0900',
              value: 'Asleep',
              sourceName: 'Withings Health Auto Export',
            },
            {
              startDate: '2026-05-15 14:00:00 +0900',
              endDate: '2026-05-15 14:15:00 +0900',
              value: 'Awake',
              sourceName: 'Apple Watch',
            },
            {
              startDate: '2026-05-15 21:30:00 +0900',
              endDate: '2026-05-15 22:00:00 +0900',
              value: 'In Bed',
              source: 'iPhone',
            },
            {
              startDate: '2026-05-15 23:30:00 +0900',
              endDate: '2026-05-16 00:00:00 +0900',
              value: 'Invalid',
              sourceName: 'Withings Health Auto Export',
            },
          ],
        },
      ],
    })

    const first = await importHealthAutoExportJson(fileName, json)

    assert.equal(first.audit.status, 'needs_settings')
    assert.equal(first.audit.sleepAnalysisFound, true)
    assert.equal(first.audit.sleepAnalysisDataFound, true)
    assert.equal(first.audit.isNonAggregated, true)
    assert.equal(first.audit.hasMultipleSegmentsInOneDay, true)
    assert.equal(first.audit.sourceSummaries.length, 3)
    assert.equal(first.audit.sourceSummaries[0].sourceKey, 'withings')
    assert.equal(first.audit.sourceSummaries[1].sourceKey, 'apple_watch')
    assert.equal(first.audit.sourceSummaries[2].sourceKey, 'iphone')
    assert.equal(first.audit.convertibleRows, 6)
    assert.equal(first.audit.rejectedRows, 1)
    assert.equal(first.audit.stageCounts.asleep_core, 1)
    assert.equal(first.audit.stageCounts.asleep_rem, 1)
    assert.equal(first.audit.stageCounts.asleep_deep, 1)
    assert.equal(first.audit.stageCounts.awake, 1)
    assert.equal(first.audit.stageCounts.in_bed, 1)
    assert.equal(first.importStats.importedFileName, fileName)
    assert.equal(first.importStats.normalizedCount, 6)
    assert.equal(first.importStats.newRecordCount, 6)
    assert.equal(first.importStats.duplicateSkippedCount, 0)
    assert.equal(first.importStats.totalSavedRecordCount, 6)
    assert.equal(first.records.length, 6)
    assert.ok(first.records.some((record) => record.sourceKey === 'withings'))
    assert.ok(first.records.some((record) => record.sourceKey === 'apple_watch'))
    assert.ok(first.records.some((record) => record.sourceKey === 'iphone'))
    assert.equal(first.normalizedFile.sourceFile, fileName)
    assert.equal(first.normalizedFile.records.length, 6)

    const savedAfterFirstImport = await loadSavedNormalizedSleepRecords()
    assert.ok(savedAfterFirstImport)
    assert.equal(savedAfterFirstImport.length, 6)

    const second = await importHealthAutoExportJson(fileName, json)
    assert.equal(second.importStats.normalizedCount, 6)
    assert.equal(second.importStats.newRecordCount, 0)
    assert.equal(second.importStats.duplicateSkippedCount, 6)
    assert.equal(second.importStats.totalSavedRecordCount, 6)
    assert.equal(second.records.length, 6)

    const savedAfterSecondImport = await loadSavedNormalizedSleepRecords()
    assert.ok(savedAfterSecondImport)
    assert.equal(savedAfterSecondImport.length, 6)

    const history = await loadImportHistory()
    assert.ok(history.length >= 2)
    assert.equal(history[0].fileName, fileName)
    assert.equal(typeof history[0].importedAt, 'string')

    const summary = summarize(savedAfterSecondImport)
    assert.equal(summary.length, 1)
    assert.equal(summary[0].blockCount, 2)
    assert.equal(summary[0].napCandidateCount, 1)
    assert.ok(summary[0].fragmentation.score > 0)
    assert.ok(summary[0].circadian.score > 0)
  } finally {
    globalThis.indexedDB = previousIndexedDB
  }
}

function summarizeOnlyDay(records) {
  const summaries = summarize(records)
  assert.equal(summaries.length, 1)
  return summaries[0]
}

function summarize(records) {
  const blocks = buildSleepBlocks(records)
  const groups = groupBySleepDay(blocks)
  return groups.map((group) => summarizeSleepDay(group))
}

function summarizeUnified(records, config = {}) {
  const timeline = buildUnifiedSleepTimeline(records, config)
  const groups = groupBySleepDay(timeline.blocks, config)
  return groups.map((group) => summarizeSleepDay(group))
}

function assertSummary(
  summary,
  { totalSleepMinutes, blockCount, mainCount, napCount, supportCount, eveningCount },
) {
  const mainBlocks = summary.classifiedBlocks.filter((block) => block.labels.includes('main'))
  const supportBlocks = summary.classifiedBlocks.filter(
    (block) => !block.labels.includes('main') && !block.isNapCandidate,
  )

  assert.equal(summary.totalSleepMinutes, totalSleepMinutes)
  assert.equal(summary.blockCount, blockCount)
  assert.equal(mainBlocks.length, mainCount)
  assert.equal(summary.napCandidateCount, napCount)
  assert.equal(supportBlocks.length, supportCount)
  assert.equal(summary.eveningSleepCount, eveningCount)
  assert.equal(typeof summary.fragmentation.score, 'number')
  assert.equal(typeof summary.circadian.score, 'number')
}

function record(id, startDate, endDate, value = 'HKCategoryValueSleepAnalysisAsleepCore') {
  return {
    id,
    value,
    startDate,
    endDate,
    hasStartDate: true,
    hasEndDate: true,
  }
}

function sourceRecord(id, sourceKey, sourceLabel, startDate, endDate, stage) {
  return {
    id,
    sourceKey,
    sourceLabel,
    sourceApp: sourceLabel,
    value: stage,
    stage,
    startDate,
    endDate,
    start: startDate,
    end: endDate,
    durationMinutes: Math.max(0, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 60_000)),
    hasStartDate: true,
    hasEndDate: true,
  }
}

function createMemoryStorage() {
  const values = new Map()
  return {
    getItem(key) {
      return values.get(key) ?? null
    },
    setItem(key, value) {
      values.set(key, String(value))
    },
    removeItem(key) {
      values.delete(key)
    },
  }
}

function createFakeIndexedDB() {
  const databases = new Map()

  return {
    open(name, version) {
      const request = createRequest()

      setTimeout(() => {
        let database = databases.get(name)
        let isNewDatabase = false

        if (!database) {
          database = createFakeDatabase(name)
          databases.set(name, database)
          isNewDatabase = true
        } else if (version > database.version) {
          database.version = version
          isNewDatabase = true
        }

        request.result = database

        if (isNewDatabase && typeof request.onupgradeneeded === 'function') {
          request.onupgradeneeded({ target: request })
        }

        setTimeout(() => {
          if (typeof request.onsuccess === 'function') {
            request.onsuccess({ target: request })
          }
        }, 0)
      }, 0)

      return request
    },
  }
}

function createFakeDatabase(name) {
  const stores = new Map()

  return {
    name,
    version: 1,
    objectStoreNames: {
      contains(storeName) {
        return stores.has(storeName)
      },
    },
    createObjectStore(storeName, options = {}) {
      const store = new Map()
      stores.set(storeName, { store, keyPath: options.keyPath ?? 'id' })
      return createFakeObjectStore(store, options.keyPath ?? 'id')
    },
    transaction(storeName) {
      const entry = stores.get(storeName)

      if (!entry) {
        throw new Error(`Missing store: ${storeName}`)
      }

      const transaction = {
        oncomplete: null,
        onerror: null,
        objectStore(requestedStoreName) {
          if (requestedStoreName !== storeName) {
            throw new Error(`Missing store: ${requestedStoreName}`)
          }

          return createFakeObjectStore(entry.store, entry.keyPath, transaction)
        },
      }

      return transaction
    },
    close() {},
  }
}

function createFakeObjectStore(store, keyPath = 'id', transaction) {
  let completionScheduled = false

  const scheduleCompletion = () => {
    if (completionScheduled || !transaction) {
      return
    }

    completionScheduled = true
    setTimeout(() => {
      if (typeof transaction.oncomplete === 'function') {
        transaction.oncomplete({ target: transaction })
      }
    }, 0)
  }

  return {
    get(key) {
      const request = createRequest()
      setTimeout(() => {
        request.result = store.get(key)
        if (typeof request.onsuccess === 'function') {
          request.onsuccess({ target: request })
        }
      }, 0)
      return request
    },
    put(value) {
      const key = value?.[keyPath]
      store.set(key, value)
      scheduleCompletion()
      return createRequest()
    },
  }
}

function createRequest() {
  return {
    result: undefined,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  }
}
