import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  filterProcessedRecords,
  filterProcessedSleepHealthContext,
  loadLatestProcessedData,
  parseProcessedDataQuery,
  type ProcessedDataRuntime,
} from '../server/processedData.ts'
import {
  DEFAULT_PROCESSOR_CONFIG,
  PROCESSOR_IDENTITY_POLICY_VERSION,
} from '../processor/types.ts'
import { publishProcessedSnapshot } from '../processor/snapshot.ts'

function makeRuntime(): ProcessedDataRuntime {
  const records = Array.from({ length: 32 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 5, index + 1)).toISOString().slice(0, 10)
    return {
      id: `record-${date}`,
      value: 'Asleep',
      sourceKey: 'test',
      start: `${date}T22:00:00+09:00`,
      end: `${date}T23:00:00+09:00`,
      stage: 'asleep' as const,
    }
  })

  return {
    snapshotId: 'test-snapshot',
    generatedAt: '2026-07-01T00:00:00.000Z',
    processorVersion: 'test',
    processingConfig: DEFAULT_PROCESSOR_CONFIG,
    records,
    analysis: {} as ProcessedDataRuntime['analysis'],
    warnings: [],
    latestImport: null,
    inputFiles: [],
    healthMetrics: [],
    sleepDays: records.map((record) => ({ sleepDay: record.start.slice(0, 10) })),
    diagnostics: {},
  }
}

function testQueryValidation(): void {
  const valid = parseProcessedDataQuery(new URLSearchParams('month=2026-06&boundaryHour=9'), 18)
  assert.equal(valid.error, null)
  assert.deepEqual(valid.query, { month: '2026-06', days: null, boundaryHour: 9 })
  assert.match(
    parseProcessedDataQuery(new URLSearchParams('month=2026-06&days=31'), 18).error ?? '',
    /mutually exclusive/,
  )
  assert.match(
    parseProcessedDataQuery(new URLSearchParams('days=0'), 18).error ?? '',
    /positive integer/,
  )
  assert.match(
    parseProcessedDataQuery(new URLSearchParams('boundaryHour=24'), 18).error ?? '',
    /0 to 23/,
  )
}

function testDaysAndMonthFiltering(): void {
  const runtime = makeRuntime()
  const days = parseProcessedDataQuery(new URLSearchParams('days=31'), 18)
  assert.equal(days.error, null)
  if (days.error) return
  const latest = filterProcessedRecords(runtime, days.query)
  assert.equal(latest.records.length, 31)
  assert.equal(latest.range.sleepDayCount, 31)
  assert.equal(latest.range.firstSleepDay, '2026-06-02')
  assert.equal(latest.range.lastSleepDay, '2026-07-02')

  const month = parseProcessedDataQuery(new URLSearchParams('month=2026-06'), 18)
  assert.equal(month.error, null)
  if (month.error) return
  const selectedMonth = filterProcessedRecords(runtime, month.query)
  assert.equal(selectedMonth.records.length, 30)
  assert.equal(selectedMonth.range.type, 'month')
}

function testCustomBoundaryKeepsBoundaryRecords(): void {
  const runtime = makeRuntime()
  runtime.records = [
    { ...runtime.records[0]!, id: 'before', start: '2026-06-01T08:30:00+09:00' },
    { ...runtime.records[0]!, id: 'at', start: '2026-06-01T09:00:00+09:00' },
  ]
  const query = parseProcessedDataQuery(new URLSearchParams('month=2026-06&boundaryHour=9'), 18)
  assert.equal(query.error, null)
  if (query.error) return
  const filtered = filterProcessedRecords(runtime, query.query)
  assert.deepEqual(filtered.records.map((record) => record.id), ['at'])
}

function testContextFiltering(): void {
  const runtime = makeRuntime()
  runtime.sleepDays = [
    { sleepDay: '2026-06-01', blockCount: 1 },
    { sleepDay: '2026-06-02', blockCount: 1 },
    { sleepDay: '2026-05-31', blockCount: 1 },
  ]
  const query = parseProcessedDataQuery(new URLSearchParams('days=2'), 18)
  assert.equal(query.error, null)
  if (query.error) return
  const filtered = filterProcessedSleepHealthContext(runtime, query.query)
  assert.deepEqual(filtered.days.map((day) => day.sleepDay), ['2026-06-01', '2026-06-02'])
  assert.equal(filtered.range.contextCount, 2)
}

async function testSnapshotCacheSwitchesOnlyOnCompletedSnapshot(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'sleep-compass-server-scope-'))
  try {
    const content = {
      inputFiles: [], sleepRecords: [], sleepBlocks: [], sleepDays: [],
      sourceSummaries: [], overlaps: [], healthMetrics: [],
      diagnostics: {
        status: 'completed', inputFileCount: 0, processedFileCount: 0,
        failedFileCount: 0, sleepRecordCount: 0, rejectedRowCount: 0,
        warningCount: 0, warnings: [],
      },
    }
    await publishProcessedSnapshot({
      processedDataRoot: root,
      snapshotId: '20260601T000000Z-first',
      processorVersion: 'test',
      processorRevision: 'test',
      processingConfig: DEFAULT_PROCESSOR_CONFIG,
      identityPolicyVersion: PROCESSOR_IDENTITY_POLICY_VERSION,
      content,
    })
    await mkdir(join(root, 'snapshots', '.working', 'incomplete'), { recursive: true })
    const first = await loadLatestProcessedData(root)
    const second = await loadLatestProcessedData(root)
    assert.ok(first)
    assert.equal(first, second)
    assert.equal(first.snapshotId, '20260601T000000Z-first')

    await publishProcessedSnapshot({
      processedDataRoot: root,
      snapshotId: '20260602T000000Z-second',
      processorVersion: 'test',
      processorRevision: 'test',
      processingConfig: DEFAULT_PROCESSOR_CONFIG,
      identityPolicyVersion: PROCESSOR_IDENTITY_POLICY_VERSION,
      content,
    })
    const switched = await loadLatestProcessedData(root)
    assert.ok(switched)
    assert.notEqual(switched, first)
    assert.equal(switched.snapshotId, '20260602T000000Z-second')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

testQueryValidation()
testDaysAndMonthFiltering()
testCustomBoundaryKeepsBoundaryRecords()
testContextFiltering()
await testSnapshotCacheSwitchesOnlyOnCompletedSnapshot()
console.log('server processed-data scope tests passed')
