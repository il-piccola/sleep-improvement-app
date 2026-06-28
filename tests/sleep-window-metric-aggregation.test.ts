import assert from 'node:assert/strict'
import { aggregateSleepWindowMetrics } from '../cloud-api/src/lib/sleepWindowMetricAggregator.js'
import type { SleepRecordDocument } from '../cloud-api/src/types/firestore.js'

function run(): void {
  testAggregatesHeartRateWithinSleepWindow()
  testAggregatesRespiratoryRateAndHrv()
  testUsesOnlyOverlappingRows()
  testDateOnlyFallbackAndTimezoneParsing()
  testKeepsSourcesSeparate()
  testSkipsNonH2bMetrics()
  testRecordIdIsIdempotent()
  testUsesConfigurableSleepDayBoundary()
  testDoesNotPersistRawRowsOrMetricData()
  console.log('sleep window metric aggregation test cases passed')
}

function testAggregatesHeartRateWithinSleepWindow(): void {
  const result = aggregateSleepWindowMetrics({
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
    runId: 'run-a',
    sleepRecords: [sleepRecord('a', '2026-05-25T00:30:00+09:00', '2026-05-25T03:00:00+09:00')],
    sourceFile: 'sample.json',
    userId: 'maya',
  })
  const record = result.records[0]

  assert.equal(record.metricName, 'heart_rate')
  assert.equal(record.aggregation, 'sleep_window_summary')
  assert.equal(record.granularity, 'sleep_block')
  assert.equal(record.valueAvg, 75)
  assert.equal(record.valueMin, 60)
  assert.equal(record.valueMax, 95)
  assert.equal(record.valueCount, 2)
  assert.equal(record.unit, 'bpm')
  assert.equal(record.sleepDay, '2026-05-24')
  assert.equal(record.sleepDayBoundaryHour, 18)
  assert.equal(record.isMainSleep, true)
}

function testAggregatesRespiratoryRateAndHrv(): void {
  const result = aggregateSleepWindowMetrics({
    input: {
      metrics: [
        {
          name: 'respiratory_rate',
          data: [
            { qty: 14, start: '2026-05-25T01:00:00+09:00', end: '2026-05-25T01:05:00+09:00', source: 'Watch' },
            { qty: 16, start: '2026-05-25T01:10:00+09:00', end: '2026-05-25T01:15:00+09:00', source: 'Watch' },
          ],
        },
        {
          name: 'heart_rate_variability',
          data: [
            { qty: 30, start: '2026-05-25T01:00:00+09:00', end: '2026-05-25T01:05:00+09:00', source: 'Watch' },
          ],
        },
      ],
    },
    runId: 'run-a',
    sleepRecords: [sleepRecord('a', '2026-05-25T00:30:00+09:00', '2026-05-25T03:00:00+09:00')],
    sourceFile: 'sample.json',
    userId: 'maya',
  })
  const respiratory = result.records.find((record) => record.metricName === 'respiratory_rate')
  const hrv = result.records.find((record) => record.metricName === 'heart_rate_variability')

  assert.equal(respiratory?.valueAvg, 15)
  assert.equal(respiratory?.valueMin, 14)
  assert.equal(respiratory?.valueMax, 16)
  assert.equal(respiratory?.unit, 'breaths_per_min')
  assert.equal(hrv?.valueAvg, 30)
  assert.equal(hrv?.unit, 'ms_raw')
}

function testUsesOnlyOverlappingRows(): void {
  const result = aggregateSleepWindowMetrics({
    input: {
      metrics: [
        {
          name: 'respiratory_rate',
          data: [
            { qty: 14, start: '2026-05-25T01:00:00+09:00', end: '2026-05-25T01:05:00+09:00', source: 'Watch' },
            { qty: 20, start: '2026-05-25T04:00:00+09:00', end: '2026-05-25T04:05:00+09:00', source: 'Watch' },
          ],
        },
      ],
    },
    runId: 'run-a',
    sleepRecords: [sleepRecord('a', '2026-05-25T00:30:00+09:00', '2026-05-25T03:00:00+09:00')],
    sourceFile: 'sample.json',
    userId: 'maya',
  })

  assert.equal(result.records.length, 1)
  assert.equal(result.records[0].valueCount, 1)
  assert.equal(result.records[0].valueAvg, 14)
}

function testDateOnlyFallbackAndTimezoneParsing(): void {
  const result = aggregateSleepWindowMetrics({
    input: {
      metrics: [
        {
          name: 'respiratory_rate',
          data: [
            { qty: 14, date: '2026-05-25 01:00:00 +0900', source: 'Watch' },
            { qty: 16, date: '2026-05-25 01:10:00', source: 'Watch' },
          ],
        },
      ],
    },
    runId: 'run-a',
    sleepRecords: [sleepRecord('a', '2026-05-25T00:30:00+09:00', '2026-05-25T03:00:00+09:00')],
    sourceFile: 'sample.json',
    userId: 'maya',
  })

  assert.equal(result.records[0].valueCount, 2)
  assert.equal(result.records[0].valueAvg, 15)
}

function testKeepsSourcesSeparate(): void {
  const result = aggregateSleepWindowMetrics({
    input: {
      metrics: [
        {
          name: 'respiratory_rate',
          data: [
            { qty: 14, start: '2026-05-25T01:00:00+09:00', end: '2026-05-25T01:05:00+09:00', source: 'Apple Watch' },
            { qty: 16, start: '2026-05-25T01:00:00+09:00', end: '2026-05-25T01:05:00+09:00', source: 'iPhone' },
          ],
        },
      ],
    },
    runId: 'run-a',
    sleepRecords: [sleepRecord('a', '2026-05-25T00:30:00+09:00', '2026-05-25T03:00:00+09:00')],
    sourceFile: 'sample.json',
    userId: 'maya',
  })

  assert.deepEqual(result.records.map((record) => record.sourceKey).sort(), ['apple_watch', 'iphone'])
}

function testSkipsNonH2bMetrics(): void {
  const result = aggregateSleepWindowMetrics({
    input: {
      metrics: [
        { name: 'step_count', data: [{ qty: 10, date: '2026-05-25T01:00:00+09:00' }] },
        { name: 'active_energy', data: [{ qty: 10, date: '2026-05-25T01:00:00+09:00' }] },
        { name: 'sleep_analysis', data: [{ value: 'Core' }] },
      ],
    },
    runId: 'run-a',
    sleepRecords: [sleepRecord('a', '2026-05-25T00:30:00+09:00', '2026-05-25T03:00:00+09:00')],
    sourceFile: 'sample.json',
    userId: 'maya',
  })

  assert.equal(result.records.length, 0)
}

function testRecordIdIsIdempotent(): void {
  const input = {
    metrics: [
      {
        name: 'respiratory_rate',
        data: [{ qty: 14, start: '2026-05-25T01:00:00+09:00', end: '2026-05-25T01:05:00+09:00', source: 'Watch' }],
      },
    ],
  }
  const sleepRecords = [sleepRecord('a', '2026-05-25T00:30:00+09:00', '2026-05-25T03:00:00+09:00')]
  const first = aggregateSleepWindowMetrics({ input, runId: 'run-a', sleepRecords, sourceFile: 'sample.json', userId: 'maya' })
  const second = aggregateSleepWindowMetrics({ input, runId: 'run-b', sleepRecords, sourceFile: 'sample.json', userId: 'maya' })

  assert.equal(first.records[0].recordId, second.records[0].recordId)
}

function testUsesConfigurableSleepDayBoundary(): void {
  const result = aggregateSleepWindowMetrics({
    boundaryHour: 9,
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
    runId: 'run-a',
    sleepRecords: [sleepRecord('a', '2026-05-25T08:00:00+09:00', '2026-05-25T09:30:00+09:00')],
    sourceFile: 'sample.json',
    userId: 'maya',
  })

  assert.equal(result.records[0].sleepDay, '2026-05-24')
  assert.equal(result.records[0].sleepDayBoundaryHour, 9)
}

function testDoesNotPersistRawRowsOrMetricData(): void {
  const privateValue = 'PRIVATE_HEALTH_VALUE_SHOULD_NOT_APPEAR'
  const result = aggregateSleepWindowMetrics({
    input: {
      metrics: [
        {
          name: 'respiratory_rate',
          data: [{ qty: privateValue, start: '2026-05-25T01:00:00+09:00', end: '2026-05-25T01:05:00+09:00' }],
        },
      ],
    },
    runId: 'run-a',
    sleepRecords: [sleepRecord('a', '2026-05-25T00:30:00+09:00', '2026-05-25T03:00:00+09:00')],
    sourceFile: 'sample.json',
    userId: 'maya',
  })

  assert.equal(result.records.length, 0)
  assert.equal(JSON.stringify(result).includes(privateValue), false)
}

function sleepRecord(id: string, start: string, end: string): SleepRecordDocument {
  return {
    recordId: id,
    userId: 'maya',
    batchId: 'batch',
    start,
    end,
    durationMinutes: Math.round((Date.parse(end) - Date.parse(start)) / 60_000),
    stage: 'asleep_core',
    originalValue: 'Core',
    sourceKey: 'apple_watch',
    sourceFormat: 'health_auto_export_json',
    sourceFile: 'sample.json',
  }
}

run()
