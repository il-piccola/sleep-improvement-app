import assert from 'node:assert/strict'
import {
  getSleepDayKeyForDate,
  normalizeSleepDayBoundaryHour,
} from '../cloud-api/src/lib/sleepDayBoundary.js'
import {
  buildDayModels,
  getSleepDayMonthQueryRange,
  parseMonthKey,
} from '../cloud-api/src/lib/viewModels.js'
import type { SleepRecordDocument } from '../cloud-api/src/types/firestore.js'

function run(): void {
  testBoundaryDefinitionAcrossRepresentativeHours()
  testBoundaryNormalization()
  testMonthParsing()
  testMonthQueryRangeUsesBoundaryHour()
  testViewModelsExposeStageSegments()
  testViewModelsUseBoundaryHour()
  console.log('cloud api sleep day boundary test cases passed')
}

function testBoundaryDefinitionAcrossRepresentativeHours(): void {
  assert.equal(getSleepDayKeyForDate('2026-05-25T00:00:00+09:00', 0), '2026-05-25')
  assert.equal(getSleepDayKeyForDate('2026-05-25T05:59:00+09:00', 6), '2026-05-24')
  assert.equal(getSleepDayKeyForDate('2026-05-25T06:00:00+09:00', 6), '2026-05-25')
  assert.equal(getSleepDayKeyForDate('2026-05-25T08:59:00+09:00', 9), '2026-05-24')
  assert.equal(getSleepDayKeyForDate('2026-05-25T09:00:00+09:00', 9), '2026-05-25')
  assert.equal(getSleepDayKeyForDate('2026-05-25T12:59:00+09:00', 13), '2026-05-24')
  assert.equal(getSleepDayKeyForDate('2026-05-25T13:00:00+09:00', 13), '2026-05-25')
  assert.equal(getSleepDayKeyForDate('2026-05-25T17:59:00+09:00', 18), '2026-05-24')
  assert.equal(getSleepDayKeyForDate('2026-05-25T18:00:00+09:00', 18), '2026-05-25')
  assert.equal(getSleepDayKeyForDate('2026-05-25T22:59:00+09:00', 23), '2026-05-24')
  assert.equal(getSleepDayKeyForDate('2026-05-25T23:00:00+09:00', 23), '2026-05-25')
}

function testBoundaryNormalization(): void {
  assert.equal(normalizeSleepDayBoundaryHour(-1), 0)
  assert.equal(normalizeSleepDayBoundaryHour(24), 23)
  assert.equal(normalizeSleepDayBoundaryHour('13'), 13)
  assert.equal(normalizeSleepDayBoundaryHour('not-a-number', 9), 9)
}

function testMonthParsing(): void {
  assert.equal(parseMonthKey('2026-06'), '2026-06')
  assert.equal(parseMonthKey('2026-6'), null)
  assert.equal(parseMonthKey('2026-13'), null)
  assert.equal(parseMonthKey('not-a-month'), null)
}

function testMonthQueryRangeUsesBoundaryHour(): void {
  const sixHourRange = getSleepDayMonthQueryRange('2026-06', 6)
  const thirteenHourRange = getSleepDayMonthQueryRange('2026-06', 13)

  assert.equal(sixHourRange.from, '2026-05-31T21:00:00.000Z')
  assert.equal(sixHourRange.to, '2026-06-30T21:00:00.000Z')
  assert.equal(thirteenHourRange.from, '2026-06-01T04:00:00.000Z')
  assert.equal(thirteenHourRange.to, '2026-07-01T04:00:00.000Z')
  assert.equal(sixHourRange.maxRecords, 3840)
}

function testViewModelsUseBoundaryHour(): void {
  const records = [
    sleepRecord('before-9', '2026-05-25T08:30:00+09:00', '2026-05-25T09:15:00+09:00'),
    sleepRecord('after-9', '2026-05-25T10:30:00+09:00', '2026-05-25T11:00:00+09:00'),
  ]
  const nineHourDays = buildDayModels(records, 9).map((day) => day.date)
  const eighteenHourDays = buildDayModels(records, 18).map((day) => day.date)

  assert.deepEqual(nineHourDays, ['2026-05-25', '2026-05-24'])
  assert.deepEqual(eighteenHourDays, ['2026-05-24'])
}

function testViewModelsExposeStageSegments(): void {
  const records = [
    sleepRecord('core', '2026-05-25T01:00:00+09:00', '2026-05-25T02:00:00+09:00', 'asleep_core'),
    sleepRecord('rem', '2026-05-25T02:00:00+09:00', '2026-05-25T02:30:00+09:00', 'asleep_rem'),
    sleepRecord('deep', '2026-05-25T02:30:00+09:00', '2026-05-25T03:00:00+09:00', 'asleep_deep'),
  ]
  const [day] = buildDayModels(records, 18)
  const [block] = day.blocks

  assert.equal(block.stageSegments.length, 3)
  assert.deepEqual(
    block.stageSegments.map((segment) => segment.stage),
    ['asleep_core', 'asleep_rem', 'asleep_deep'],
  )
  assert.deepEqual(
    block.stageSegments.map((segment) => segment.durationMinutes),
    [60, 30, 30],
  )
}

function sleepRecord(
  id: string,
  start: string,
  end: string,
  stage: SleepRecordDocument['stage'] = 'asleep_core',
): SleepRecordDocument {
  return {
    recordId: id,
    userId: 'maya',
    batchId: 'batch',
    start,
    end,
    durationMinutes: Math.round((Date.parse(end) - Date.parse(start)) / 60_000),
    stage,
    originalValue: 'Core',
    sourceKey: 'apple_watch',
    sourceFormat: 'health_auto_export_json',
    sourceFile: 'sample.json',
  }
}

run()
