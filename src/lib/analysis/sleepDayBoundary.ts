import { defaultAnalysisConfig } from '../../types/sleep'

const HOURS_PER_DAY = 24

export function normalizeSleepDayBoundaryHour(boundaryHour = defaultAnalysisConfig.sleepDayBoundaryHour): number {
  if (!Number.isFinite(boundaryHour)) {
    return defaultAnalysisConfig.sleepDayBoundaryHour
  }

  return Math.min(23, Math.max(0, Math.trunc(boundaryHour)))
}

export function formatSleepDayBoundaryLabel(boundaryHour = defaultAnalysisConfig.sleepDayBoundaryHour): string {
  return `${normalizeSleepDayBoundaryHour(boundaryHour)}:00`
}

export function formatSleepDayBoundaryWindowLabel(boundaryHour = defaultAnalysisConfig.sleepDayBoundaryHour): string {
  const label = formatSleepDayBoundaryLabel(boundaryHour)

  return `${label} - 翌${label}`
}

export function buildSleepDayBoundaryNotice(boundaryHour = defaultAnalysisConfig.sleepDayBoundaryHour): string {
  const label = formatSleepDayBoundaryLabel(boundaryHour)

  return `睡眠日は${label}で区切っています。${label}より前の睡眠は前日の睡眠日として表示されます。`
}

export function getSleepDayBoundaryScaleLabels(boundaryHour = defaultAnalysisConfig.sleepDayBoundaryHour): string[] {
  const startHour = normalizeSleepDayBoundaryHour(boundaryHour)

  return [0, 6, 12, 18, 24].map((offset) =>
    formatSleepDayBoundaryLabel((startHour + offset) % HOURS_PER_DAY),
  )
}

export function getSleepDayBoundaryStart(
  sleepDayKey: string,
  boundaryHour = defaultAnalysisConfig.sleepDayBoundaryHour,
): Date {
  const [year, month, day] = sleepDayKey.split('-').map(Number)

  if (!year || !month || !day) {
    return new Date()
  }

  return new Date(year, month - 1, day, normalizeSleepDayBoundaryHour(boundaryHour), 0, 0, 0)
}

export function getSleepDayKeyForDate(
  date: Date,
  boundaryHour = defaultAnalysisConfig.sleepDayBoundaryHour,
): string {
  const shiftedDate = new Date(date)

  shiftedDate.setHours(shiftedDate.getHours() - normalizeSleepDayBoundaryHour(boundaryHour))

  return formatLocalDateKey(shiftedDate)
}

export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}
