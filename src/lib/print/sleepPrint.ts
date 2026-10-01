import type { AnalysisConfig, ClassifiedSleepBlock, SleepDaySummary, NormalizedSleepStage } from '../../types/sleep'
import { getSleepDayBoundaryScaleLabels, getSleepDayBoundaryStart } from '../analysis/sleepDayBoundary'

export type PrintMode = 'compact' | 'full'
export type PrintReportKind = 'timeline' | 'fragmentation'
export function getPrintTimelineScaleLabels(boundaryHour: number) {
  return getSleepDayBoundaryScaleLabels(boundaryHour).map((label, index) => {
    const hour = label.split(':')[0].padStart(2, '0')
    return `${index === 4 ? '翌' : ''}${hour}:00`
  })
}
export function toPrintBlockLabel(label: string) {
  return ({ main: '主睡眠候補', napCandidate: '仮眠候補', eveningSleep: '夕方睡眠', other: 'その他' } as Record<string, string>)[label] ?? label
}

export function getPrintTimeline(summary: SleepDaySummary, boundaryHour: number) {
  const start = getSleepDayBoundaryStart(summary.sleepDayKey, boundaryHour).getTime()
  const end = start + 24 * 60 * 60 * 1000
  return summary.classifiedBlocks.map((block) => {
    if (!block.startDate || !block.endDate) return null
    const from = Math.max(start, new Date(block.startDate).getTime())
    const to = Math.min(end, new Date(block.endDate).getTime())
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null
    const blockDuration = to - from
    const stages = block.stageSegments.map((stage) => {
      const stageStart = Math.max(from, new Date(stage.start).getTime())
      const stageEnd = Math.min(to, new Date(stage.end).getTime())
      if (!Number.isFinite(stageStart) || !Number.isFinite(stageEnd) || stageEnd <= stageStart) return null
      return { stage: stage.stage, left: ((stageStart - from) / blockDuration) * 100, width: Math.max(((stageEnd - stageStart) / blockDuration) * 100, 1) }
    }).filter((stage): stage is { stage: NormalizedSleepStage; left: number; width: number } => stage !== null)
    return { block, left: ((from - start) / (end - start)) * 100, width: Math.max((blockDuration / (end - start)) * 100, 1.2), stages }
  }).filter((item): item is { block: ClassifiedSleepBlock; left: number; width: number; stages: Array<{ stage: NormalizedSleepStage; left: number; width: number }> } => item !== null)
}

export function getStageTotals(block: ClassifiedSleepBlock) {
  const totals = new Map<string, number>()
  block.stageSegments.forEach((segment) => totals.set(segment.stage, (totals.get(segment.stage) ?? 0) + segment.durationMinutes))
  return [...totals.entries()].sort((a, b) => b[1] - a[1])
}

export function formatPrintStageSummary(block: ClassifiedSleepBlock) {
  const labels: Record<string, string> = { asleep_rem: 'レム', asleep_core: 'コア', asleep_deep: '深い睡眠', asleep_unspecified: '睡眠', asleep: '睡眠' }
  return getStageTotals(block).map(([stage, minutes]) => `${labels[stage] ?? stage} ${formatPrintMinutes(minutes)}`).join(' / ') || 'ステージ未取得'
}

export function formatPrintMinutes(minutes: number) {
  const rounded = Math.max(0, Math.round(minutes))
  return `${Math.floor(rounded / 60)}時間${rounded % 60}分`
}

export function selectPrintSummaries(summaries: SleepDaySummary[], month: string) {
  return summaries.filter((summary) => summary.sleepDayKey.startsWith(`${month}-`)).sort((a, b) => b.sleepDayKey.localeCompare(a.sleepDayKey))
}

export function getPrintConfig(config: AnalysisConfig) { return { boundaryHour: config.sleepDayBoundaryHour } }
