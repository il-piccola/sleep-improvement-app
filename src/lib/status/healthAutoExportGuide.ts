export type HealthAutoExportGuideSection = {
  title: string
  description?: string
  items: string[]
}

export type HealthAutoExportGuide = {
  intro: string
  outputSections: HealthAutoExportGuideSection[]
  recoverySteps: string[]
  recoveryNote: string
}

export const healthAutoExportGuide: HealthAutoExportGuide = {
  intro: '睡眠改善アプリで使うデータだけを出力すると、同期が軽くなります。',
  outputSections: [
    {
      title: '最低限',
      items: ['睡眠分析'],
    },
    {
      title: '活動量',
      items: ['歩数', '歩行＋ランニング距離', 'アクティブエネルギー'],
    },
    {
      title: '睡眠中メトリクス',
      items: ['心拍数', '呼吸数', '心拍変動 / HRV'],
    },
    {
      title: '今は出さなくてよいもの',
      description: '行数が多い項目は、出力が重くなることがあります。',
      items: ['基礎代謝', '階段', 'ヘッドフォン音量', '歩行速度', '歩幅', '歩行非対称性', '両脚支持時間'],
    },
  ],
  recoverySteps: [
    'まずHealth Auto Exportで「睡眠分析だけ」を出力する',
    '期間を直近1日に絞る',
    'それで進んだら、歩数・距離・アクティブエネルギーを追加する',
    '心拍数・呼吸数・HRVは最後に追加する',
    '基礎代謝など重い項目はいったん外す',
    '出力後、Google Driveに新しいJSONがあるか確認する',
    'その後、アプリ側で手動同期するか、翌朝8時の自動同期を待つ',
  ],
  recoveryNote:
    'まずは睡眠分析だけ、次に活動量、最後に心拍・呼吸・HRVを追加する順番がおすすめです。',
}

export const forbiddenOperationalGuideTerms = ['異常', '診断', '原因', '悪化', 'リスク', '改善します']

export function getHealthAutoExportGuideText(guide: HealthAutoExportGuide = healthAutoExportGuide) {
  return [
    guide.intro,
    ...guide.outputSections.flatMap((section) => [
      section.title,
      section.description ?? '',
      ...section.items,
    ]),
    ...guide.recoverySteps,
    guide.recoveryNote,
  ]
    .filter(Boolean)
    .join('\n')
}
