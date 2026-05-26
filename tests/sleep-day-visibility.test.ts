import assert from 'node:assert/strict'
import {
  buildSleepDayDisplayStatus,
  SLEEP_DAY_BOUNDARY_NOTICE,
  SLEEP_DAY_VISIBILITY_FORBIDDEN_TERMS,
} from '../src/lib/status/sleepDayVisibility.ts'

function run(): void {
  testCurrentSleepDayHasData()
  testFallbackSleepDayExplainsReason()
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
    displayedSleepDayKey: '2026-05-23',
    isFallbackSleepDay: true,
    targetSleepDayKey: '2026-05-24',
  })

  assert.equal(status.currentSleepDayLabel, 'データ待ち')
  assert.equal(status.isCurrentSleepDayWaiting, true)
  assert.ok(status.reason.includes('現在の睡眠日はまだデータ待ち'))
  assert.ok(status.reason.includes('2026-05-23の睡眠日'))
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
