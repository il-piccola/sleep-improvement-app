const HOURS_PER_DAY = 24
const DEFAULT_SLEEP_DAY_BOUNDARY_HOUR = 18
const DEFAULT_TIME_ZONE = 'Asia/Tokyo'

export function getConfiguredSleepDayBoundaryHour(): number {
  return normalizeSleepDayBoundaryHour(
    process.env.SLEEP_DAY_BOUNDARY_HOUR ?? process.env.SLEEP_DAY_BOUNDARY_HOUR_DEFAULT,
    DEFAULT_SLEEP_DAY_BOUNDARY_HOUR,
  )
}

export function normalizeSleepDayBoundaryHour(
  boundaryHour: number | string | null | undefined,
  fallback = DEFAULT_SLEEP_DAY_BOUNDARY_HOUR,
): number {
  const parsed = typeof boundaryHour === 'string' ? Number(boundaryHour) : boundaryHour

  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.min(HOURS_PER_DAY - 1, Math.max(0, Math.trunc(parsed as number)))
}

export function parseSleepDayBoundaryHour(
  value: string | null | undefined,
  fallback = getConfiguredSleepDayBoundaryHour(),
): number {
  return normalizeSleepDayBoundaryHour(value, fallback)
}

export function getSleepDayKeyForDate(
  value: Date | number | string,
  boundaryHour = getConfiguredSleepDayBoundaryHour(),
  timeZone = DEFAULT_TIME_ZONE,
): string {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return formatDateKey(new Date())
  }

  const parts = getZonedDateTimeParts(date, timeZone)
  const localUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  const shifted = new Date(
    localUtcMs - normalizeSleepDayBoundaryHour(boundaryHour) * 60 * 60 * 1000,
  )

  return formatDateKey(shifted)
}

export function isSleepWindowRecordBoundaryCompatible(
  recordBoundaryHour: number | undefined,
  boundaryHour: number,
): boolean {
  return (recordBoundaryHour ?? DEFAULT_SLEEP_DAY_BOUNDARY_HOUR) === normalizeSleepDayBoundaryHour(boundaryHour)
}

function getZonedDateTimeParts(date: Date, timeZone: string): {
  day: number
  hour: number
  minute: number
  month: number
  second: number
  year: number
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date)

  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0)

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  }
}

function formatDateKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}
