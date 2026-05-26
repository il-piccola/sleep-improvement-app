export type SleepHealthCandidateFlag =
  | 'insufficient_data'
  | 'fragmented_sleep_candidate'
  | 'late_main_sleep_candidate'
  | string

export type SleepHealthDailyContextView = {
  sleepDay: string
  candidateFlags: SleepHealthCandidateFlag[]
  dataAvailability: {
    hasDailyActivityMetrics: boolean
    hasSleepWindowMetrics: boolean
    missingMetrics: string[]
  }
  sleep?: {
    sleepBlockCount?: number
    splitSleepScore?: number
    circadianReversalScore?: number
  }
}

export type SleepHealthChangeInsight = {
  id: string
  title: string
  description: string
  tone: 'calm' | 'notice' | 'good'
}

export const FORBIDDEN_HEALTH_CHANGE_TERMS = [
  '原因',
  '悪化',
  '診断',
  '改善します',
  '異常',
  'リスク',
] as const

const activityMetrics = ['step_count', 'walking_running_distance', 'active_energy'] as const
const sleepWindowMetrics = ['heart_rate', 'respiratory_rate', 'heart_rate_variability'] as const

export function buildSleepHealthChangeInsights(
  context: SleepHealthDailyContextView | null | undefined,
): SleepHealthChangeInsight[] {
  if (!context) {
    return [
      {
        id: 'waiting-for-context',
        title: '変化候補はデータ取得後に表示します',
        description: '睡眠と活動の記録がそろうと、見直しポイントをここに並べます。',
        tone: 'calm',
      },
    ]
  }

  const insights: SleepHealthChangeInsight[] = []
  const flags = new Set(context.candidateFlags)

  if (flags.has('insufficient_data')) {
    insights.push({
      id: 'insufficient-data',
      title: 'まだ傾向を見るにはデータが少なめです',
      description: getInsufficientDataDescription(context),
      tone: 'calm',
    })
  }

  if (flags.has('fragmented_sleep_candidate')) {
    insights.push({
      id: 'fragmented-sleep',
      title: '睡眠が複数回に分かれています',
      description: '主睡眠と仮眠の時間帯を一緒に見て、まとまり方を確認できます。',
      tone: 'notice',
    })
  }

  if (flags.has('late_main_sleep_candidate')) {
    insights.push({
      id: 'late-main-sleep',
      title: '主睡眠の開始が遅めの日です',
      description: '起きる時刻と朝の光を合わせて、翌日のリズムを見直す候補にします。',
      tone: 'notice',
    })
  }

  if (context.dataAvailability.hasDailyActivityMetrics) {
    insights.push({
      id: 'daily-activity-present',
      title: '歩数・活動量のデータがあります',
      description: '睡眠日の前後の活動量を、あとから睡眠の形と並べて確認できます。',
      tone: 'good',
    })
  }

  if (context.dataAvailability.hasSleepWindowMetrics) {
    insights.push({
      id: 'sleep-window-metrics-present',
      title: '睡眠中の心拍・呼吸・HRVデータがあります',
      description: '実数値は前面に出さず、睡眠ブロックごとの記録有無を見ています。',
      tone: 'good',
    })
  }

  if (context.dataAvailability.missingMetrics.length > 0) {
    insights.push({
      id: 'missing-metrics',
      title: '一部のヘルスメトリクスはまだ取得できていません',
      description: '取得できた範囲だけで、控えめに見直し候補を表示します。',
      tone: 'calm',
    })
  }

  if (insights.length === 0) {
    insights.push({
      id: 'no-candidate-flags',
      title: '大きな見直し候補はまだ出ていません',
      description: '記録が増えると、睡眠と活動の並びから気づきを拾いやすくなります。',
      tone: 'calm',
    })
  }

  return dedupeInsights(insights).slice(0, 5)
}

function getInsufficientDataDescription(context: SleepHealthDailyContextView): string {
  const missingMetrics = new Set(context.dataAvailability.missingMetrics)

  if (!context.dataAvailability.hasDailyActivityMetrics) {
    return '睡眠データはありますが、歩数・活動量データがまだ少なめです。'
  }

  if (!context.dataAvailability.hasSleepWindowMetrics) {
    return '睡眠中の心拍・呼吸・HRVデータがまだ少なめです。'
  }

  const hasMissingActivity = activityMetrics.some((metric) => missingMetrics.has(metric))
  const hasMissingSleepWindow = sleepWindowMetrics.some((metric) => missingMetrics.has(metric))

  if (hasMissingActivity && hasMissingSleepWindow) {
    return '活動量と睡眠中メトリクスの一部がまだ取得できていません。'
  }

  if (hasMissingActivity) {
    return '歩数・距離・活動量の一部がまだ取得できていません。'
  }

  if (hasMissingSleepWindow) {
    return '睡眠中の心拍・呼吸・HRVの一部がまだ取得できていません。'
  }

  return '直近比較に使える日数がまだ少なめです。'
}

function dedupeInsights(insights: SleepHealthChangeInsight[]): SleepHealthChangeInsight[] {
  const seen = new Set<string>()

  return insights.filter((insight) => {
    if (seen.has(insight.id)) {
      return false
    }

    seen.add(insight.id)
    return true
  })
}
