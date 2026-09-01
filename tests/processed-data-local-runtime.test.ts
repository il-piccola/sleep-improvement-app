import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadLatestProcessedData, buildProcessedSleepHealthContext } from '../server/processedData.ts'
import {
  publishProcessedSnapshot,
  validateCompletedSnapshot,
} from '../processor/snapshot.ts'
import {
  DEFAULT_PROCESSOR_CONFIG,
  PROCESSOR_IDENTITY_POLICY_VERSION,
} from '../processor/types.ts'

const root = await mkdtemp(join(tmpdir(), 'sleep-compass-local-runtime-'))

try {
  const published = await publishProcessedSnapshot({
    processedDataRoot: root,
    snapshotId: '20260826T000000Z-localruntime',
    processorVersion: 'test',
    processorRevision: 'synthetic',
    processingConfig: DEFAULT_PROCESSOR_CONFIG,
    identityPolicyVersion: PROCESSOR_IDENTITY_POLICY_VERSION,
    content: {
      inputFiles: [{
        sourceFileId: 'src-synthetic',
        relativePath: 'Sleep/synthetic.json',
        fileName: 'synthetic.json',
        size: 42,
        modifiedAt: '2026-08-25T15:00:00.000Z',
        sha256: 'a'.repeat(64),
        format: 'health_auto_export_json',
        status: 'processed',
        processedRecordCount: 1,
        rejectedRowCount: 0,
        warningCount: 0,
      }],
      sleepRecords: [{
        recordId: 'record-synthetic',
        stage: 'asleep',
        originalValue: 'HKCategoryValueSleepAnalysisAsleep',
        start: '2026-08-25T23:00:00+09:00',
        end: '2026-08-26T06:00:00+09:00',
        durationMinutes: 420,
        sourceKey: 'synthetic_source',
        sourceFormat: 'health_auto_export_json',
        sourceFileId: 'src-synthetic',
        integrationStatus: 'adopted',
        integrationReasonCode: 'independent',
      }],
      sleepBlocks: [{
        blockId: 'block-synthetic',
        sleepDay: '2026-08-25',
        start: '2026-08-25T23:00:00+09:00',
        end: '2026-08-26T06:00:00+09:00',
        durationMinutes: 420,
        timeConfidence: 'actual',
        blockType: 'main',
        isMainSleep: true,
        sourceRecordIds: ['record-synthetic'],
        sourceKeys: ['synthetic_source'],
        stageSegments: [{
          start: '2026-08-25T23:00:00+09:00',
          end: '2026-08-26T06:00:00+09:00',
          durationMinutes: 420,
          stage: 'asleep',
        }],
      }],
      sleepDays: [{
        sleepDay: '2026-08-25',
        boundaryStart: '2026-08-25T18:00:00+09:00',
        boundaryEnd: '2026-08-26T18:00:00+09:00',
        blockIds: ['block-synthetic'],
        mainSleepBlockId: 'block-synthetic',
        blockCount: 1,
        totalSleepMinutes: 420,
        longestBlockMinutes: 420,
        napBlockCount: 0,
        eveningBlockCount: 0,
      }],
      sourceSummaries: [{
        sourceKey: 'synthetic_source',
        recordCount: 1,
        fullDuplicateCount: 0,
        partialOverlapCount: 0,
        adoptedRecordCount: 1,
        excludedDuplicateCount: 0,
        warningCodes: [],
      }],
      overlaps: [],
      healthMetrics: [
        {
          metricRecordId: 'metric-steps',
          metricName: 'step_count',
          metricGroup: 'activity',
          aggregation: 'daily_total',
          granularity: 'day',
          date: '2026-08-25',
          sleepDay: null,
          sleepDayBoundaryHour: null,
          sleepBlockId: null,
          sleepBlockType: null,
          isMainSleep: null,
          windowStart: '2026-08-25T00:00:00+09:00',
          windowEnd: '2026-08-26T00:00:00+09:00',
          timeZone: 'Asia/Tokyo',
          value: 1200,
          valueAvg: null,
          valueMin: null,
          valueMax: null,
          valueCount: null,
          unit: 'count',
          sourceKey: 'synthetic_source',
          sourceFileCount: 1,
          sourceRowCount: 1,
        },
        {
          metricRecordId: 'metric-heart-rate',
          metricName: 'heart_rate',
          metricGroup: 'vitals',
          aggregation: 'sleep_window_summary',
          granularity: 'sleep_block',
          date: null,
          sleepDay: '2026-08-25',
          sleepDayBoundaryHour: 18,
          sleepBlockId: 'block-synthetic',
          sleepBlockType: 'main',
          isMainSleep: true,
          windowStart: '2026-08-25T23:00:00+09:00',
          windowEnd: '2026-08-26T06:00:00+09:00',
          timeZone: 'Asia/Tokyo',
          value: null,
          valueAvg: 60,
          valueMin: 50,
          valueMax: 70,
          valueCount: 10,
          unit: 'bpm',
          sourceKey: 'synthetic_source',
          sourceFileCount: 1,
          sourceRowCount: 10,
        },
      ],
      diagnostics: {
        status: 'completed',
        inputFileCount: 1,
        processedFileCount: 1,
        failedFileCount: 0,
        sleepRecordCount: 1,
        rejectedRowCount: 0,
        warningCount: 0,
        warnings: [],
      },
    },
  })

  await validateCompletedSnapshot(published.snapshotDir)
  const runtime = await loadLatestProcessedData(root)
  assert.ok(runtime)
  assert.equal(runtime.snapshotId, '20260826T000000Z-localruntime')
  assert.equal(runtime.records.length, 1)
  assert.equal(runtime.records[0]?.id, 'record-synthetic')
  assert.equal(runtime.records[0]?.sourceKind, 'processed_data')
  assert.equal(runtime.latestImport?.importedFileName, 'synthetic.json')
  assert.equal(runtime.analysis.summaries.length, 1)

  const contexts = buildProcessedSleepHealthContext(runtime)
  assert.equal(contexts.length, 1)
  assert.equal(contexts[0]?.dataAvailability.hasDailyActivityMetrics, true)
  assert.equal(contexts[0]?.dataAvailability.hasSleepWindowMetrics, true)
  assert.deepEqual(contexts[0]?.dataAvailability.missingMetrics, [
    'walking_running_distance',
    'active_energy',
    'respiratory_rate',
    'heart_rate_variability',
  ])

  assert.equal(await loadLatestProcessedData(join(root, 'missing')), null)
  console.log('processed-data local runtime tests passed')
} finally {
  await rm(root, { recursive: true, force: true })
}
