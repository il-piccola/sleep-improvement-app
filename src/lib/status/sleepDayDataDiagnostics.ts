import type { SleepHealthDailyContextView } from '../insights/sleepHealthChangeInsights'

export type SleepDayDataStatus = 'available' | 'partial' | 'waiting' | 'not_available'

export type SleepDayDataDiagnosticRow = {
  sleepDay: string
  isCurrentSleepDay: boolean
  isDisplayedSleepDay: boolean
  sleepDataStatus: SleepDayDataStatus
  activityDataStatus: SleepDayDataStatus
  sleepWindowMetricStatus: SleepDayDataStatus
  activityLabels: string[]
  sleepWindowMetricLabels: string[]
  displayLabel: string
}

export const ACTIVITY_METRICS = [
  'step_count',
  'walking_running_distance',
  'active_energy',
] as const

export const SLEEP_WINDOW_METRICS = [
  'heart_rate',
  'respiratory_rate',
  'heart_rate_variability',
] as const

const metricLabels: Record<string, string> = {
  active_energy: '活動量',
  heart_rate: '心拍',
  heart_rate_variability: 'HRV',
  respiratory_rate: '呼吸',
  step_count: '歩数',
  walking_running_distance: '距離',
}

export const DATA_DIAGNOSTIC_FORBIDDEN_TERMS = [
  '異常',
  '失敗',
  '原因',
  '悪化',
  '診断',
  'リスク',
  '改善します',
]

export function buildDataAvailabilityReasons({
  context,
  currentSleepDayWaiting = false,
  comparisonDayCount = 0,
}: {
  context: SleepHealthDailyContextView | null | undefined
  currentSleepDayWaiting?: boolean
  comparisonDayCount?: number
}): string[] {
  const reasons: string[] = []

  if (currentSleepDayWaiting) {
    reasons.push('現在の睡眠日はまだデータ待ちです')
  }

  if (!context) {
    reasons.push('睡眠データが届くと、見直し候補を表示しやすくなります')
    return dedupe(reasons)
  }

  if (comparisonDayCount < 3 || context.candidateFlags.includes('insufficient_data')) {
    reasons.push('直近比較に使える日数がまだ少なめです')
  }

  const missingMetrics = new Set(context.dataAvailability.missingMetrics)

  if (!context.dataAvailability.hasDailyActivityMetrics) {
    reasons.push('睡眠データはありますが、歩数・活動量データがまだ少なめです')
  } else {
    const missingActivity = ACTIVITY_METRICS.filter((metric) => missingMetrics.has(metric))

    if (missingActivity.length > 0) {
      reasons.push(`${missingActivity.map(toMetricLabel).join('・')}データはまだ取得できていません`)
    }
  }

  if (!context.dataAvailability.hasSleepWindowMetrics) {
    reasons.push('睡眠中の心拍・呼吸・HRVデータがまだ少なめです')
  } else {
    const missingSleepWindow = SLEEP_WINDOW_METRICS.filter((metric) => missingMetrics.has(metric))

    if (missingSleepWindow.length > 0) {
      reasons.push(`睡眠中の${missingSleepWindow.map(toMetricLabel).join('・')}データはまだ取得できていません`)
    }
  }

  if (missingMetrics.size > 0) {
    reasons.push('一部のヘルスメトリクスはまだ取得できていません')
  }

  return dedupe(reasons).slice(0, 4)
}

export function buildSleepDayDataDiagnostics({
  contexts,
  displayedSleepDay,
  limit = 7,
  targetSleepDay,
}: {
  contexts: SleepHealthDailyContextView[]
  displayedSleepDay?: string | null
  limit?: number
  targetSleepDay: string
}): SleepDayDataDiagnosticRow[] {
  const rows = [...contexts]
    .sort((left, right) => right.sleepDay.localeCompare(left.sleepDay))
    .slice(0, Math.max(1, limit))
    .map((context) => contextToRow(context, targetSleepDay, displayedSleepDay))

  const hasCurrentSleepDay = rows.some((row) => row.sleepDay === targetSleepDay)

  if (!hasCurrentSleepDay) {
    rows.unshift({
      activityDataStatus: 'waiting',
      activityLabels: [],
      displayLabel: '現在の睡眠日',
      isCurrentSleepDay: true,
      isDisplayedSleepDay: false,
      sleepDataStatus: 'waiting',
      sleepDay: targetSleepDay,
      sleepWindowMetricLabels: [],
      sleepWindowMetricStatus: 'waiting',
    })
  }

  return rows.slice(0, Math.max(1, limit))
}

export function toDataStatusLabel(status: SleepDayDataStatus): string {
  switch (status) {
    case 'available':
      return 'あり'
    case 'partial':
      return '一部あり'
    case 'waiting':
      return 'データ待ち'
    case 'not_available':
      return '未取得'
  }
}

function contextToRow(
  context: SleepHealthDailyContextView,
  targetSleepDay: string,
  displayedSleepDay?: string | null,
): SleepDayDataDiagnosticRow {
  const missingMetrics = new Set(context.dataAvailability.missingMetrics)
  const activityLabels = ACTIVITY_METRICS.filter((metric) => !missingMetrics.has(metric)).map(
    toMetricLabel,
  )
  const sleepWindowMetricLabels = SLEEP_WINDOW_METRICS.filter(
    (metric) => !missingMetrics.has(metric),
  ).map(toMetricLabel)

  return {
    activityDataStatus: getGroupStatus(
      context.dataAvailability.hasDailyActivityMetrics,
      activityLabels.length,
      ACTIVITY_METRICS.length,
    ),
    activityLabels,
    displayLabel:
      context.sleepDay === targetSleepDay
        ? '現在の睡眠日'
        : context.sleepDay === displayedSleepDay
          ? '表示中'
          : '記録あり',
    isCurrentSleepDay: context.sleepDay === targetSleepDay,
    isDisplayedSleepDay: context.sleepDay === displayedSleepDay,
    sleepDataStatus: 'available',
    sleepDay: context.sleepDay,
    sleepWindowMetricLabels,
    sleepWindowMetricStatus: getGroupStatus(
      context.dataAvailability.hasSleepWindowMetrics,
      sleepWindowMetricLabels.length,
      SLEEP_WINDOW_METRICS.length,
    ),
  }
}

function getGroupStatus(
  hasGroupData: boolean,
  availableCount: number,
  totalCount: number,
): SleepDayDataStatus {
  if (!hasGroupData || availableCount === 0) {
    return 'not_available'
  }

  return availableCount >= totalCount ? 'available' : 'partial'
}

function toMetricLabel(metricName: string): string {
  return metricLabels[metricName] ?? metricName
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)]
}
