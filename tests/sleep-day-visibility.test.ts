import assert from 'node:assert/strict'
import {
  buildSleepDayBoundaryNotice,
  formatSleepDayBoundaryWindowLabel,
  getSleepDayBoundaryScaleLabels,
  getSleepDayBoundaryStart,
  getSleepDayKeyForDate,
} from '../src/lib/analysis/sleepDayBoundary.ts'
import {
  buildSleepDayDisplayStatus,
  SLEEP_DAY_BOUNDARY_NOTICE,
  SLEEP_DAY_VISIBILITY_FORBIDDEN_TERMS,
} from '../src/lib/status/sleepDayVisibility.ts'

function run(): void {
  testCurrentSleepDayHasData()
  testFallbackSleepDayExplainsReason()
  testBoundaryHourChangesNotice()
  testBoundaryHourChangesWindowAndScale()
  testBoundaryHourChangesBoundaryStart()
  testSleepDayKeyUsesShiftedDateDefinition()
  testNoDataState()
  testDoesNotUseForbiddenTerms()
  console.log('sleep day visibility test cases passed')
}

function testCurrentSleepDayHasData(): void {
  const status = buildSleepDayDisplayStatus({
    displayedSleepDayKey: '2026-05-24',
    isFallbackSleepDay: false,
    targetSleepDayKey: '2026-05-24',
  })

  assert.equal(status.currentSleepDayLabel, '表示中')
  assert.equal(status.isCurrentSleepDayWaiting, false)
  assert.equal(status.boundaryNotice, SLEEP_DAY_BOUNDARY_NOTICE)
  assert.equal(status.reason.includes('最新の睡眠日を表示'), false)
}

function testFallbackSleepDayExplainsReason(): void {
  const status = buildSleepDayDisplayStatus({
    boundaryHour: 12,
    displayedSleepDayKey: '2026-05-23',
    isFallbackSleepDay: true,
    targetSleepDayKey: '2026-05-24',
  })

  assert.equal(status.currentSleepDayLabel, 'データ待ち')
  assert.equal(status.isCurrentSleepDayWaiting, true)
  assert.equal(status.boundaryNotice, buildSleepDayBoundaryNotice(12))
  assert.ok(status.boundaryNotice.includes('12:00'))
  assert.equal(status.boundaryNotice.includes('18:00'), false)
  assert.ok(status.reason.includes('現在の睡眠日はまだデータ待ち'))
  assert.ok(status.reason.includes('2026-05-23の睡眠日'))
}

function testBoundaryHourChangesNotice(): void {
  assert.equal(
    buildSleepDayBoundaryNotice(6),
    '睡眠日は6:00で区切っています。6:00より前の睡眠は前日の睡眠日として表示されます。',
  )
}

function testBoundaryHourChangesWindowAndScale(): void {
  assert.equal(formatSleepDayBoundaryWindowLabel(12), '12:00 - 翌12:00')
  assert.deepEqual(getSleepDayBoundaryScaleLabels(12), [
    '12:00',
    '18:00',
    '0:00',
    '6:00',
    '12:00',
  ])
}

function testBoundaryHourChangesBoundaryStart(): void {
  assert.equal(getSleepDayBoundaryStart('2026-05-24', 6).getHours(), 6)
  assert.equal(getSleepDayBoundaryStart('2026-05-24', 12).getHours(), 12)
}

function testSleepDayKeyUsesShiftedDateDefinition(): void {
  assert.equal(getSleepDayKeyForDate(new Date('2026-05-24T03:00:00+09:00'), 18), '2026-05-23')
  assert.equal(getSleepDayKeyForDate(new Date('2026-05-24T18:00:00+09:00'), 18), '2026-05-24')
  assert.equal(getSleepDayKeyForDate(new Date('2026-05-25T03:00:00+09:00'), 6), '2026-05-24')
  assert.equal(getSleepDayKeyForDate(new Date('2026-05-25T06:00:00+09:00'), 6), '2026-05-25')
  assert.equal(getSleepDayKeyForDate(new Date('2026-05-25T11:59:00+09:00'), 12), '2026-05-24')
}

function testNoDataState(): void {
  const status = buildSleepDayDisplayStatus({
    displayedSleepDayKey: null,
    isFallbackSleepDay: false,
    targetSleepDayKey: '2026-05-24',
  })

  assert.equal(status.currentSleepDayLabel, 'データ待ち')
  assert.equal(status.isCurrentSleepDayWaiting, true)
  assert.ok(status.reason.includes('2026-05-24'))
}

function testDoesNotUseForbiddenTerms(): void {
  const status = buildSleepDayDisplayStatus({
    displayedSleepDayKey: '2026-05-23',
    isFallbackSleepDay: true,
    targetSleepDayKey: '2026-05-24',
  })
  const text = JSON.stringify(status)

  for (const term of SLEEP_DAY_VISIBILITY_FORBIDDEN_TERMS) {
    assert.equal(text.includes(term), false, `forbidden term appeared: ${term}`)
  }
}

run()
