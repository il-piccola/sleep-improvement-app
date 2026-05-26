import assert from 'node:assert/strict'
import {
  buildDataAvailabilityReasons,
  buildSleepDayDataDiagnostics,
  DATA_DIAGNOSTIC_FORBIDDEN_TERMS,
  toDataStatusLabel,
  type SleepDayDataDiagnosticRow,
} from '../src/lib/status/sleepDayDataDiagnostics.ts'
import type { SleepHealthDailyContextView } from '../src/lib/insights/sleepHealthChangeInsights.ts'

function run(): void {
  testDailyActivityMissingReason()
  testSleepWindowMissingReason()
  testMissingMetricsReason()
  testComparisonDaysReason()
  testCurrentSleepDayWaitingReason()
  testBuildsSleepDayRows()
  testPartialAndWaitingStatuses()
  testDoesNotExposeHealthValues()
  testDoesNotUseForbiddenTerms()
  console.log('sleep day data diagnostics test cases passed')
}

function testDailyActivityMissingReason(): void {
  const reasons = buildDataAvailabilityReasons({
    comparisonDayCount: 7,
    context: context({
      hasDailyActivityMetrics: false,
      hasSleepWindowMetrics: true,
      missingMetrics: ['step_count', 'walking_running_distance', 'active_energy'],
    }),
  })

  assert.ok(reasons.some((reason) => reason.includes('歩数・活動量データがまだ少なめ')))
}

function testSleepWindowMissingReason(): void {
  const reasons = buildDataAvailabilityReasons({
    comparisonDayCount: 7,
    context: context({
      hasDailyActivityMetrics: true,
      hasSleepWindowMetrics: false,
      missingMetrics: ['heart_rate', 'respiratory_rate', 'heart_rate_variability'],
    }),
  })

  assert.ok(reasons.some((reason) => reason.includes('睡眠中の心拍・呼吸・HRVデータ')))
}

function testMissingMetricsReason(): void {
  const reasons = buildDataAvailabilityReasons({
    comparisonDayCount: 7,
    context: context({
      hasDailyActivityMetrics: true,
      hasSleepWindowMetrics: true,
      missingMetrics: ['heart_rate'],
    }),
  })

  assert.ok(reasons.some((reason) => reason.includes('心拍')))
  assert.ok(reasons.some((reason) => reason.includes('一部のヘルスメトリクス')))
}

function testComparisonDaysReason(): void {
  const reasons = buildDataAvailabilityReasons({
    comparisonDayCount: 2,
    context: context({
      hasDailyActivityMetrics: true,
      hasSleepWindowMetrics: true,
      missingMetrics: [],
    }),
  })

  assert.ok(reasons.some((reason) => reason.includes('直近比較')))
}

function testCurrentSleepDayWaitingReason(): void {
  const reasons = buildDataAvailabilityReasons({
    comparisonDayCount: 7,
    context: context({
      hasDailyActivityMetrics: true,
      hasSleepWindowMetrics: true,
      missingMetrics: [],
    }),
    currentSleepDayWaiting: true,
  })

  assert.ok(reasons.includes('現在の睡眠日はまだデータ待ちです'))
}

function testBuildsSleepDayRows(): void {
  const rows = buildSleepDayDataDiagnostics({
    contexts: [
      context({
        hasDailyActivityMetrics: true,
        hasSleepWindowMetrics: true,
        missingMetrics: [],
        sleepDay: '2026-05-23',
      }),
    ],
    displayedSleepDay: '2026-05-23',
    targetSleepDay: '2026-05-23',
  })
  const row = rows[0]

  assert.equal(row.sleepDataStatus, 'available')
  assert.equal(row.activityDataStatus, 'available')
  assert.equal(row.sleepWindowMetricStatus, 'available')
  assert.equal(row.isCurrentSleepDay, true)
  assert.equal(row.isDisplayedSleepDay, true)
}

function testPartialAndWaitingStatuses(): void {
  const rows = buildSleepDayDataDiagnostics({
    contexts: [
      context({
        hasDailyActivityMetrics: true,
        hasSleepWindowMetrics: true,
        missingMetrics: ['active_energy', 'heart_rate'],
        sleepDay: '2026-05-23',
      }),
    ],
    displayedSleepDay: '2026-05-23',
    targetSleepDay: '2026-05-24',
  })

  assert.equal(rows[0].sleepDataStatus, 'waiting')
  assert.equal(rows[0].displayLabel, '現在の睡眠日')
  assert.equal(rows[1].activityDataStatus, 'partial')
  assert.equal(rows[1].sleepWindowMetricStatus, 'partial')
  assert.equal(toDataStatusLabel(rows[1].activityDataStatus), '一部あり')
}

function testDoesNotExposeHealthValues(): void {
  const rows = buildSleepDayDataDiagnostics({
    contexts: [
      {
        ...context({
          hasDailyActivityMetrics: true,
          hasSleepWindowMetrics: true,
          missingMetrics: [],
          sleepDay: '2026-05-23',
        }),
        privateValue: 'PRIVATE_HEALTH_VALUE_SHOULD_NOT_APPEAR',
      } as unknown as SleepHealthDailyContextView,
    ],
    displayedSleepDay: '2026-05-23',
    targetSleepDay: '2026-05-23',
  })

  assert.equal(JSON.stringify(rows).includes('PRIVATE_HEALTH_VALUE_SHOULD_NOT_APPEAR'), false)
}

function testDoesNotUseForbiddenTerms(): void {
  const reasons = buildDataAvailabilityReasons({
    comparisonDayCount: 2,
    context: context({
      hasDailyActivityMetrics: false,
      hasSleepWindowMetrics: false,
      missingMetrics: ['step_count', 'heart_rate'],
    }),
    currentSleepDayWaiting: true,
  })
  const rows = buildSleepDayDataDiagnostics({
    contexts: [],
    displayedSleepDay: null,
    targetSleepDay: '2026-05-24',
  })
  const text = JSON.stringify({ reasons, rows } satisfies {
    reasons: string[]
    rows: SleepDayDataDiagnosticRow[]
  })

  for (const term of DATA_DIAGNOSTIC_FORBIDDEN_TERMS) {
    assert.equal(text.includes(term), false, `forbidden term appeared: ${term}`)
  }
}

function context({
  hasDailyActivityMetrics,
  hasSleepWindowMetrics,
  missingMetrics,
  sleepDay = '2026-05-23',
}: {
  hasDailyActivityMetrics: boolean
  hasSleepWindowMetrics: boolean
  missingMetrics: string[]
  sleepDay?: string
}): SleepHealthDailyContextView {
  return {
    candidateFlags: [],
    dataAvailability: {
      hasDailyActivityMetrics,
      hasSleepWindowMetrics,
      missingMetrics,
    },
    sleepDay,
  }
}

run()
