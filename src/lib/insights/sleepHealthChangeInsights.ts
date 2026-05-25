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
      description: '数日分がそろうと、睡眠と活動の見直しポイントを並べやすくなります。',
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
