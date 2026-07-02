import { getDefaultUserId } from './batches.js'
import { getFirestoreDb, isFirestoreAuthError } from './firestore.js'
import {
  getConfiguredSleepDayBoundaryHour,
  getSleepDayKeyForDate,
  normalizeSleepDayBoundaryHour,
} from './sleepDayBoundary.js'
import type {
  DriveSyncRunDocument,
  IngestBatchDocument,
  ProcessedDriveFileDocument,
  SleepRecordDocument,
} from '../types/firestore.js'

export type SleepBlockView = {
  start: string
  end: string
  durationMinutes: number
  type: 'main' | 'nap' | 'supplemental' | 'evening' | 'unknown'
  sourceKeys: string[]
  sourceLabels: string[]
  stageSegments: Array<{
    stage: SleepRecordDocument['stage']
    start: string
    end: string
    durationMinutes: number
  }>
}

export type SummaryView = {
  date: string
  totalSleepMinutes: number
  sleepCount: number
  mainSleepStart: string | null
  mainSleepEnd: string | null
  fragmentationScore: number
  circadianScore: number
}

export type DayModel = {
  date: string
  blocks: SleepBlockView[]
}

type DriveSyncStatusView = {
  lastSyncAt: string | null
  lastStatus: 'normal' | 'needs_attention' | 'not_synced'
  processedDriveFileCount: number
  latestBatchId: string | null
  latestFileName: string | null
  latestFileModifiedTime: string | null
  lastCheckedFiles: number
  lastProcessedFiles: number
  lastSkippedAlreadyProcessed: number
  lastFailedFiles: number
  failedFiles: Array<{
    fileName: string
    errorSummary: string
    processedAt: string | null
  }>
  warningCount: number
}

export class ViewApiError extends Error {
  constructor(cause: unknown) {
    super(getViewApiErrorMessage(cause))
    this.name = 'ViewApiError'
    this.cause = cause
  }
}

const MAX_DAYS = 90
const DEFAULT_DAYS = 30
const MERGE_GAP_MINUTES = 30
const NAP_MAX_MINUTES = 90
const EVENING_START_HOUR = 16
const TOKYO_UTC_OFFSET_HOURS = 9

export function parseDays(value: string | null): number {
  const days = Number(value)

  if (!Number.isInteger(days) || days <= 0) {
    return DEFAULT_DAYS
  }

  return Math.min(days, MAX_DAYS)
}

export function parseMonthKey(value: string | null): string | null {
  if (!value) {
    return null
  }

  const match = /^(\d{4})-(\d{2})$/.exec(value)

  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
}

export async function getImportStatus(userId = getDefaultUserId()): Promise<{
  lastIngestedAt: string | null
  lastBatchId: string | null
  addedCount: number
  skippedDuplicateCount: number
  warningCount: number
  sleepRecordCount: number
}> {
  try {
    const db = getFirestoreDb()
    const batches = await db
      .collection('users')
      .doc(userId)
      .collection('ingest_batches')
      .orderBy('receivedAt', 'desc')
      .limit(1)
      .get()
    const latest = batches.docs[0]?.data() as Partial<IngestBatchDocument> | undefined
    const countSnapshot = await db
      .collection('users')
      .doc(userId)
      .collection('sleep_records')
      .count()
      .get()

    return {
      lastIngestedAt: latest?.receivedAt ?? null,
      lastBatchId: latest?.batchId ?? null,
      addedCount: latest?.addedCount ?? 0,
      skippedDuplicateCount: latest?.skippedDuplicateCount ?? 0,
      warningCount: latest?.warningCount ?? 0,
      sleepRecordCount: countSnapshot.data().count,
    }
  } catch (error) {
    throw new ViewApiError(error)
  }
}

export async function getDriveSyncStatus(
  userId = getDefaultUserId(),
): Promise<DriveSyncStatusView> {
  try {
    const db = getFirestoreDb()
    const userRef = db.collection('users').doc(userId)
    const [runs, processedCount, latestProcessed, failedFilesSnapshot] = await Promise.all([
      userRef.collection('drive_sync_runs').orderBy('completedAt', 'desc').limit(1).get(),
      userRef.collection('processed_drive_files').count().get(),
      userRef.collection('processed_drive_files').orderBy('processedAt', 'desc').limit(1).get(),
      userRef
        .collection('processed_drive_files')
        .where('status', '==', 'failed')
        .limit(5)
        .get(),
    ])
    const latestRun = runs.docs[0]?.data() as Partial<DriveSyncRunDocument> | undefined
    const latestFile = latestProcessed.docs[0]?.data() as
      | Partial<ProcessedDriveFileDocument>
      | undefined
    const failedFiles = failedFilesSnapshot.docs.map((doc) => {
      const file = doc.data() as Partial<ProcessedDriveFileDocument>
      return {
        fileName: file.fileName ?? '名前なし',
        errorSummary: file.errorSummary ?? '確認が必要です。',
        processedAt: file.processedAt ?? null,
      }
    })
    const failedFileCount = latestRun?.failedFiles ?? 0
    const warningCount = latestRun?.warningCount ?? 0

    return {
      lastSyncAt: latestRun?.completedAt ?? null,
      lastStatus: !latestRun
        ? 'not_synced'
        : failedFileCount > 0 || warningCount > 0
          ? 'needs_attention'
          : 'normal',
      processedDriveFileCount: processedCount.data().count,
      latestBatchId: latestFile?.batchId ?? null,
      latestFileName: latestFile?.fileName ?? null,
      latestFileModifiedTime: latestFile?.modifiedTime ?? null,
      lastCheckedFiles: latestRun?.checkedFiles ?? 0,
      lastProcessedFiles: latestRun?.processedFiles ?? 0,
      lastSkippedAlreadyProcessed: latestRun?.skippedAlreadyProcessed ?? 0,
      lastFailedFiles: failedFileCount,
      failedFiles,
      warningCount,
    }
  } catch (error) {
    throw new ViewApiError(error)
  }
}

export async function getSummaries(
  days: number,
  userId = getDefaultUserId(),
  boundaryHour = getConfiguredSleepDayBoundaryHour(),
): Promise<{
  boundaryHour: number
  days: SummaryView[]
}> {
  const effectiveBoundaryHour = normalizeSleepDayBoundaryHour(boundaryHour)
  const models = await getDayModels(days, userId, effectiveBoundaryHour)

  return {
    boundaryHour: effectiveBoundaryHour,
    days: models.map((model) => {
      const main = model.blocks.find((block) => block.type === 'main') ?? null
      return {
        date: model.date,
        totalSleepMinutes: sumMinutes(model.blocks),
        sleepCount: model.blocks.length,
        mainSleepStart: main?.start ?? null,
        mainSleepEnd: main?.end ?? null,
        fragmentationScore: calculateFragmentationScore(model.blocks),
        circadianScore: calculateCircadianScore(model.blocks),
      }
    }),
  }
}

export async function getUnifiedTimeline(
  days: number,
  userId = getDefaultUserId(),
  boundaryHour = getConfiguredSleepDayBoundaryHour(),
): Promise<{
  boundaryHour: number
  days: DayModel[]
}> {
  const effectiveBoundaryHour = normalizeSleepDayBoundaryHour(boundaryHour)

  return {
    boundaryHour: effectiveBoundaryHour,
    days: await getDayModels(days, userId, effectiveBoundaryHour),
  }
}

export async function getUnifiedTimelineForMonth(
  month: string,
  userId = getDefaultUserId(),
  boundaryHour = getConfiguredSleepDayBoundaryHour(),
): Promise<{
  boundaryHour: number
  days: DayModel[]
  month: string
}> {
  const monthKey = parseMonthKey(month) ?? getCurrentTokyoMonthKey()
  const effectiveBoundaryHour = normalizeSleepDayBoundaryHour(boundaryHour)
  const records = await getSleepRecordsForSleepDayMonth(monthKey, userId, effectiveBoundaryHour)
  const days = buildDayModels(records, effectiveBoundaryHour).filter((day) =>
    day.date.startsWith(`${monthKey}-`),
  )

  return {
    boundaryHour: effectiveBoundaryHour,
    days,
    month: monthKey,
  }
}

export async function getInsights(
  days: number,
  userId = getDefaultUserId(),
  boundaryHour = getConfiguredSleepDayBoundaryHour(),
): Promise<{
  items: Array<{ id: string; title: string; description: string; priority: 'low' | 'medium' | 'high' }>
}> {
  const models = await getDayModels(days, userId, normalizeSleepDayBoundaryHour(boundaryHour))
  const latest = models[0]

  if (!latest) {
    return { items: [] }
  }

  const items: Array<{
    id: string
    title: string
    description: string
    priority: 'low' | 'medium' | 'high'
  }> = [
    {
      id: 'morning-light',
      title: '起きたら30分以内に外の光を入れる',
      description: '朝の明るさを先に入れて、今日の起床リズムの合図にします。',
      priority: 'medium',
    },
  ]

  if (latest.blocks.length >= 2) {
    items.push({
      id: 'nap-window',
      title: '仮眠は早めの時間に短く区切る',
      description: '複数回眠っている日は、日中の睡眠を夕方前までに短めに区切るのが目安です。',
      priority: 'medium',
    })
  }

  if (latest.blocks.some((block) => block.type === 'evening')) {
    items.push({
      id: 'evening-rest',
      title: '16時以降の眠気は、まず横にならずに休む',
      description: '座って目を閉じる、軽く歩く、照明を調整するなどから選びます。',
      priority: 'high',
    })
  }

  return { items }
}

async function getDayModels(
  days: number,
  userId: string,
  boundaryHour: number,
): Promise<DayModel[]> {
  try {
    const records = await getRecentSleepRecords(days, userId)
    return buildDayModels(records, boundaryHour).slice(0, days)
  } catch (error) {
    throw new ViewApiError(error)
  }
}

async function getRecentSleepRecords(days: number, userId: string): Promise<SleepRecordDocument[]> {
  const from = new Date()
  from.setDate(from.getDate() - days - 2)
  from.setHours(0, 0, 0, 0)

  const snapshot = await getFirestoreDb()
    .collection('users')
    .doc(userId)
    .collection('sleep_records')
    .where('start', '>=', from.toISOString())
    .orderBy('start', 'desc')
    .limit(days * 120)
    .get()

  return snapshot.docs.map((doc) => doc.data() as SleepRecordDocument)
}

async function getSleepRecordsForSleepDayMonth(
  month: string,
  userId: string,
  boundaryHour: number,
): Promise<SleepRecordDocument[]> {
  const range = getSleepDayMonthQueryRange(month, boundaryHour)
  const snapshot = await getFirestoreDb()
    .collection('users')
    .doc(userId)
    .collection('sleep_records')
    .where('start', '>=', range.from)
    .where('start', '<', range.to)
    .orderBy('start', 'desc')
    .limit(range.maxRecords)
    .get()

  return snapshot.docs.map((doc) => doc.data() as SleepRecordDocument)
}

export function getSleepDayMonthQueryRange(
  month: string,
  boundaryHour = getConfiguredSleepDayBoundaryHour(),
): { from: string; maxRecords: number; to: string } {
  const monthKey = parseMonthKey(month) ?? getCurrentTokyoMonthKey()
  const [year, monthNumber] = monthKey.split('-').map(Number)
  const effectiveBoundaryHour = normalizeSleepDayBoundaryHour(boundaryHour)
  const nextMonth = monthNumber === 12 ? { month: 1, year: year + 1 } : { month: monthNumber + 1, year }
  const from = toTokyoBoundaryIso(year, monthNumber, 1, effectiveBoundaryHour)
  const to = toTokyoBoundaryIso(nextMonth.year, nextMonth.month, 1, effectiveBoundaryHour)
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()

  return {
    from,
    to,
    maxRecords: Math.max(1, daysInMonth + 2) * 120,
  }
}

function getCurrentTokyoMonthKey(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
  }).formatToParts(new Date())
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970'
  const month = parts.find((part) => part.type === 'month')?.value ?? '01'

  return `${year}-${month}`
}

function toTokyoBoundaryIso(year: number, month: number, day: number, boundaryHour: number): string {
  return new Date(
    Date.UTC(year, month - 1, day, normalizeSleepDayBoundaryHour(boundaryHour) - TOKYO_UTC_OFFSET_HOURS),
  ).toISOString()
}

export function buildDayModels(
  records: SleepRecordDocument[],
  boundaryHour = getConfiguredSleepDayBoundaryHour(),
): DayModel[] {
  const effectiveBoundaryHour = normalizeSleepDayBoundaryHour(boundaryHour)
  const asleepRecords = records
    .filter((record) => isSleepStage(record.stage))
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime())
  const blocks = mergeSleepRecords(asleepRecords)
  const grouped = new Map<string, SleepBlockView[]>()

  for (const block of blocks) {
    const key = getSleepDayKeyForDate(block.start, effectiveBoundaryHour)
    const list = grouped.get(key) ?? []
    list.push(block)
    grouped.set(key, list)
  }

  return Array.from(grouped.entries())
    .map(([date, dayBlocks]) => ({
      date,
      blocks: classifyBlocks(dayBlocks).sort(
        (left, right) => new Date(left.start).getTime() - new Date(right.start).getTime(),
      ),
    }))
    .sort((left, right) => right.date.localeCompare(left.date))
}

function mergeSleepRecords(records: SleepRecordDocument[]): SleepBlockView[] {
  const blocks: SleepBlockView[] = []

  for (const record of records) {
    const previous = blocks.at(-1)
    const start = new Date(record.start).getTime()
    const end = new Date(record.end).getTime()

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      continue
    }

    if (previous) {
      const previousEnd = new Date(previous.end).getTime()
      const gapMinutes = (start - previousEnd) / 60_000

      if (gapMinutes >= 0 && gapMinutes <= MERGE_GAP_MINUTES) {
        previous.end = record.end > previous.end ? record.end : previous.end
        previous.durationMinutes = Math.round(
          (new Date(previous.end).getTime() - new Date(previous.start).getTime()) / 60_000,
        )
        previous.stageSegments.push(toStageSegment(record))
        addUnique(previous.sourceKeys, getSourceKey(record))
        addUnique(previous.sourceLabels, getSourceLabel(record))
        continue
      }
    }

    blocks.push({
      start: record.start,
      end: record.end,
      durationMinutes: record.durationMinutes,
      type: 'unknown',
      sourceKeys: [getSourceKey(record)],
      sourceLabels: [getSourceLabel(record)],
      stageSegments: [toStageSegment(record)],
    })
  }

  return blocks
}

function toStageSegment(record: SleepRecordDocument): SleepBlockView['stageSegments'][number] {
  return {
    stage: record.stage,
    start: record.start,
    end: record.end,
    durationMinutes: record.durationMinutes,
  }
}

function classifyBlocks(blocks: SleepBlockView[]): SleepBlockView[] {
  const longest = [...blocks].sort((left, right) => right.durationMinutes - left.durationMinutes)[0]

  return blocks.map((block) => {
    const start = new Date(block.start)
    let type: SleepBlockView['type'] = 'supplemental'

    if (longest && block.start === longest.start && block.end === longest.end) {
      type = 'main'
    } else if (start.getHours() >= EVENING_START_HOUR) {
      type = 'evening'
    } else if (block.durationMinutes < NAP_MAX_MINUTES) {
      type = 'nap'
    }

    return { ...block, type }
  })
}

function isSleepStage(stage: SleepRecordDocument['stage']): boolean {
  return stage === 'asleep' || stage.startsWith('asleep_')
}

function getSourceKey(record: SleepRecordDocument): string {
  if (isUnknownHealthAutoExportSource(record)) {
    return process.env.HEALTH_EXPORT_DEFAULT_SOURCE_KEY?.trim() || record.sourceKey
  }

  return record.sourceKey
}

function getSourceLabel(record: SleepRecordDocument): string {
  if (isUnknownHealthAutoExportSource(record)) {
    return process.env.HEALTH_EXPORT_DEFAULT_SOURCE_LABEL?.trim() || 'Health Auto Export'
  }

  if (record.sourceName) {
    return resolveKnownSourceLabel(record.sourceName) ?? record.sourceName
  }

  return resolveKnownSourceLabel(record.sourceKey) ?? record.sourceKey
}

function isUnknownHealthAutoExportSource(record: SleepRecordDocument): boolean {
  return record.sourceKey.startsWith('unknown_source') && record.sourceFormat === 'health_auto_export_json'
}

function resolveKnownSourceLabel(value: string): string | null {
  const text = value.toLowerCase()

  if (text.includes('withings')) return 'Withings'
  if (text.includes('apple_watch') || text.includes('apple watch') || /\bwatch\b/.test(text)) {
    return 'Apple Watch'
  }
  if (text.includes('iphone') || text.includes('i phone')) return 'iPhone'
  if (text.includes('manual') || text.includes('手入力')) return '手入力'
  if (text.includes('apple_health') || text.includes('apple health') || text.includes('com.apple.health')) {
    return 'Apple Health'
  }

  return null
}

function addUnique(items: string[], value: string): void {
  if (!items.includes(value)) {
    items.push(value)
  }
}

function sumMinutes(blocks: SleepBlockView[]): number {
  return blocks.reduce((sum, block) => sum + block.durationMinutes, 0)
}

function calculateFragmentationScore(blocks: SleepBlockView[]): number {
  if (blocks.length <= 1) {
    return 0
  }

  return Math.min(100, Math.round((blocks.length - 1) * 25 + blocks.filter((block) => block.type === 'nap').length * 10))
}

function calculateCircadianScore(blocks: SleepBlockView[]): number {
  const total = sumMinutes(blocks)

  if (total <= 0) {
    return 0
  }

  const daytimeMinutes = blocks
    .filter((block) => {
      const hour = new Date(block.start).getHours()
      return hour >= 9 && hour < 18
    })
    .reduce((sum, block) => sum + block.durationMinutes, 0)

  return Math.min(100, Math.round((daytimeMinutes / total) * 100))
}

function getViewApiErrorMessage(error: unknown): string {
  if (isFirestoreAuthError(error)) {
    return 'Firestore認証に失敗しました。ローカル開発では gcloud auth application-default login を実行してください。Cloud Run本番ではサービスアカウントのFirestore権限を確認してください。'
  }

  return 'Firestoreから閲覧用データを取得できませんでした。プロジェクトID、Database ID、権限を確認してください。'
}
