import assert from 'node:assert/strict'
import {
  buildSleepHealthChangeInsights,
  FORBIDDEN_HEALTH_CHANGE_TERMS,
  type SleepHealthDailyContextView,
} from '../src/lib/insights/sleepHealthChangeInsights.ts'

function run(): void {
  testInsufficientData()
  testCandidateFlags()
  testMetricAvailability()
  testMissingMetrics()
  testDoesNotUseForbiddenTerms()
  console.log('sleep health change insight test cases passed')
}

function testInsufficientData(): void {
  const insights = buildSleepHealthChangeInsights(context(['insufficient_data']))

  assert.ok(insights.some((insight) => insight.title.includes('データが少なめ')))
}

function testCandidateFlags(): void {
  const insights = buildSleepHealthChangeInsights(
    context(['fragmented_sleep_candidate', 'late_main_sleep_candidate']),
  )
  const titles = insights.map((insight) => insight.title)

  assert.ok(titles.includes('睡眠が複数回に分かれています'))
  assert.ok(titles.includes('主睡眠の開始が遅めの日です'))
}

function testMetricAvailability(): void {
  const insights = buildSleepHealthChangeInsights(
    context([], {
      hasDailyActivityMetrics: true,
      hasSleepWindowMetrics: true,
      missingMetrics: [],
    }),
  )
  const titles = insights.map((insight) => insight.title)

  assert.ok(titles.includes('歩数・活動量のデータがあります'))
  assert.ok(titles.includes('睡眠中の心拍・呼吸・HRVデータがあります'))
}

function testMissingMetrics(): void {
  const insights = buildSleepHealthChangeInsights(
    context([], {
      hasDailyActivityMetrics: true,
      hasSleepWindowMetrics: false,
      missingMetrics: ['heart_rate'],
    }),
  )

  assert.ok(
    insights.some((insight) => insight.title.includes('一部のヘルスメトリクス')),
  )
}

function testDoesNotUseForbiddenTerms(): void {
  const insights = buildSleepHealthChangeInsights(
    context(['insufficient_data', 'fragmented_sleep_candidate', 'late_main_sleep_candidate'], {
      hasDailyActivityMetrics: true,
      hasSleepWindowMetrics: true,
      missingMetrics: ['heart_rate'],
    }),
  )
  const text = JSON.stringify(insights)

  for (const term of FORBIDDEN_HEALTH_CHANGE_TERMS) {
    assert.equal(text.includes(term), false, `forbidden term appeared: ${term}`)
  }
  assert.equal(text.includes('PRIVATE_HEALTH_VALUE_SHOULD_NOT_APPEAR'), false)
}

function context(
  candidateFlags: string[],
  dataAvailability: SleepHealthDailyContextView['dataAvailability'] = {
    hasDailyActivityMetrics: false,
    hasSleepWindowMetrics: false,
    missingMetrics: [],
  },
): SleepHealthDailyContextView {
  return {
    sleepDay: '2026-05-23',
    candidateFlags,
    dataAvailability,
  }
}

run()
