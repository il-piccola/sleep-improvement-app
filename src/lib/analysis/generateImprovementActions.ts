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

  if (highFragmentationDays > 0) {
    actions.set('fragmentation-review', {
      id: 'fragmentation-review',
      priority: highFragmentationDays >= 3 ? 'high' : 'medium',
      title: '分割睡眠の出方を日ごとに確認する',
      description:
        `最長睡眠だけでなく、同じ睡眠日の短い睡眠や追加の睡眠も並べて見ます。${paceGuide}`,
      basis: `直近${latestSummaries.length}睡眠日のうち${highFragmentationDays}日で分割睡眠の傾向が高めです。`,
    })
  }

  if (eveningSleepDays > 0) {
    actions.set('evening-sleep-check', {
      id: 'evening-sleep-check',
      priority: eveningSleepDays >= 3 ? 'high' : 'medium',
      title: '16:00以降に始まる睡眠を分けて見る',
      description:
        `夕方睡眠は夜の睡眠タイミングに影響しやすい可能性があるため、回数と長さを別枠で確認します。${paceGuide}`,
      basis: `直近${latestSummaries.length}睡眠日のうち${eveningSleepDays}日で夕方睡眠の目安に当てはまります。`,
    })
  }

  if (circadianTrendDays > 0) {
    actions.set('circadian-window', {
      id: 'circadian-window',
      priority: circadianTrendDays >= 3 ? 'high' : 'medium',
      title: '睡眠が日中に寄っている日を確認する',
      description:
        `昼夜逆転と断定せず、日中帯の睡眠比率が高い日を傾向として確認します。目標起床時刻は${normalizedConfig.targetWakeTime}です。${paceGuide}`,
      basis: `直近${latestSummaries.length}睡眠日のうち${circadianTrendDays}日で昼夜逆転の傾向が中くらい以上です。`,
    })
  }

  if (hasDurationOnly) {
    actions.set('data-quality', {
      id: 'data-quality',
      priority: 'low',
      title: '開始・終了時刻つきデータで再確認する',
      description:
        '匿名化サンプルや duration のみのデータでは、18:00区切りや夕方睡眠の判定は参考値になります。',
      basis: '時刻がない睡眠ブロックが含まれています。',
    })
  }

  if (actions.size === 0) {
    actions.set('continue-tracking', {
      id: 'continue-tracking',
      priority: 'low',
      title: '同じ条件で記録を続ける',
      description:
        `目立つ傾向が少ない日も、睡眠ブロック数と時間帯を同じ基準で見続けます。目標起床時刻は${normalizedConfig.targetWakeTime}です。${paceGuide}`,
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
