import { getDefaultUserId } from './batches.js'
import { getFirestoreDb } from './firestore.js'
import { getSummaries, getUnifiedTimeline, type DayModel, type SummaryView } from './viewModels.js'
import type { HealthMetricRecordDocument } from '../types/firestore.js'

export type DailyActivityMetrics = {
  date: string
  step_count?: number
  walking_running_distance?: number
  active_energy?: number
  units: Partial<Record<'step_count' | 'walking_running_distance' | 'active_energy', string>>
}

export type SleepWindowMetricAggregate = {
  avgOfValueAvg?: number
  minOfValueMin?: number
  maxOfValueMax?: number
  totalValueCount: number
}

export type SleepWindowMetricSummary = {
  metricName: 'heart_rate' | 'respiratory_rate' | 'heart_rate_variability'
  unit: string
  recordCount: number
  blockCount: number
  totalValueCount: number
  hasMainSleepData: boolean
  hasNapData: boolean
  mainSleepOnlySummary?: SleepWindowMetricAggregate
  allSleepBlocksSummary: SleepWindowMetricAggregate
}

export type SleepHealthDailyContext = {
  sleepDay: string
  sleep: {
    totalSleepMinutes: number
    mainSleepMinutes?: number
    napMinutes?: number
    eveningSleepMinutes?: number
    sleepBlockCount: number
    mainSleepStart?: string
    mainSleepEnd?: string
    splitSleepScore?: number
    circadianReversalScore?: number
  }
  activityMetrics: {
    activityPreviousDate?: DailyActivityMetrics
    activityOnSleepDayDate?: DailyActivityMetrics
    activityOnNextDate?: DailyActivityMetrics
  }
  sleepWindowMetrics: Partial<
    Record<'heart_rate' | 'respiratory_rate' | 'heart_rate_variability', SleepWindowMetricSummary>
  >
  dataAvailability: {
    hasDailyActivityMetrics: boolean
    hasSleepWindowMetrics: boolean
    missingMetrics: string[]
  }
  candidateFlags: string[]
}

type BuildContextInput = {
  healthMetricRecords: HealthMetricRecordDocument[]
  summaries: SummaryView[]
  timelineDays: DayModel[]
}

const DAILY_ACTIVITY_METRICS = ['step_count', 'walking_running_distance', 'active_energy'] as const
const SLEEP_WINDOW_METRICS = ['heart_rate', 'respiratory_rate', 'heart_rate_variability'] as const
const HEALTH_METRIC_READ_LIMIT = 5000

export async function getSleepHealthContext(
  days: number,
  userId = getDefaultUserId(),
): Promise<{ days: SleepHealthDailyContext[] }> {
  const [summariesResult, timelineResult, healthMetricRecords] = await Promise.all([
    getSummaries(days, userId),
    getUnifiedTimeline(days, userId),
    getRecentHealthMetricRecords(userId),
  ])

  return {
    days: buildSleepHealthDailyContexts({
      healthMetricRecords,
      summaries: summariesResult.days,
      timelineDays: timelineResult.days,
    }).slice(0, days),
  }
}

export function buildSleepHealthDailyContexts({
  healthMetricRecords,
  summaries,
  timelineDays,
}: BuildContextInput): SleepHealthDailyContext[] {
  const dailyActivityByDate = buildDailyActivityMap(healthMetricRecords)
  const sleepWindowBySleepDay = buildSleepWindowMetricMap(healthMetricRecords)
  const timelineByDate = new Map(timelineDays.map((day) => [day.date, day]))

  return summaries.map((summary) => {
    const timeline = timelineByDate.get(summary.date)
    const previousDate = addDays(summary.date, -1)
    const nextDate = addDays(summary.date, 1)
    const activityPreviousDate = dailyActivityByDate.get(previousDate)
    const activityOnSleepDayDate = dailyActivityByDate.get(summary.date)
    const activityOnNextDate = dailyActivityByDate.get(nextDate)
    const sleepWindowMetrics = sleepWindowBySleepDay.get(summary.date) ?? {}
    const missingMetrics = getMissingMetrics(activityOnSleepDayDate, sleepWindowMetrics)
    const hasDailyActivityMetrics = Boolean(
      activityPreviousDate || activityOnSleepDayDate || activityOnNextDate,
    )
    const hasSleepWindowMetrics = Object.keys(sleepWindowMetrics).length > 0

    return {
      sleepDay: summary.date,
      sleep: {
        totalSleepMinutes: summary.totalSleepMinutes,
        mainSleepMinutes: sumBlockMinutes(timeline, 'main'),
        napMinutes: sumBlockMinutes(timeline, 'nap'),
        eveningSleepMinutes: sumBlockMinutes(timeline, 'evening'),
        sleepBlockCount: summary.sleepCount,
        ...(summary.mainSleepStart ? { mainSleepStart: summary.mainSleepStart } : {}),
        ...(summary.mainSleepEnd ? { mainSleepEnd: summary.mainSleepEnd } : {}),
        splitSleepScore: summary.fragmentationScore,
        circadianReversalScore: summary.circadianScore,
      },
      activityMetrics: {
        ...(activityPreviousDate ? { activityPreviousDate } : {}),
        ...(activityOnSleepDayDate ? { activityOnSleepDayDate } : {}),
        ...(activityOnNextDate ? { activityOnNextDate } : {}),
      },
      sleepWindowMetrics,
      dataAvailability: {
        hasDailyActivityMetrics,
        hasSleepWindowMetrics,
        missingMetrics,
      },
      candidateFlags: buildCandidateFlags({
        hasDailyActivityMetrics,
        hasSleepWindowMetrics,
        summary,
      }),
    }
  })
}

async function getRecentHealthMetricRecords(userId: string): Promise<HealthMetricRecordDocument[]> {
  const snapshot = await getFirestoreDb()
    .collection('users')
    .doc(userId)
    .collection('health_metric_records')
    .limit(HEALTH_METRIC_READ_LIMIT)
    .get()

  return snapshot.docs.map((doc) => doc.data() as HealthMetricRecordDocument)
}

function buildDailyActivityMap(
  records: HealthMetricRecordDocument[],
): Map<string, DailyActivityMetrics> {
  const map = new Map<string, DailyActivityMetrics>()

  for (const record of records) {
    if (record.aggregation !== 'daily_total' || !record.date || record.value === undefined) {
      continue
    }

    if (!isDailyActivityMetric(record.metricName)) {
      continue
    }

    const existing =
      map.get(record.date) ??
      ({
        date: record.date,
        units: {},
      } satisfies DailyActivityMetrics)

    existing[record.metricName] = round(record.value)
    existing.units[record.metricName] = record.unit
    map.set(record.date, existing)
  }

  return map
}

function buildSleepWindowMetricMap(
  records: HealthMetricRecordDocument[],
): Map<string, SleepHealthDailyContext['sleepWindowMetrics']> {
  const buckets = new Map<
    string,
    Map<(typeof SLEEP_WINDOW_METRICS)[number], HealthMetricRecordDocument[]>
  >()

  for (const record of records) {
    if (record.aggregation !== 'sleep_window_summary' || !record.sleepDay) {
      continue
    }

    if (!isSleepWindowMetric(record.metricName)) {
      continue
    }

    const byMetric = buckets.get(record.sleepDay) ?? new Map()
    const list = byMetric.get(record.metricName) ?? []
    list.push(record)
    byMetric.set(record.metricName, list)
    buckets.set(record.sleepDay, byMetric)
  }

  const result = new Map<string, SleepHealthDailyContext['sleepWindowMetrics']>()

  for (const [sleepDay, byMetric] of buckets.entries()) {
    const summaries: SleepHealthDailyContext['sleepWindowMetrics'] = {}

    for (const [metricName, list] of byMetric.entries()) {
      summaries[metricName] = summarizeSleepWindowMetric(metricName, list)
    }

    result.set(sleepDay, summaries)
  }

  return result
}

function summarizeSleepWindowMetric(
  metricName: (typeof SLEEP_WINDOW_METRICS)[number],
  records: HealthMetricRecordDocument[],
): SleepWindowMetricSummary {
  const allSleepBlocksSummary = summarizeMetricValues(records)
  const mainRecords = records.filter((record) => record.isMainSleep)
  const mainSleepOnlySummary = mainRecords.length > 0 ? summarizeMetricValues(mainRecords) : undefined
  const blockIds = new Set(records.map((record) => record.sleepBlockId).filter(Boolean))

  return {
    metricName,
    unit: records[0]?.unit ?? '',
    recordCount: records.length,
    blockCount: blockIds.size,
    totalValueCount: allSleepBlocksSummary.totalValueCount,
    hasMainSleepData: mainRecords.length > 0,
    hasNapData: records.some((record) => record.sleepBlockType === 'nap'),
    ...(mainSleepOnlySummary ? { mainSleepOnlySummary } : {}),
    allSleepBlocksSummary,
  }
}

function summarizeMetricValues(records: HealthMetricRecordDocument[]): SleepWindowMetricAggregate {
  const avgRecords = records.filter(
    (record) => record.valueAvg !== undefined && record.valueCount !== undefined,
  )
  const totalValueCount = avgRecords.reduce((sum, record) => sum + (record.valueCount ?? 0), 0)
  const weightedAvg =
    totalValueCount > 0
      ? avgRecords.reduce((sum, record) => sum + (record.valueAvg ?? 0) * (record.valueCount ?? 0), 0) /
        totalValueCount
      : undefined
  const minValues = records
    .map((record) => record.valueMin)
    .filter((value): value is number => value !== undefined)
  const maxValues = records
    .map((record) => record.valueMax)
    .filter((value): value is number => value !== undefined)

  return {
    ...(weightedAvg !== undefined ? { avgOfValueAvg: round(weightedAvg) } : {}),
    ...(minValues.length > 0 ? { minOfValueMin: round(Math.min(...minValues)) } : {}),
    ...(maxValues.length > 0 ? { maxOfValueMax: round(Math.max(...maxValues)) } : {}),
    totalValueCount,
  }
}

function getMissingMetrics(
  activityOnSleepDayDate: DailyActivityMetrics | undefined,
  sleepWindowMetrics: SleepHealthDailyContext['sleepWindowMetrics'],
): string[] {
  const missing: string[] = []

  for (const metricName of DAILY_ACTIVITY_METRICS) {
    if (activityOnSleepDayDate?.[metricName] === undefined) {
      missing.push(metricName)
    }
  }

  for (const metricName of SLEEP_WINDOW_METRICS) {
    if (!sleepWindowMetrics[metricName]) {
      missing.push(metricName)
    }
  }

  return missing
}

function buildCandidateFlags({
  hasDailyActivityMetrics,
  hasSleepWindowMetrics,
  summary,
}: {
  hasDailyActivityMetrics: boolean
  hasSleepWindowMetrics: boolean
  summary: SummaryView
}): string[] {
  const flags: string[] = []

  if (!hasDailyActivityMetrics || !hasSleepWindowMetrics) {
    flags.push('insufficient_data')
  }

  if (summary.sleepCount >= 2) {
    flags.push('fragmented_sleep_candidate')
  }

  if (summary.mainSleepStart && getTokyoHour(summary.mainSleepStart) >= 3) {
    flags.push('late_main_sleep_candidate')
  }

  return flags
}

function sumBlockMinutes(timeline: DayModel | undefined, type: 'main' | 'nap' | 'evening'): number {
  return (
    timeline?.blocks
      .filter((block) => block.type === type)
      .reduce((sum, block) => sum + block.durationMinutes, 0) ?? 0
  )
}

function addDays(date: string, amount: number): string {
  const parsed = new Date(`${date}T00:00:00+09:00`)
  parsed.setUTCDate(parsed.getUTCDate() + amount)

  return formatTokyoDate(parsed)
}

function getTokyoHour(value: string): number {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Asia/Tokyo',
    }).format(new Date(value)),
  )
}

function formatTokyoDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  return `${year}-${month}-${day}`
}

function isDailyActivityMetric(
  metricName: HealthMetricRecordDocument['metricName'],
): metricName is (typeof DAILY_ACTIVITY_METRICS)[number] {
  return DAILY_ACTIVITY_METRICS.includes(metricName as (typeof DAILY_ACTIVITY_METRICS)[number])
}

function isSleepWindowMetric(
  metricName: HealthMetricRecordDocument['metricName'],
): metricName is (typeof SLEEP_WINDOW_METRICS)[number] {
  return SLEEP_WINDOW_METRICS.includes(metricName as (typeof SLEEP_WINDOW_METRICS)[number])
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
