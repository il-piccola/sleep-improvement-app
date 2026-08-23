import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { processCanonicalSleep } from '../processor/canonicalSleep.ts'
import { aggregateProcessorDailyHealthMetrics } from '../processor/dailyHealthMetrics.ts'
import { aggregateProcessorSleepWindowHealthMetrics } from '../processor/sleepWindowHealthMetrics.ts'
import { DEFAULT_PROCESSOR_CONFIG, type ProcessorConfig } from '../processor/types.ts'
import type { SleepRecord } from '../src/types/sleep.ts'

function run(): void {
  testDailyMetricsAreCanonicalAndCloudIndependent()
  testSleepWindowMetricsUseCanonicalBlocks()
  testSleepWindowBoundaryComesFromProcessorConfig()
  testProcessorMetricSourcesHaveNoCloudRuntimeIdentity()
  testRejectedRawValueDoesNotLeak()
  console.log('processor health metric tests passed')
}

function testDailyMetricsAreCanonicalAndCloudIndependent(): void {
  const result = aggregateProcessorDailyHealthMetrics({
    input: {
      metrics: [
        {
          name: 'step_count',
          data: [
            { date: '2026-05-24T23:30:00Z', qty: 10, source: 'Apple Watch' },
            { date: '2026-05-25T00:30:00+09:00', qty: 20, source: 'Apple Watch' },
          ],
        },
      ],
    },
    config: DEFAULT_PROCESSOR_CONFIG,
  })
  const record = result.records[0]

  assert.equal(result.targetMetricCount, 1)
  assert.equal(record?.metricName, 'step_count')
  assert.equal(record?.date, '2026-05-25')
  assert.equal(record?.value, 30)
  assert.equal(record?.windowStart, '2026-05-25T00:00:00+09:00')
  assert.equal(record?.windowEnd, '2026-05-26T00:00:00+09:00')
  assert.equal(record?.timeZone, 'Asia/Tokyo')
  assert.equal('userId' in (record ?? {}), false)
  assert.equal('runId' in (record ?? {}), false)
}

function testSleepWindowMetricsUseCanonicalBlocks(): void {
  const canonical = processCanonicalSleep([
    sleepRecord(
      'sleep-a',
      '2026-05-25T00:30:00+09:00',
      '2026-05-25T03:00:00+09:00',
      'C:\\Users\\example\\Health Auto Export\\Sleep\\a.json',
    ),
  ])
  const result = aggregateProcessorSleepWindowHealthMetrics({
    blocks: canonical.blocks,
    config: canonical.config,
    input: {
      metrics: [
        {
          name: 'heart_rate',
          data: [
            {
              Avg: 70,
              Min: 60,
              Max: 90,
              start: '2026-05-25T01:00:00+09:00',
              end: '2026-05-25T01:05:00+09:00',
              source: 'Apple Watch',
            },
            {
              Avg: 80,
              Min: 65,
              Max: 95,
              start: '2026-05-25T02:00:00+09:00',
              end: '2026-05-25T02:05:00+09:00',
              source: 'Apple Watch',
            },
          ],
        },
      ],
    },
  })
  const record = result.records[0]

  assert.equal(record?.aggregation, 'sleep_window_summary')
  assert.equal(record?.valueAvg, 75)
  assert.equal(record?.valueMin, 60)
  assert.equal(record?.valueMax, 95)
  assert.equal(record?.valueCount, 2)
  assert.equal(record?.sleepDay, '2026-05-24')
  assert.equal(record?.sleepDayBoundaryHour, 18)
  assert.equal(record?.sleepBlockId, canonical.blocks[0]?.blockId)
  assert.equal(record?.isMainSleep, true)
}

function testSleepWindowBoundaryComesFromProcessorConfig(): void {
  const config: ProcessorConfig = {
    ...DEFAULT_PROCESSOR_CONFIG,
    sleepDayBoundaryHour: 9,
  }
  const canonical = processCanonicalSleep(
    [sleepRecord('sleep-b', '2026-05-25T08:00:00+09:00', '2026-05-25T09:30:00+09:00')],
    config,
  )
  const result = aggregateProcessorSleepWindowHealthMetrics({
    blocks: canonical.blocks,
    config,
    input: {
      metrics: [
        {
          name: 'respiratory_rate',
          data: [
            {
              qty: 14,
              start: '2026-05-25T08:30:00+09:00',
              end: '2026-05-25T08:35:00+09:00',
              source: 'Watch',
            },
          ],
        },
      ],
    },
  })

  assert.equal(result.records[0]?.sleepDay, '2026-05-24')
  assert.equal(result.records[0]?.sleepDayBoundaryHour, 9)
}

function testProcessorMetricSourcesHaveNoCloudRuntimeIdentity(): void {
  for (const file of [
    '../processor/healthMetricTypes.ts',
    '../processor/dailyHealthMetrics.ts',
    '../processor/sleepWindowHealthMetrics.ts',
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.equal(/\buserId\b/.test(source), false, `${file} must not use userId`)
    assert.equal(/\brunId\b/.test(source), false, `${file} must not use runId`)
    assert.equal(/firebase|firestore|cloud-api/i.test(source), false, `${file} must not depend on Cloud/Firebase`)
  }
}

function testRejectedRawValueDoesNotLeak(): void {
  const privateValue = 'PRIVATE_HEALTH_VALUE_SHOULD_NOT_APPEAR'
  const result = aggregateProcessorDailyHealthMetrics({
    input: {
      metrics: [
        {
          name: 'step_count',
          data: [{ date: '2026-05-25T01:00:00+09:00', qty: privateValue, source: 'Apple Watch' }],
        },
      ],
    },
    config: DEFAULT_PROCESSOR_CONFIG,
  })

  assert.equal(result.records.length, 0)
  assert.equal(JSON.stringify(result).includes(privateValue), false)
}

function sleepRecord(
  id: string,
  start: string,
  end: string,
  sourceFile = 'sample.json',
): SleepRecord {
  return {
    id,
    value: 'asleep_core',
    stage: 'asleep_core',
    sourceKey: 'apple_watch',
    sourceFormat: 'health_auto_export_json',
    sourceFile,
    start,
    end,
    startDate: start,
    endDate: end,
    durationMinutes: Math.round((Date.parse(end) - Date.parse(start)) / 60_000),
  }
}

run()
