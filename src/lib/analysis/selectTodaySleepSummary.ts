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
} {
  const targetSleepDayKey = getCurrentSleepDayKey(now, config)

  return {
    targetSleepDayKey,
    todaySummary: summaries.find((summary) => summary.sleepDayKey === targetSleepDayKey) ?? null,
    latestSummary: summaries.at(-1) ?? null,
  }
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
