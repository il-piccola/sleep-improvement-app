import assert from 'node:assert/strict'
import { buildSleepHealthDailyContexts } from '../cloud-api/src/lib/sleepHealthContext.js'
import type { DayModel, SummaryView } from '../cloud-api/src/lib/viewModels.js'
import type { HealthMetricRecordDocument } from '../cloud-api/src/types/firestore.js'

function run(): void {
  testJoinsSleepAndHealthMetricsBySleepDay()
  testKeepsCalendarActivityDatesSeparateFromSleepDay()
  testSummarizesSleepWindowMetricsBySleepDay()
  testHandlesMissingMetricsAndInsufficientData()
  testUsesOnlyAggregatedHealthMetricRecords()
  console.log('sleep health context test cases passed')
}

function testJoinsSleepAndHealthMetricsBySleepDay(): void {
  const contexts = buildSleepHealthDailyContexts({
    healthMetricRecords: [
      dailyRecord('step_count', '2026-05-22', 100),
      dailyRecord('step_count', '2026-05-23', 200),
      dailyRecord('step_count', '2026-05-24', 300),
      dailyRecord('active_energy', '2026-05-23', 20),
      dailyRecord('walking_running_distance', '2026-05-23', 1.2),
      windowRecord('heart_rate', '2026-05-23', 'main', true),
      windowRecord('respiratory_rate', '2026-05-23', 'nap', false),
      windowRecord('heart_rate_variability', '2026-05-23', 'main', true),
    ],
    summaries: [summary('2026-05-23')],
    timelineDays: [timeline('2026-05-23')],
  })
  const context = contexts[0]

  assert.equal(context.sleepDay, '2026-05-23')
  assert.equal(context.sleep.totalSleepMinutes, 390)
  assert.equal(context.sleep.mainSleepMinutes, 330)
  assert.equal(context.sleep.napMinutes, 60)
  assert.equal(context.activityMetrics.activityPreviousDate?.date, '2026-05-22')
  assert.equal(context.activityMetrics.activityOnSleepDayDate?.date, '2026-05-23')
  assert.equal(context.activityMetrics.activityOnNextDate?.date, '2026-05-24')
  assert.equal(context.dataAvailability.hasDailyActivityMetrics, true)
  assert.equal(context.dataAvailability.hasSleepWindowMetrics, true)
}

function testKeepsCalendarActivityDatesSeparateFromSleepDay(): void {
  const contexts = buildSleepHealthDailyContexts({
    healthMetricRecords: [
      dailyRecord('step_count', '2026-05-23', 200),
      dailyRecord('step_count', '2026-05-24', 300),
    ],
    summaries: [summary('2026-05-23')],
    timelineDays: [timeline('2026-05-23')],
  })

  assert.equal(contexts[0].activityMetrics.activityOnSleepDayDate?.date, '2026-05-23')
  assert.equal(contexts[0].activityMetrics.activityOnNextDate?.date, '2026-05-24')
  assert.equal(contexts[0].sleep.mainSleepStart, '2026-05-24T01:00:00+09:00')
}

function testSummarizesSleepWindowMetricsBySleepDay(): void {
  const contexts = buildSleepHealthDailyContexts({
    healthMetricRecords: [
      windowRecord('heart_rate', '2026-05-23', 'main', true, 'block-main'),
      windowRecord('heart_rate', '2026-05-23', 'nap', false, 'block-nap'),
      windowRecord('heart_rate', '2026-05-24', 'main', true, 'other-day'),
    ],
    summaries: [summary('2026-05-23')],
    timelineDays: [timeline('2026-05-23')],
  })
  const heartRate = contexts[0].sleepWindowMetrics.heart_rate

  assert.equal(heartRate?.recordCount, 2)
  assert.equal(heartRate?.blockCount, 2)
  assert.equal(heartRate?.hasMainSleepData, true)
  assert.equal(heartRate?.hasNapData, true)
  assert.equal(heartRate?.totalValueCount, 4)
  assert.ok(heartRate?.mainSleepOnlySummary)
  assert.ok(heartRate?.allSleepBlocksSummary)
}

function testHandlesMissingMetricsAndInsufficientData(): void {
  const contexts = buildSleepHealthDailyContexts({
    healthMetricRecords: [],
    summaries: [summary('2026-05-23')],
    timelineDays: [timeline('2026-05-23')],
  })

  assert.equal(contexts[0].dataAvailability.hasDailyActivityMetrics, false)
  assert.equal(contexts[0].dataAvailability.hasSleepWindowMetrics, false)
  assert.ok(contexts[0].dataAvailability.missingMetrics.includes('step_count'))
  assert.ok(contexts[0].dataAvailability.missingMetrics.includes('heart_rate'))
  assert.ok(contexts[0].candidateFlags.includes('insufficient_data'))
}

function testUsesOnlyAggregatedHealthMetricRecords(): void {
  const privateValue = 'PRIVATE_HEALTH_VALUE_SHOULD_NOT_APPEAR'
  const contexts = buildSleepHealthDailyContexts({
    healthMetricRecords: [
      {
        ...dailyRecord('step_count', '2026-05-23', 100),
        rawRow: privateValue,
      } as unknown as HealthMetricRecordDocument,
    ],
    summaries: [summary('2026-05-23')],
    timelineDays: [timeline('2026-05-23')],
  })

  assert.equal(JSON.stringify(contexts).includes(privateValue), false)
}

function summary(date: string): SummaryView {
  return {
    date,
    totalSleepMinutes: 390,
    sleepCount: 2,
    mainSleepStart: '2026-05-24T01:00:00+09:00',
    mainSleepEnd: '2026-05-24T06:30:00+09:00',
    fragmentationScore: 35,
    circadianScore: 10,
  }
}

function timeline(date: string): DayModel {
  return {
    date,
    blocks: [
      {
        start: '2026-05-24T01:00:00+09:00',
        end: '2026-05-24T06:30:00+09:00',
        durationMinutes: 330,
        type: 'main',
        sourceKeys: ['withings'],
        sourceLabels: ['Withings'],
      },
      {
        start: '2026-05-24T13:00:00+09:00',
        end: '2026-05-24T14:00:00+09:00',
        durationMinutes: 60,
        type: 'nap',
        sourceKeys: ['withings'],
        sourceLabels: ['Withings'],
      },
    ],
  }
}

function dailyRecord(
  metricName: 'step_count' | 'walking_running_distance' | 'active_energy',
  date: string,
  value: number,
): HealthMetricRecordDocument {
  return {
    recordId: `${metricName}-${date}`,
    userId: 'maya',
    metricName,
    metricGroup: 'activity',
    aggregation: 'daily_total',
    granularity: 'day',
    date,
    windowStart: `${date}T00:00:00+09:00`,
    windowEnd: '2026-05-25T00:00:00+09:00',
    value,
    unit:
      metricName === 'step_count'
        ? 'count'
        : metricName === 'active_energy'
          ? 'energy_raw'
          : 'distance_raw',
    sourceFormat: 'health_auto_export_json',
    sourceKey: 'withings',
    sourceRowCount: 1,
    sourceFileCount: 1,
    runId: 'run',
  }
}

function windowRecord(
  metricName: 'heart_rate' | 'respiratory_rate' | 'heart_rate_variability',
  sleepDay: string,
  sleepBlockType: 'main' | 'nap' | 'supplemental' | 'evening' | 'unknown',
  isMainSleep: boolean,
  sleepBlockId = `${metricName}-${sleepBlockType}`,
): HealthMetricRecordDocument {
  return {
    recordId: `${metricName}-${sleepBlockId}`,
    userId: 'maya',
    metricName,
    metricGroup: 'vitals',
    aggregation: 'sleep_window_summary',
    granularity: 'sleep_block',
    sleepDay,
    sleepBlockId,
    sleepBlockType,
    isMainSleep,
    windowStart: '2026-05-24T01:00:00.000Z',
    windowEnd: '2026-05-24T06:30:00.000Z',
    timezone: 'Asia/Tokyo',
    valueAvg: 10,
    valueMin: 5,
    valueMax: 15,
    valueCount: 2,
    unit:
      metricName === 'heart_rate'
        ? 'bpm'
        : metricName === 'respiratory_rate'
          ? 'breaths_per_min'
          : 'ms_raw',
    sourceFormat: 'health_auto_export_json',
    sourceKey: 'withings',
    sourceRowCount: 2,
    sourceFileCount: 1,
    runId: 'run',
  }
}

run()
