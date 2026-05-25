import assert from 'node:assert/strict'
import { aggregateHealthAutoExportMetrics } from '../cloud-api/src/lib/healthMetricAggregator.js'

function run(): void {
  testAggregatesActivityMetricsByTokyoDay()
  testKeepsSourcesSeparateAndUnknownSource()
  testParsesHealthAutoExportDateFormatsAsTokyoDay()
  testSkipsNonH2aMetrics()
  testRecordIdIsIdempotent()
  testDoesNotPersistRawRowsOrMetricData()
  console.log('health metric aggregation test cases passed')
}

function testParsesHealthAutoExportDateFormatsAsTokyoDay(): void {
  const result = aggregateHealthAutoExportMetrics({
    input: {
      metrics: [
        {
          name: 'step_count',
          data: [
            { date: '2026-05-24 23:30:00 +0900', qty: 10, source: 'Apple Watch' },
            { date: '2026-05-25 00:30:00', qty: 20, source: 'Apple Watch' },
            { date: '2026-05-25', qty: 30, source: 'Apple Watch' },
          ],
        },
      ],
    },
    runId: 'run-a',
    sourceFile: 'sample.json',
    userId: 'maya',
  })

  const byDate = new Map(result.records.map((record) => [record.date, record]))

  assert.equal(byDate.get('2026-05-24')?.value, 10)
  assert.equal(byDate.get('2026-05-25')?.value, 50)
}

function testAggregatesActivityMetricsByTokyoDay(): void {
  const result = aggregateHealthAutoExportMetrics({
    input: {
      metrics: [
        {
          name: 'step_count',
          data: [
            { date: '2026-05-24T23:30:00Z', qty: 10, source: 'Apple Watch' },
            { date: '2026-05-25T00:30:00+09:00', qty: 20, source: 'Apple Watch' },
          ],
        },
        {
          name: 'walking_running_distance',
          data: [{ date: '2026-05-25T01:00:00+09:00', qty: 1.5, source: 'Apple Watch' }],
        },
        {
          name: 'active_energy',
          data: [{ date: '2026-05-25T02:00:00+09:00', qty: 2.5, source: 'Apple Watch' }],
        },
      ],
    },
    runId: 'run-a',
    sourceFile: 'sample.json',
    userId: 'maya',
  })

  const steps = result.records.find((record) => record.metricName === 'step_count')
  const distance = result.records.find((record) => record.metricName === 'walking_running_distance')
  const energy = result.records.find((record) => record.metricName === 'active_energy')

  assert.equal(result.targetMetricCount, 3)
  assert.equal(steps?.date, '2026-05-25')
  assert.equal(steps?.value, 30)
  assert.equal(steps?.unit, 'count')
  assert.equal(distance?.unit, 'distance_raw')
  assert.equal(energy?.unit, 'energy_raw')
  assert.equal(steps?.windowStart, '2026-05-25T00:00:00+09:00')
  assert.equal(steps?.windowEnd, '2026-05-26T00:00:00+09:00')
}

function testKeepsSourcesSeparateAndUnknownSource(): void {
  const result = aggregateHealthAutoExportMetrics({
    input: {
      metrics: [
        {
          name: 'step_count',
          data: [
            { date: '2026-05-25T01:00:00+09:00', qty: 10, source: 'Apple Watch' },
            { date: '2026-05-25T01:00:00+09:00', qty: 20, source: 'iPhone' },
            { date: '2026-05-25T01:00:00+09:00', qty: 30 },
          ],
        },
      ],
    },
    runId: 'run-a',
    sourceFile: 'sample.json',
    userId: 'maya',
  })

  const keys = result.records.map((record) => record.sourceKey).sort()

  assert.deepEqual(keys, ['apple_watch', 'iphone', 'unknown_source'])
  assert.equal(result.records.length, 3)
}

function testSkipsNonH2aMetrics(): void {
  const result = aggregateHealthAutoExportMetrics({
    input: {
      metrics: [
        {
          name: 'sleep_analysis',
          data: [{ startDate: '2026-05-25T01:00:00+09:00', endDate: '2026-05-25T02:00:00+09:00', value: 'Core' }],
        },
        {
          name: 'heart_rate',
          data: [{ date: '2026-05-25T01:00:00+09:00', Avg: 70, source: 'Apple Watch' }],
        },
        {
          name: 'basal_energy_burned',
          data: [{ date: '2026-05-25T01:00:00+09:00', qty: 1, source: 'Apple Watch' }],
        },
        {
          name: 'step_count',
          data: [{ date: '2026-05-25T01:00:00+09:00', qty: 10, source: 'Apple Watch' }],
        },
      ],
    },
    runId: 'run-a',
    sourceFile: 'sample.json',
    userId: 'maya',
  })

  assert.equal(result.records.length, 1)
  assert.equal(result.records[0].metricName, 'step_count')
}

function testRecordIdIsIdempotent(): void {
  const input = {
    metrics: [
      {
        name: 'step_count',
        data: [{ date: '2026-05-25T01:00:00+09:00', qty: 10, source: 'Apple Watch' }],
      },
    ],
  }
  const first = aggregateHealthAutoExportMetrics({
    input,
    runId: 'run-a',
    sourceFile: 'sample.json',
    userId: 'maya',
  })
  const second = aggregateHealthAutoExportMetrics({
    input,
    runId: 'run-b',
    sourceFile: 'sample.json',
    userId: 'maya',
  })

  assert.equal(first.records[0].recordId, second.records[0].recordId)
}

function testDoesNotPersistRawRowsOrMetricData(): void {
  const privateValue = 'PRIVATE_HEALTH_VALUE_SHOULD_NOT_APPEAR'
  const result = aggregateHealthAutoExportMetrics({
    input: {
      metrics: [
        {
          name: 'step_count',
          data: [{ date: '2026-05-25T01:00:00+09:00', qty: privateValue, source: 'Apple Watch' }],
        },
      ],
    },
    runId: 'run-a',
    sourceFile: 'sample.json',
    userId: 'maya',
  })

  assert.equal(result.records.length, 0)
  assert.equal(JSON.stringify(result).includes(privateValue), false)
}

run()
