type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export function parseHealthDateInTimeZone(
  value: string | undefined,
  timeZone: string,
): Date | null {
  if (!value?.trim()) return null
  const raw = value.trim()
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnly) {
    return new Date(
      zonedDateTimeToUtcMs(
        {
          year: Number(dateOnly[1]),
          month: Number(dateOnly[2]),
          day: Number(dateOnly[3]),
          hour: 0,
          minute: 0,
          second: 0,
        },
        timeZone,
      ),
    )
  }

  const normalized = normalizeOffsetDate(raw)
  if (hasExplicitOffset(normalized)) {
    const parsed = new Date(normalized)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const localDateTime = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/,
  )
  if (!localDateTime) {
    const parsed = new Date(normalized)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  return new Date(
    zonedDateTimeToUtcMs(
      {
        year: Number(localDateTime[1]),
        month: Number(localDateTime[2]),
        day: Number(localDateTime[3]),
        hour: Number(localDateTime[4]),
        minute: Number(localDateTime[5]),
        second: Number(localDateTime[6]),
      },
      timeZone,
    ),
  )
}

export function formatDateInTimeZone(date: Date, timeZone: string): string {
  const parts = getZonedParts(date.getTime(), timeZone)
  return `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}`
}

export function getLocalDateWindow(dateKey: string, timeZone: string): {
  start: string
  end: string
} {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) throw new Error(`Invalid local date: ${dateKey}`)
  const base = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  const next = new Date(base)
  next.setUTCDate(next.getUTCDate() + 1)

  return {
    start: formatZonedDateTime(
      zonedDateTimeToUtcMs(
        {
          year: base.getUTCFullYear(),
          month: base.getUTCMonth() + 1,
          day: base.getUTCDate(),
          hour: 0,
          minute: 0,
          second: 0,
        },
        timeZone,
      ),
      timeZone,
    ),
    end: formatZonedDateTime(
      zonedDateTimeToUtcMs(
        {
          year: next.getUTCFullYear(),
          month: next.getUTCMonth() + 1,
          day: next.getUTCDate(),
          hour: 0,
          minute: 0,
          second: 0,
        },
        timeZone,
      ),
      timeZone,
    ),
  }
}

function normalizeOffsetDate(value: string): string {
  const appleMatch = value.match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?\s*([+-]\d{2})(\d{2})$/,
  )
  if (appleMatch) {
    return `${appleMatch[1]}T${appleMatch[2]}${appleMatch[3]}:${appleMatch[4]}`
  }

  const compactOffset = value.match(/^(.+)([+-]\d{2})(\d{2})$/)
  if (compactOffset && value.includes('T')) {
    return `${compactOffset[1]}${compactOffset[2]}:${compactOffset[3]}`
  }

  return /^\d{4}-\d{2}-\d{2} /.test(value) ? value.replace(' ', 'T') : value
}

function hasExplicitOffset(value: string): boolean {
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
}

function zonedDateTimeToUtcMs(parts: ZonedParts, timeZone: string): number {
  const wallClockUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  let instant = wallClockUtc

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(instant, timeZone)
    const adjusted = wallClockUtc - offsetMinutes * 60_000
    if (adjusted === instant) return adjusted
    instant = adjusted
  }

  return instant
}

function getTimeZoneOffsetMinutes(instantMs: number, timeZone: string): number {
  const parts = getZonedParts(instantMs, timeZone)
  const representedUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  return Math.round((representedUtc - instantMs) / 60_000)
}

function getZonedParts(instantMs: number, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(new Date(instantMs))
  const value = (type: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second'): number =>
    Number(parts.find((part) => part.type === type)?.value)

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour') % 24,
    minute: value('minute'),
    second: value('second'),
  }
}

function formatZonedDateTime(instantMs: number, timeZone: string): string {
  const parts = getZonedParts(instantMs, timeZone)
  const offsetMinutes = getTimeZoneOffsetMinutes(instantMs, timeZone)
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absolute = Math.abs(offsetMinutes)
  const offsetHours = Math.floor(absolute / 60)
  const offsetRemainder = absolute % 60

  return `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}T${pad(parts.hour, 2)}:${pad(parts.minute, 2)}:${pad(parts.second, 2)}${sign}${pad(offsetHours, 2)}:${pad(offsetRemainder, 2)}`
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0')
}
