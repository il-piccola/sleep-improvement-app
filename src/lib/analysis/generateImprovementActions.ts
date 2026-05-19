import type { AnalysisConfig, ImprovementAction, SleepDaySummary } from '../../types/sleep'
import { normalizeAnalysisConfig } from '../../types/sleep'

export function generateImprovementActions(
  summaries: SleepDaySummary[],
  config: Partial<AnalysisConfig> = {},
): ImprovementAction[] {
  const normalizedConfig = normalizeAnalysisConfig(config)
  const actions = new Map<string, ImprovementAction>()
  const latestSummaries = summaries.slice(-7)
  const paceGuide = getPaceGuide(normalizedConfig.improvementPace)
  const highFragmentationDays = latestSummaries.filter(
    (summary) => summary.fragmentation.level === 'high',
  ).length
  const eveningSleepDays = latestSummaries.filter(
    (summary) => summary.eveningSleepCount > 0,
  ).length
  const circadianTrendDays = latestSummaries.filter(
    (summary) => summary.circadian.level !== 'low',
  ).length
  const hasDurationOnly = latestSummaries.some((summary) =>
    summary.classifiedBlocks.some((block) => block.timeConfidence !== 'actual'),
  )

  actions.set('morning-light', {
    id: 'morning-light',
    priority: circadianTrendDays > 0 ? 'high' : 'medium',
    title: '起きたら30分以内に外の光を入れる',
    description:
      `カーテンを開ける、ベランダに出る、短く外を歩くなど、朝の明るさを先に入れます。目標起床時刻は${normalizedConfig.targetWakeTime}です。${paceGuide}`,
    basis:
      circadianTrendDays > 0
        ? `直近${latestSummaries.length}睡眠日のうち${circadianTrendDays}日で睡眠が遅めまたは日中寄りの傾向です。`
        : '起床時刻を整えるための基本行動です。',
  })

  actions.set('wake-anchor', {
    id: 'wake-anchor',
    priority: 'medium',
    title: '眠り直す前に一度、起床の合図を作る',
    description:
      `起きたら水分を取る、顔を洗う、部屋を明るくするなど、短い起床ルーティンを先に入れます。眠り直す場合も、起きた時刻をぼかさないのが目安です。${paceGuide}`,
    basis: `目標起床時刻は${normalizedConfig.targetWakeTime}です。`,
  })

  if (highFragmentationDays > 0) {
    actions.set('nap-window', {
      id: 'nap-window',
      priority: highFragmentationDays >= 3 ? 'high' : 'medium',
      title: '仮眠は早めの時間に短く区切る',
      description:
        `日中に眠る場合は、できれば夕方前までにして、アラームで短めに区切ります。長く眠りたい日は「補助睡眠」として扱い、夜の寝始め時刻も一緒に見ます。${paceGuide}`,
      basis: `直近${latestSummaries.length}睡眠日のうち${highFragmentationDays}日で分割睡眠の傾向が高めです。`,
    })
  }

  if (eveningSleepDays > 0) {
    actions.set('evening-reset', {
      id: 'evening-reset',
      priority: eveningSleepDays >= 3 ? 'high' : 'medium',
      title: '16時以降の眠気は、まず横にならずに休む',
      description:
        `夕方に眠気が強い時は、暗い部屋で長く寝る前に、座って目を閉じる、軽く散歩する、入浴や夕食の時刻を整えるなどから選びます。横になるなら短いアラームを使います。${paceGuide}`,
      basis: `直近${latestSummaries.length}睡眠日のうち${eveningSleepDays}日で夕方睡眠の目安に当てはまります。`,
    })
  }

  if (circadianTrendDays > 0) {
    actions.set('night-wind-down', {
      id: 'night-wind-down',
      priority: circadianTrendDays >= 3 ? 'high' : 'medium',
      title: '寝る前30分は、刺激を弱める時間にする',
      description:
        `寝る直前の作業、強い光、長い動画を少し早めに切り上げます。完全にやめるより、照明を落とす、通知を切る、明日の準備だけにするくらいで始めます。${paceGuide}`,
      basis: `直近${latestSummaries.length}睡眠日のうち${circadianTrendDays}日で昼夜逆転の傾向が中くらい以上です。`,
    })
  }

  if (hasDurationOnly) {
    actions.set('gentle-day', {
      id: 'gentle-day',
      priority: 'low',
      title: '今日は小さな行動だけに絞る',
      description:
        '時刻の細かさが足りない日は、睡眠を細かく判断しすぎず、朝の光、短い仮眠、寝る前の刺激を弱める、のうち1つだけ選びます。',
      basis: '時刻がない睡眠ブロックが含まれるため、行動は控えめな目安にしています。',
    })
  }

  if (actions.size <= 2) {
    actions.set('steady-evening', {
      id: 'steady-evening',
      priority: 'low',
      title: '夜の開始時刻を毎日少しだけそろえる',
      description:
        `就寝時刻を大きく変えるより、寝る前に始める行動を1つ固定します。歯磨き、照明を落とす、翌日の準備など、同じ順番で始めるのが目安です。${paceGuide}`,
      basis: '直近の睡眠日では強い注意目安が少なめです。',
    })
  }

  return Array.from(actions.values())
}

function getPaceGuide(pace: AnalysisConfig['improvementPace']): string {
  if (pace === 'slow') {
    return '今日は小さく1つだけ試すくらいで十分です。'
  }

  if (pace === 'firm') {
    return '今日は時間帯を少し意識して、できる範囲で整えます。'
  }

  return '今日は無理なく続けられる範囲で試します。'
}
