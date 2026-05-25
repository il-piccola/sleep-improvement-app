import type { AnalysisConfig, SleepDaySummary } from '../../types/sleep'
import { normalizeAnalysisConfig } from '../../types/sleep'

export function getCurrentSleepDayKey(
  now = new Date(),
  config: Partial<AnalysisConfig> = {},
): string {
  const normalizedConfig = normalizeAnalysisConfig(config)
  const boundaryStart = new Date(now)

  if (now.getHours() < normalizedConfig.sleepDayBoundaryHour) {
    boundaryStart.setDate(boundaryStart.getDate() - 1)
  }

  boundaryStart.setHours(normalizedConfig.sleepDayBoundaryHour, 0, 0, 0)

  return formatDateKey(boundaryStart)
}

export function selectTodaySleepSummary(
  summaries: SleepDaySummary[],
  config: Partial<AnalysisConfig> = {},
  now = new Date(),
): {
  targetSleepDayKey: string
  todaySummary: SleepDaySummary | null
  latestSummary: SleepDaySummary | null
  displaySummary: SleepDaySummary | null
  isFallback: boolean
} {
  const targetSleepDayKey = getCurrentSleepDayKey(now, config)
  const todaySummary = summaries.find((summary) => summary.sleepDayKey === targetSleepDayKey) ?? null
  const latestSummary = summaries.at(-1) ?? null
  const displaySummary = todaySummary ?? latestSummary

  return {
    targetSleepDayKey,
    todaySummary,
    latestSummary,
    displaySummary,
    isFallback: !todaySummary && Boolean(latestSummary),
  }
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
