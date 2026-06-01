import type { AnalysisConfig, SleepDaySummary } from '../../types/sleep'
import { normalizeAnalysisConfig } from '../../types/sleep'
import { getSleepDayBoundaryStart, getSleepDayKeyForDate } from './sleepDayBoundary'

export function getCurrentSleepDayKey(
  now = new Date(),
  config: Partial<AnalysisConfig> = {},
): string {
  const normalizedConfig = normalizeAnalysisConfig(config)
  return getSleepDayKeyForDate(now, normalizedConfig.sleepDayBoundaryHour)
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

export function getCurrentSleepDayBoundaryStart(
  now = new Date(),
  config: Partial<AnalysisConfig> = {},
): Date {
  const normalizedConfig = normalizeAnalysisConfig(config)
  const sleepDayKey = getCurrentSleepDayKey(now, normalizedConfig)

  return getSleepDayBoundaryStart(sleepDayKey, normalizedConfig.sleepDayBoundaryHour)
}
