import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import './App.css'
import sampleSleepData from './sample/anonymized-sleep-records.json'
import {
  HealthAutoExportImportPanel,
} from './components/HealthAutoExportImportPanel'
import type { HealthAutoExportImportResult } from './lib/importers/importTypes'
import { buildSleepBlocks } from './lib/analysis/buildSleepBlocks'
import { groupBySleepDay } from './lib/analysis/groupBySleepDay'
import { summarizeSleepDay } from './lib/analysis/summarizeSleepDay'
import { generateImprovementActions } from './lib/analysis/generateImprovementActions'
import { checkDataQuality } from './lib/analysis/checkDataQuality'
import { evaluateSourceQuality } from './lib/analysis/evaluateSourceQuality'
import { buildUnifiedSleepTimeline } from './lib/analysis/buildUnifiedSleepTimeline'
import { selectTodaySleepSummary } from './lib/analysis/selectTodaySleepSummary'
import { normalizeSleepFile } from './lib/import/normalizeSleepFile'
import { getAppIdToken, signInToApp, signOutFromApp, subscribeToAppAuthState } from './lib/appAuth'
import { getFirebaseAuth } from './lib/firebaseClient'
import { resolveSleepSource } from './lib/source/resolveSleepSource'
import {
  buildSleepHealthChangeInsights,
  type SleepHealthChangeInsight,
  type SleepHealthDailyContextView,
} from './lib/insights/sleepHealthChangeInsights'
import {
  buildSleepDayDisplayStatus,
} from './lib/status/sleepDayVisibility'
import {
  buildSleepDayBoundaryNotice,
  formatSleepDayBoundaryWindowLabel,
  getSleepDayBoundaryScaleLabels,
  getSleepDayBoundaryStart,
} from './lib/analysis/sleepDayBoundary'
import {
  buildDataAvailabilityReasons,
  buildSleepDayDataDiagnostics,
  toDataStatusLabel,
  type SleepDayDataDiagnosticRow,
  type SleepDayDataStatus,
} from './lib/status/sleepDayDataDiagnostics'
import { healthAutoExportGuide } from './lib/status/healthAutoExportGuide'
import sleepActionEvening from './assets/decorations/generated/sleep-action-evening-transparent.png'
import sleepActionMorning from './assets/decorations/generated/sleep-action-morning-transparent.png'
import sleepCompassLogo from './assets/branding/sleep-compass-logo-mark.png'
import sleepEmptyWaiting from './assets/decorations/generated/sleep-empty-waiting-transparent.png'
import sleepHeroJournal from './assets/decorations/generated/sleep-hero-journal-transparent.png'
import sleepPastelDreamscapeBg from './assets/decorations/generated/sleep-pastel-dreamscape-bg.png'
import sleepSplitClouds from './assets/decorations/generated/sleep-split-clouds-transparent.png'
import sleepTimelineClock from './assets/decorations/generated/sleep-timeline-clock-transparent.png'
import {
  loadStoredSourcePreferences,
  removeSourcePreference,
  resetStoredSourcePreferences,
  saveStoredSourcePreferences,
  toSourceUseSetting,
  upsertSourcePreference,
} from './lib/source/sourcePreferences'
import {
  type DataQualityReport,
  defaultAnalysisConfig,
  type AnalysisConfig,
  type ClassifiedSleepBlock,
  type ImprovementAction,
  type ImprovementPace,
  type SourceQualityReport,
  type SourceRecommendedUse,
  type SleepOverlapReport,
  type SleepDaySummary,
  type SleepBlock,
  type SleepRecord,
  type SleepSourcePreferenceMap,
  type SourceUseSetting,
  type UnifiedSleepTimeline,
} from './types/sleep'

type AppScreen =
  | 'diagnosis'
  | 'dashboard'
  | 'timeline'
  | 'fragmentation'
  | 'actions'
  | 'settings'
  | 'sources'
  | 'import'

type TimelineViewMode = 'unified' | 'raw'

type SleepDataFile = {
  generatedAt?: string
  sourceKind?: string
  inputFileName?: string
  note?: string
  records: SleepRecord[]
  warnings: string[]
}

type LocalImportStatus = {
  connected: boolean
  isWatching?: boolean
  watchDir?: string
  scanIntervalMs?: number
  usePolling?: boolean
  pollIntervalMs?: number
  awaitWriteStabilityMs?: number
  lastScanAt?: string | null
  lastImportedAt?: string | null
  lastProcessedFileName?: string | null
  lastError?: string | null
  latestImport?: {
    importedFileName: string
    importedAt: string
    readFileCount: number
    normalizedCount: number
    newRecordCount: number
    duplicateSkippedCount: number
    rejectedRows: number
    warningCount: number
  } | null
}

type DayMetrics = {
  mainSleep: ClassifiedSleepBlock | null
  napBlocks: ClassifiedSleepBlock[]
  supportBlocks: ClassifiedSleepBlock[]
  eveningBlocks: ClassifiedSleepBlock[]
  finalWakeTime: string
  sleepMidpoint: string
}

type FirebaseUserInfo = {
  displayName: string | null
  email: string | null
  uid: string
}

type SleepSourceDetail = {
  sourceKey: string
  displayName: string
  effectiveUse: SourceUseSetting
  priority: number
  statusLabel: string
  description: string
  quality: SourceQualityReport
  sourceApp?: string
  sourceName?: string
  sourceBundleId?: string
  deviceName?: string
  recordCount: number
  dateRangeLabel: string
  stageLabels: string[]
  overlapCount: number
  fullDuplicateCount: number
  partialOverlapCount: number
  adoptedCount: number
  excludedCount: number
  inBedOnly: boolean
  isManualLike: boolean
  isUnknownSource: boolean
  logs: string[]
}

type TodayFocusPoint = {
  title: string
  value: string
  description: string
  tone: 'good' | 'notice' | 'calm'
}

type TimelineSegment = {
  id: string
  duration: string
  label: string
  left: number
  stageSegments: Array<{
    duration: string
    label: string
    left: number
    stage: NonNullable<SleepRecord['stage']>
    timeRange: string
    tone: 'rem' | 'core' | 'deep' | 'sleep'
    width: number
  }>
  stageSummary: string
  timeRange: string
  tone: 'main' | 'nap' | 'evening' | 'support'
  width: number
}

type StageSummaryInput = Array<{
  durationMinutes: number
  stage: NonNullable<SleepRecord['stage']>
}>

type TrendComparison = {
  averageBlockCount: number
  averageTotalSleepMinutes: number
  blockCountDiff: number
  totalSleepDiffMinutes: number
}

type CloudImportStatusPayload = {
  lastIngestedAt: string | null
  lastBatchId: string | null
  addedCount: number
  skippedDuplicateCount: number
  warningCount: number
  sleepRecordCount: number
}

type CloudTimelinePayload = {
  boundaryHour?: number
  days?: Array<{
    date: string
    blocks: Array<{
      start: string
      end: string
      durationMinutes: number
      type: 'main' | 'nap' | 'supplemental' | 'evening' | 'unknown'
      sourceKeys?: string[]
      sourceLabels?: string[]
      stageSegments?: Array<{
        durationMinutes: number
        end: string
        stage: NonNullable<SleepRecord['stage']>
        start: string
      }>
    }>
  }>
  month?: string
}

type MonthTimelineState = {
  error?: string | null
  generatedAt?: string
  isLoading: boolean
  month: string
  records: SleepRecord[]
  warnings: string[]
}

type DriveSyncStatusPayload = {
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

type SleepHealthContextPayload = {
  boundaryHour?: number
  days?: SleepHealthDailyContextView[]
}

type SleepHealthContextState = {
  days: SleepHealthDailyContextView[]
  error?: string | null
  loading?: boolean
}

const screens: Array<{ id: AppScreen; label: string; shortLabel: string }> = [
  { id: 'dashboard', label: '今日の睡眠', shortLabel: '今日' },
  { id: 'timeline', label: 'タイムライン', shortLabel: '時間' },
  { id: 'fragmentation', label: '分割睡眠', shortLabel: '分割' },
  { id: 'actions', label: '改善アクション', shortLabel: '行動' },
  { id: 'diagnosis', label: 'データ診断', shortLabel: '診断' },
  { id: 'import', label: '読み込み', shortLabel: '読込' },
  { id: 'settings', label: '設定', shortLabel: '設定' },
  { id: 'sources', label: '睡眠ソース', shortLabel: 'ソース' },
]

const SETTINGS_STORAGE_KEY = 'sleep-improvement.analysis-config'
const LOCAL_IMPORT_SERVER_URL =
  import.meta.env.VITE_HEALTH_IMPORT_SERVER_URL ??
  `${window.location.protocol}//${window.location.hostname}:8787`
const CLOUD_API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const FIREBASE_AUTH = getFirebaseAuth()
const EMPTY_SLEEP_DATA: SleepDataFile = {
  records: [],
  warnings: [],
}

function App() {
  const [activeScreen, setActiveScreen] = useState<AppScreen>('dashboard')
  const [sleepData, setSleepData] = useState<SleepDataFile>(EMPTY_SLEEP_DATA)
  const [config, setConfig] = useState<AnalysisConfig>(loadStoredConfig)
  const [sourcePreferences, setSourcePreferences] = useState<SleepSourcePreferenceMap>(
    loadStoredSourcePreferences,
  )
  const [fileStatus, setFileStatus] = useState(
    CLOUD_API_BASE_URL ? 'Cloud Run APIから睡眠データを取得中です' : 'ローカル自動取り込みサーバーを確認中です',
  )
  const [timelineView, setTimelineView] = useState<TimelineViewMode>('unified')
  const [timelineMonth, setTimelineMonth] = useState(getCurrentMonthKey)
  const [timelineMonthPinned, setTimelineMonthPinned] = useState(false)
  const [monthTimeline, setMonthTimeline] = useState<MonthTimelineState>({
    isLoading: false,
    month: getCurrentMonthKey(),
    records: [],
    warnings: [],
  })
  const [localImportStatus, setLocalImportStatus] = useState<LocalImportStatus>({
    connected: false,
  })
  const [driveSyncStatus, setDriveSyncStatus] = useState<DriveSyncStatusPayload | null>(null)
  const [sleepHealthContext, setSleepHealthContext] = useState<SleepHealthContextState>({
    days: [],
  })
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUserInfo | null>(null)
  const firebaseAuthAvailable = Boolean(FIREBASE_AUTH)
  const signInFromDashboard = async () => {
    if (!FIREBASE_AUTH) {
      setFileStatus('Firebase設定が見つかりません。')
      setActiveScreen('settings')
      return
    }

    try {
      setFileStatus('Googleログインを確認しています')
      await signInToApp(FIREBASE_AUTH)
    } catch (error) {
      setFileStatus(error instanceof Error ? error.message : 'ログインできませんでした。')
    }
  }

  const analysis = useMemo(() => {
    const rawBlocks = buildSleepBlocks(sleepData.records, config)
    const rawGroups = groupBySleepDay(rawBlocks, config)
    const rawSummaries = rawGroups.map((group) => summarizeSleepDay(group, config))
    const unifiedTimeline = buildUnifiedSleepTimeline(sleepData.records, config, sourcePreferences)
    const groups = groupBySleepDay(unifiedTimeline.blocks, config)
    const summaries = groups.map((group) => summarizeSleepDay(group, config))
    const actions = generateImprovementActions(summaries, config)
    const dataQuality = checkDataQuality(sleepData.records)
    const overlapReport = unifiedTimeline.overlapReport
    const sourceQuality = evaluateSourceQuality(sleepData.records, new Date(), overlapReport)
    const sourceDetails = buildSourceDetails(
      sleepData.records,
      sourceQuality,
      overlapReport,
      unifiedTimeline,
      sourcePreferences,
    )
    const todaySelection = selectTodaySleepSummary(summaries, config)
    const latestSummary = todaySelection.latestSummary
    const todaySummary = todaySelection.displaySummary
    const todayMetrics = todaySummary ? getDayMetrics(todaySummary) : null
    const todayActions = todaySummary ? generateImprovementActions([todaySummary], config) : []
    const latestSleepRecordAt = getLatestSleepRecordTimestamp(sleepData.records)

    return {
      blocks: unifiedTimeline.blocks,
      groups,
      rawBlocks,
      rawGroups,
      rawSummaries,
      summaries,
      actions,
      dataQuality,
      overlapReport,
      sourceQuality,
      sourceDetails,
      unifiedTimeline,
      isFallbackSleepDay: todaySelection.isFallback,
      targetSleepDayKey: todaySelection.targetSleepDayKey,
      latestSummary,
      latestSleepRecordAt,
      todaySummary,
      todayMetrics,
      todayActions,
    }
  }, [config, sleepData, sourcePreferences])
  const latestAvailableMonth = analysis.latestSummary
    ? getMonthKeyFromSleepDayKey(analysis.latestSummary.sleepDayKey)
    : null
  const selectedTimelineMonth =
    timelineMonthPinned || !latestAvailableMonth ? timelineMonth : latestAvailableMonth

  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(config))
  }, [config])

  useEffect(() => {
    saveStoredSourcePreferences(sourcePreferences)
  }, [sourcePreferences])

  useEffect(() => {
    if (!FIREBASE_AUTH) {
      return
    }

    return subscribeToAppAuthState(FIREBASE_AUTH, setFirebaseUser)
  }, [])

  useEffect(() => {
    let cancelled = false

    const refresh = async () => {
      const result = CLOUD_API_BASE_URL
        ? await fetchCloudServerData(firebaseUser, config.sleepDayBoundaryHour)
        : await fetchLocalServerData()

      if (cancelled) {
        return
      }

      setLocalImportStatus(result.status)
      setDriveSyncStatus(result.driveSyncStatus ?? null)
      setSleepHealthContext(result.sleepHealthContext ?? { days: [] })

      if (result.records.length > 0) {
        setSleepData({
          generatedAt: result.generatedAt ?? result.status.latestImport?.importedAt,
          sourceKind: 'health_auto_export_json',
          inputFileName: result.status.latestImport?.importedFileName,
          records: result.records,
          warnings: result.warnings,
        })
        setFileStatus(
          CLOUD_API_BASE_URL
            ? 'Cloud Run APIから最新データを取得しました'
            : 'ローカル自動取り込みサーバーから最新データを取得しました',
        )
      }
    }

    void refresh()
    const timer = window.setInterval(() => {
      void refresh()
    }, 60_000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [config.sleepDayBoundaryHour, firebaseUser])

  useEffect(() => {
    if (!CLOUD_API_BASE_URL) {
      return
    }

    let cancelled = false

    const refreshMonth = async () => {
      setMonthTimeline((current) => ({
        ...current,
        error: null,
        isLoading: true,
        month: selectedTimelineMonth,
      }))

      const result = await fetchCloudTimelineMonth(
        firebaseUser,
        config.sleepDayBoundaryHour,
        selectedTimelineMonth,
      )

      if (cancelled) {
        return
      }

      setMonthTimeline(result)
    }

    void refreshMonth()

    return () => {
      cancelled = true
    }
  }, [config.sleepDayBoundaryHour, firebaseUser, selectedTimelineMonth])

  const handleFileChange = async (file: File | undefined) => {
    if (!file) {
      return
    }

    try {
      const text = await file.text()
      const normalized = normalizeSleepFile(file.name, text)

      setSleepData({
        generatedAt: normalized.generatedAt,
        sourceKind: normalized.sourceKind,
        inputFileName: normalized.inputFileName,
        records: normalized.records,
        warnings: normalized.warnings,
      })
      setFileStatus(`${file.name} をブラウザ内で正規化しました`)
      setActiveScreen('diagnosis')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ファイルを読み込めませんでした。'
      setFileStatus(message)
    }
  }

  const displaySummaries = sortSleepSummariesDesc(analysis.summaries)
  const monthVisibleSummaries = useMemo(() => {
    const records = CLOUD_API_BASE_URL ? monthTimeline.records : sleepData.records
    const rawBlocks = buildSleepBlocks(records, config)
    const rawGroups = groupBySleepDay(rawBlocks, config)
    const rawSummaries = rawGroups.map((group) => summarizeSleepDay(group, config))
    const unifiedTimeline = buildUnifiedSleepTimeline(records, config, sourcePreferences)
    const groups = groupBySleepDay(unifiedTimeline.blocks, config)
    const summaries = groups.map((group) => summarizeSleepDay(group, config))
    const selectedSummaries = timelineView === 'unified' ? summaries : rawSummaries

    return filterSummariesByMonth(sortSleepSummariesDesc(selectedSummaries), selectedTimelineMonth)
  }, [
    config,
    monthTimeline.records,
    selectedTimelineMonth,
    sleepData.records,
    sourcePreferences,
    timelineView,
  ])
  const monthTimelineStatus = CLOUD_API_BASE_URL
    ? {
        error: monthTimeline.error,
        isLoading: monthTimeline.isLoading,
      }
    : {
        error: null,
        isLoading: false,
      }
  const handleTimelineMonthChange = (month: string) => {
    setTimelineMonth(normalizeMonthInput(month))
    setTimelineMonthPinned(true)
  }
  const handleLocalRescan = async () => {
    const status = await requestLocalRescan()
    setLocalImportStatus(status)
    const result = await fetchLocalServerData()
    setLocalImportStatus(result.status)
    if (result.records.length > 0) {
      setSleepData({
        generatedAt: result.generatedAt ?? result.status.latestImport?.importedAt,
        sourceKind: 'health_auto_export_json',
        inputFileName: result.status.latestImport?.importedFileName,
        records: result.records,
        warnings: result.warnings,
      })
      setFileStatus('手動再スキャンで最新データを取得しました')
    }
  }

  return (
    <main
      className="app-shell"
      style={{ '--decor-dreamscape': `url(${sleepPastelDreamscapeBg})` } as CSSProperties}
    >
      <header className="app-header">
        <div className="brand-lockup">
          <img
            alt=""
            aria-hidden="true"
            className="brand-logo-mark"
            src={sleepCompassLogo}
          />
          <div className="brand-wordmark">
            <p className="eyebrow">睡眠改善ログ</p>
            <h1>Sleep Compass</h1>
            <p className="header-copy">
              医学的診断ではなく、睡眠ブロックの傾向と改善の目安を表示します。
            </p>
          </div>
        </div>
      </header>

      <nav className="screen-tabs" aria-label="画面">
        {screens.map((screen) => (
          <button
            className={activeScreen === screen.id ? 'active' : ''}
            key={screen.id}
            onClick={() => setActiveScreen(screen.id)}
            type="button"
          >
            <span className="tab-label-full">{screen.label}</span>
            <span className="tab-label-short">{screen.shortLabel}</span>
          </button>
        ))}
      </nav>

      {activeScreen === 'diagnosis' && (
        <DataDiagnosis
          config={config}
          localImportStatus={localImportStatus}
          latestSleepRecordAt={analysis.latestSleepRecordAt}
          latestSummary={analysis.latestSummary}
          sleepHealthContext={sleepHealthContext}
          driveSyncStatus={driveSyncStatus}
          onRescan={handleLocalRescan}
          report={analysis.dataQuality}
          overlapReport={analysis.overlapReport}
          sourceQuality={analysis.sourceQuality}
          summaries={displaySummaries}
          unifiedTimeline={analysis.unifiedTimeline}
        />
      )}

      {activeScreen === 'dashboard' && (
        <TodaySleep
          actions={analysis.todayActions}
          config={config}
          driveSyncStatus={driveSyncStatus}
          importedAt={sleepData.generatedAt}
          localImportStatus={localImportStatus}
          metrics={analysis.todayMetrics}
          firebaseAuthAvailable={firebaseAuthAvailable}
          firebaseUser={firebaseUser}
          onOpenSettings={() => setActiveScreen('settings')}
          onSignIn={signInFromDashboard}
          summary={analysis.todaySummary}
          summaries={displaySummaries}
          sleepHealthContext={sleepHealthContext}
          isFallbackSleepDay={analysis.isFallbackSleepDay}
          targetSleepDayKey={analysis.targetSleepDayKey}
        />
      )}

      {activeScreen === 'timeline' && (
        <SleepTimeline
          config={config}
          latestAvailableMonth={latestAvailableMonth}
          monthStatus={monthTimelineStatus}
          onMonthChange={handleTimelineMonthChange}
          selectedMonth={timelineMonth}
          summaries={monthVisibleSummaries}
          timelineView={timelineView}
          onTimelineViewChange={setTimelineView}
        />
      )}

      {activeScreen === 'fragmentation' && (
        <FragmentationDetail
          config={config}
          latestAvailableMonth={latestAvailableMonth}
          monthStatus={monthTimelineStatus}
          onMonthChange={handleTimelineMonthChange}
          selectedMonth={timelineMonth}
          summaries={monthVisibleSummaries}
          timelineView={timelineView}
          onTimelineViewChange={setTimelineView}
        />
      )}

      {activeScreen === 'actions' && <TodayActions actions={analysis.actions} />}

      {activeScreen === 'settings' && (
        <Settings
          config={config}
          firebaseAuthAvailable={firebaseAuthAvailable}
          firebaseUser={firebaseUser}
          onChange={setConfig}
          onReset={() => {
            setConfig(defaultAnalysisConfig)
            localStorage.removeItem(SETTINGS_STORAGE_KEY)
          }}
        />
      )}

      {activeScreen === 'sources' && (
        <SourceSettings
          details={analysis.sourceDetails}
          preferences={sourcePreferences}
          onChange={setSourcePreferences}
          onReset={() => {
            setSourcePreferences({})
            resetStoredSourcePreferences()
          }}
        />
      )}

      {activeScreen === 'import' && (
        <FileImport
          fileStatus={fileStatus}
          onHealthAutoExportImported={(result) => {
            setSleepData(toSleepDataFile(result))
            setFileStatus(
              `${result.normalizedFile.sourceFile} をIndexedDBに保存し、分析結果を更新しました。新規${result.importStats.newRecordCount}件、重複${result.importStats.duplicateSkippedCount}件`,
            )
            setActiveScreen('dashboard')
          }}
          onFileChange={handleFileChange}
          onUseSample={() => {
            setSleepData({
              ...sampleSleepData,
              warnings: [],
            })
            setFileStatus('匿名サンプルを使用中')
          }}
        />
      )}
    </main>
  )
}

function toSleepDataFile(result: HealthAutoExportImportResult): SleepDataFile {
  return {
    generatedAt: result.normalizedFile.generatedAt,
    sourceKind: result.normalizedFile.sourceKind,
    inputFileName: result.normalizedFile.sourceFile,
    records: result.records,
    warnings: result.audit.messages
      .filter((message) => message.severity !== 'info')
      .map((message) => message.message),
  }
}

async function fetchLocalServerData(): Promise<{
  generatedAt?: string
  driveSyncStatus?: DriveSyncStatusPayload | null
  records: SleepRecord[]
  sleepHealthContext?: SleepHealthContextState
  warnings: string[]
  status: LocalImportStatus
}> {
  try {
    const [recordsResponse, statusResponse] = await Promise.all([
      fetch(`${LOCAL_IMPORT_SERVER_URL}/api/health-records`),
      fetch(`${LOCAL_IMPORT_SERVER_URL}/api/import-status`),
    ])

    if (!recordsResponse.ok || !statusResponse.ok) {
      throw new Error('ローカル自動取り込みサーバーに接続できません。')
    }

    const recordsPayload = (await recordsResponse.json()) as {
      generatedAt?: string
      records?: SleepRecord[]
      warnings?: string[]
    }
    const statusPayload = (await statusResponse.json()) as Omit<LocalImportStatus, 'connected'>

    return {
      generatedAt: recordsPayload.generatedAt,
      records: Array.isArray(recordsPayload.records) ? recordsPayload.records : [],
      warnings: Array.isArray(recordsPayload.warnings) ? recordsPayload.warnings : [],
      status: {
        ...statusPayload,
        connected: true,
      },
    }
  } catch {
    return {
      records: [],
      warnings: [],
      status: {
        connected: false,
      },
    }
  }
}

async function fetchCloudServerData(
  user: FirebaseUserInfo | null,
  boundaryHour: number,
): Promise<{
  generatedAt?: string
  driveSyncStatus?: DriveSyncStatusPayload | null
  records: SleepRecord[]
  sleepHealthContext?: SleepHealthContextState
  warnings: string[]
  status: LocalImportStatus
}> {
  if (!FIREBASE_AUTH || !user) {
    return {
      records: [],
      driveSyncStatus: null,
      sleepHealthContext: {
        days: [],
        error: 'ログイン後に表示します。',
      },
      warnings: [],
      status: {
        connected: false,
        lastError: 'Cloud Runの睡眠データを見るにはFirebaseログインが必要です。',
      },
    }
  }

  try {
    const idToken = await getAppIdToken(FIREBASE_AUTH)

    if (!idToken) {
      throw new Error('Firebase ID Tokenを取得できませんでした。')
    }

    const headers = {
      Authorization: `Bearer ${idToken}`,
    }
    const boundaryQuery = `boundaryHour=${encodeURIComponent(String(boundaryHour))}`
    const [statusResponse, timelineResponse] = await Promise.all([
      fetch(`${CLOUD_API_BASE_URL}/api/import-status`, { headers }),
      fetch(`${CLOUD_API_BASE_URL}/api/unified-timeline?days=30&${boundaryQuery}`, { headers }),
    ])
    const driveStatusResponse = await fetch(`${CLOUD_API_BASE_URL}/api/drive-sync-status`, {
      headers,
    })
    const sleepHealthContextResponse = await fetch(
      `${CLOUD_API_BASE_URL}/api/sleep-health-context?days=30&${boundaryQuery}`,
      { headers },
    )

    if (!statusResponse.ok || !timelineResponse.ok || !driveStatusResponse.ok) {
      throw new Error('Cloud Run APIから睡眠データを取得できません。')
    }

    const statusPayload = (await statusResponse.json()) as CloudImportStatusPayload
    const timelinePayload = (await timelineResponse.json()) as CloudTimelinePayload
    const driveSyncStatus = (await driveStatusResponse.json()) as DriveSyncStatusPayload
    const sleepHealthContext = sleepHealthContextResponse.ok
      ? ((await sleepHealthContextResponse.json()) as SleepHealthContextPayload)
      : null
    const records = cloudTimelineToSleepRecords(timelinePayload)

    return {
      generatedAt: statusPayload.lastIngestedAt ?? undefined,
      driveSyncStatus,
      sleepHealthContext: {
        days: Array.isArray(sleepHealthContext?.days) ? sleepHealthContext.days : [],
        error: sleepHealthContextResponse.ok
          ? null
          : sleepHealthContextResponse.status === 401
            ? 'ログイン状態を確認すると、変化候補を表示できます。'
            : '変化候補を取得できませんでした。',
      },
      records,
      warnings: [],
      status: {
        connected: true,
        isWatching: false,
        lastImportedAt: statusPayload.lastIngestedAt,
        lastProcessedFileName: statusPayload.lastBatchId,
        latestImport: {
          importedFileName: statusPayload.lastBatchId ?? 'Cloud Run',
          importedAt: statusPayload.lastIngestedAt ?? new Date().toISOString(),
          readFileCount: 0,
          normalizedCount: statusPayload.sleepRecordCount,
          newRecordCount: statusPayload.addedCount,
          duplicateSkippedCount: statusPayload.skippedDuplicateCount,
          rejectedRows: 0,
          warningCount: statusPayload.warningCount,
        },
      },
    }
  } catch (error) {
    return {
      records: [],
      driveSyncStatus: null,
      sleepHealthContext: {
        days: [],
        error: error instanceof Error ? error.message : '変化候補を取得できませんでした。',
      },
      warnings: [],
      status: {
        connected: false,
        lastError: error instanceof Error ? error.message : 'Cloud Run APIから取得できません。',
      },
    }
  }
}

async function fetchCloudTimelineMonth(
  user: FirebaseUserInfo | null,
  boundaryHour: number,
  month: string,
): Promise<MonthTimelineState> {
  if (!FIREBASE_AUTH || !user) {
    return {
      error: 'ログイン後に表示します。',
      isLoading: false,
      month,
      records: [],
      warnings: [],
    }
  }

  try {
    const idToken = await getAppIdToken(FIREBASE_AUTH)

    if (!idToken) {
      throw new Error('Firebase ID Tokenを取得できませんでした。')
    }

    const query = new URLSearchParams({
      boundaryHour: String(boundaryHour),
      month,
    })
    const response = await fetch(`${CLOUD_API_BASE_URL}/api/unified-timeline?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    })

    if (!response.ok) {
      throw new Error('指定月のタイムラインを取得できません。')
    }

    const payload = (await response.json()) as CloudTimelinePayload

    return {
      generatedAt: new Date().toISOString(),
      isLoading: false,
      month: payload.month ?? month,
      records: cloudTimelineToSleepRecords(payload),
      warnings: [],
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : '指定月のタイムラインを取得できません。',
      isLoading: false,
      month,
      records: [],
      warnings: [],
    }
  }
}

function cloudTimelineToSleepRecords(payload: CloudTimelinePayload): SleepRecord[] {
  return (payload.days ?? []).flatMap((day) =>
    day.blocks.flatMap((block, index): SleepRecord[] => {
      const sourceKey = block.sourceKeys?.[0] ?? 'unknown_source:cloud_run_api'
      const sourceLabel = block.sourceLabels?.[0] ?? toSourceKeyDisplay(sourceKey)
      const segments =
        block.stageSegments && block.stageSegments.length > 0
          ? block.stageSegments
          : [
              {
                durationMinutes: block.durationMinutes,
                end: block.end,
                stage: 'asleep' as const,
                start: block.start,
              },
            ]

      return segments.map((segment, segmentIndex): SleepRecord => ({
        id: `cloud-${day.date}-${index}-${segmentIndex}-${segment.start}`,
        value: segment.stage,
        sourceFormat: 'cloud_run_api',
        sourceFile: 'cloud_run_unified_timeline',
        sourceKey,
        sourceApp: sourceLabel,
        sourceName: sourceLabel,
        sourceKind: 'present',
        sourceLabel,
        originalValue: block.type,
        start: segment.start,
        end: segment.end,
        startDate: segment.start,
        endDate: segment.end,
        stage: normalizeTimelineStage(segment.stage),
        durationMinutes: segment.durationMinutes,
        hasStartDate: true,
        hasEndDate: true,
        hasSource: true,
      }))
    }),
  )
}

async function requestLocalRescan(): Promise<LocalImportStatus> {
  try {
    const response = await fetch(`${LOCAL_IMPORT_SERVER_URL}/api/rescan`, {
      method: 'POST',
    })

    if (!response.ok) {
      throw new Error('再スキャンに失敗しました。')
    }

    const payload = (await response.json()) as Omit<LocalImportStatus, 'connected'>
    return {
      ...payload,
      connected: true,
    }
  } catch (error) {
    return {
      connected: false,
      lastError: error instanceof Error ? error.message : '再スキャンに失敗しました。',
    }
  }
}

function DataDiagnosis({
  config,
  driveSyncStatus,
  latestSleepRecordAt,
  latestSummary,
  localImportStatus,
  onRescan,
  report,
  overlapReport,
  sourceQuality,
  sleepHealthContext,
  summaries,
  unifiedTimeline,
}: {
  config: AnalysisConfig
  driveSyncStatus: DriveSyncStatusPayload | null
  latestSleepRecordAt?: string
  latestSummary: SleepDaySummary | null
  localImportStatus: LocalImportStatus
  onRescan: () => Promise<void>
  report: DataQualityReport
  overlapReport: SleepOverlapReport
  sourceQuality: SourceQualityReport[]
  sleepHealthContext: SleepHealthContextState
  summaries: SleepDaySummary[]
  unifiedTimeline: UnifiedSleepTimeline
}) {
  const [diagnosisView, setDiagnosisView] = useState<'normal' | 'detail'>('normal')
  const blockCount = summaries.reduce((sum, summary) => sum + summary.blockCount, 0)
  const driveSyncLabel =
    driveSyncStatus?.lastStatus === 'normal'
      ? '正常に同期されています'
      : driveSyncStatus?.lastStatus === 'needs_attention'
        ? '確認が必要なファイルがあります'
        : '同期状態を確認中です'
  const driveSyncTone = driveSyncStatus?.lastStatus === 'needs_attention' ? 'notice' : 'good'
  const latestSleepDayKey = latestSummary?.sleepDayKey ?? null
  const sleepDayStatus = buildSleepDayDisplayStatus({
    boundaryHour: config.sleepDayBoundaryHour,
    displayedSleepDayKey: latestSleepDayKey,
    isFallbackSleepDay: latestSleepDayKey ? latestSleepDayKey !== summaries[0]?.sleepDayKey : false,
    targetSleepDayKey: latestSleepDayKey ?? '現在の睡眠日',
  })
  const sleepDayDataRows = buildSleepDayDataDiagnostics({
    contexts: sleepHealthContext.days,
    displayedSleepDay: latestSleepDayKey,
    limit: 7,
    targetSleepDay: latestSleepDayKey ?? '現在の睡眠日',
  })

  return (
    <section className="diagnosis-screen">
      <PageHeader
        eyebrow="データ診断"
        title="同期とデータの状態を確認する"
        description="Google Drive同期、取り込み状況、睡眠データの見やすさを確認します。細かい処理ログは詳細表示にまとめています。"
      />
      <div className="diagnosis-view-tabs" aria-label="データ診断の表示切り替え">
        <button
          className={diagnosisView === 'normal' ? 'active' : ''}
          onClick={() => setDiagnosisView('normal')}
          type="button"
        >
          通常表示
        </button>
        <button
          className={diagnosisView === 'detail' ? 'active' : ''}
          onClick={() => setDiagnosisView('detail')}
          type="button"
        >
          詳細表示
        </button>
      </div>

      {diagnosisView === 'normal' && (
        <div className="screen-grid">
          <Panel title="現在の状態">
            <div className="management-status-card">
              <StatusBadge tone={driveSyncTone}>{driveSyncLabel}</StatusBadge>
              <p>
                最終同期は
                <strong>{formatDateTime(driveSyncStatus?.lastSyncAt ?? undefined)}</strong>
                です。確認が必要なファイルは
                <strong>{driveSyncStatus?.lastFailedFiles ?? 0}件</strong>
                です。
              </p>
            </div>
            <div className="management-metric-grid">
              <MetricPill label="データ品質" value={report.label} />
              <MetricPill label="最新データ日" value={report.latestRecordDateLabel} />
              <MetricPill label="日付範囲" value={report.dateRangeLabel} />
              <MetricPill label="睡眠ブロック" value={`${blockCount}件`} />
            </div>
          </Panel>
          <Panel title="睡眠日の表示状態">
            <div className="management-status-card sleep-day-status-card">
              <StatusBadge tone={latestSummary ? 'calm' : 'notice'}>
                {latestSummary ? '最新睡眠日を確認できます' : '睡眠データ待ち'}
              </StatusBadge>
              <p>{sleepDayStatus.boundaryNotice}</p>
            </div>
            <div className="diagnosis-list">
              <StatusRow label="最新睡眠日" value={latestSummary?.sleepDayKey ?? 'まだありません'} />
              <StatusRow
                label="最新睡眠レコード"
                value={formatDateTime(latestSleepRecordAt)}
              />
              <StatusRow
                label="最新Driveファイル"
                value={driveSyncStatus?.latestFileName ?? '未取得'}
              />
              <StatusRow
                label="Driveファイル更新"
                value={formatDateTime(driveSyncStatus?.latestFileModifiedTime ?? undefined)}
              />
              <StatusRow label="表示ルール" value={sleepDayStatus.boundaryNotice} />
            </div>
          </Panel>
          <SleepImportStateCard
            driveSyncStatus={driveSyncStatus}
            importedAt={localImportStatus.lastImportedAt ?? undefined}
            latestSleepRecordAt={latestSleepRecordAt}
            latestSummary={latestSummary}
            sleepDayDisplayStatus={sleepDayStatus}
            targetSleepDayKey={latestSleepDayKey ?? '現在の睡眠日'}
          />
          <DriveSyncStatusCard driveSyncStatus={driveSyncStatus} />
          <HealthAutoExportGuidePanel />
          <Panel title="この画面の見方">
            <p className="muted">
              この画面では、取り込み状況・睡眠日ごとのデータ有無・Health Auto Exportの出力目安を確認できます。
            </p>
            <ul className="plain-list">
              <li>「表示と取り込み」は、画面に出ている睡眠日と最新データの到達状況を確認する欄です。</li>
              <li>「睡眠日ごとのデータ状況」は詳細確認用です。必要な時だけ最後に見れば十分です。</li>
              <li>睡眠日は{formatSleepDayBoundaryWindowLabel(config.sleepDayBoundaryHour)}で見ています。</li>
            </ul>
          </Panel>
          <Panel title="データ品質の注意点">
            <ul className="quality-list">
              {report.issues.map((issue) => (
                <li className={issue.severity} key={issue.id}>
                  {issue.message}
                </li>
              ))}
              {report.issues.length === 0 && <li>目立つ注意点はありません。</li>}
            </ul>
          </Panel>
          <SleepDayDataDiagnosticsPanel rows={sleepDayDataRows} />
        </div>
      )}

      {diagnosisView === 'detail' && (
        <div className="screen-grid">
          <AutoImportStatusPanel localImportStatus={localImportStatus} onRescan={onRescan} />
      <Panel title="ソース間の重なり">
        <p className="muted">
          統合前の確認です。ここでは候補を表示するだけで、睡眠データは削除しません。
        </p>
        <div className="overlap-summary-grid">
          <StatusRow
            label="完全重複候補"
            value={`${overlapReport.fullDuplicateCandidates.length}件`}
          />
          <StatusRow
            label="部分重複候補"
            value={`${overlapReport.partialOverlapCandidates.length}件`}
          />
          <StatusRow
            label="判断保留"
            value={`${overlapReport.pendingReviewCandidates.length}件`}
          />
          <StatusRow
            label="独立睡眠候補"
            value={`${overlapReport.independentBlockIds.length}件`}
          />
        </div>
        <ul className="plain-list import-format-list">
          <li>完全重複候補は、次の統合Phaseで二重カウントしない対象になります。</li>
          <li>部分重複候補は、まだ自動削除せず判断保留として扱います。</li>
          <li>独立した睡眠候補は、分割睡眠として残します。</li>
        </ul>
        {overlapReport.sourceSummaries.length > 0 && (
          <div className="source-overlap-list">
            {overlapReport.sourceSummaries.map((summary) => (
              <div key={summary.sourceKey}>
                <span>{summary.sourceKey}</span>
                <strong>{Math.round(summary.overlapRate * 100)}%</strong>
                <small>
                  {summary.overlappedBlockCount}/{summary.totalBlockCount}ブロック
                </small>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel title="統合タイムライン">
        <p className="muted">
          主要指標は統合後データで計算します。完全重複は自動でまとめ、部分重複は判断保留に残します。
        </p>
        <div className="overlap-summary-grid">
          <StatusRow
            label="統合前の総睡眠"
            value={formatMinutes(unifiedTimeline.comparison.rawTotalSleepMinutes)}
          />
          <StatusRow
            label="統合後の総睡眠"
            value={formatMinutes(unifiedTimeline.comparison.unifiedTotalSleepMinutes)}
          />
          <StatusRow
            label="統合前ブロック"
            value={`${unifiedTimeline.comparison.rawBlockCount}件`}
          />
          <StatusRow
            label="統合後ブロック"
            value={`${unifiedTimeline.comparison.unifiedBlockCount}件`}
          />
          <StatusRow
            label="採用レコード"
            value={`${unifiedTimeline.comparison.adoptedRecordCount}件`}
          />
          <StatusRow
            label="重複除外"
            value={`${unifiedTimeline.comparison.duplicateExcludedCount}件`}
          />
          <StatusRow
            label="補助データ利用"
            value={`${unifiedTimeline.comparison.fallbackUsedCount}件`}
          />
          <StatusRow
            label="判断保留"
            value={`${unifiedTimeline.comparison.pendingOverlapCount}件`}
          />
        </div>
        {unifiedTimeline.anomalyWarnings.length > 0 && (
          <ul className="quality-list">
            {unifiedTimeline.anomalyWarnings.map((warning) => (
              <li className="warning" key={warning}>
                {warning}
              </li>
            ))}
          </ul>
        )}
        <div className="unified-block-list">
          {unifiedTimeline.blocks.map((block) => (
            <article className="unified-block-item" key={block.id}>
              <div>
                <strong>{formatTimeRange(block)}</strong>
                <span>{block.sourceLabels.join(' / ')}</span>
              </div>
              <span>{formatMinutes(block.durationMinutes)}</span>
              {block.isPendingReview && <small>部分重複あり・主要指標では暫定採用</small>}
              {block.isFallbackBlock && <small>実睡眠データなしのためIn Bedを補助データとして採用</small>}
            </article>
          ))}
        </div>
      </Panel>
      <Panel title="統合理由ログ">
        <ul className="plain-list integration-log-list">
          {unifiedTimeline.logs.slice(0, 12).map((log) => (
            <li className={log.severity === 'warning' ? 'warning-note' : ''} key={log.id}>
              {log.message}
            </li>
          ))}
          {unifiedTimeline.logs.length > 12 && (
            <li>{unifiedTimeline.logs.length - 12}件のログを省略しています。</li>
          )}
          {unifiedTimeline.logs.length === 0 && <li>統合上の注意はありません。</li>}
        </ul>
      </Panel>
      <Panel title="ソース品質">
        <p className="muted">
          医学的な評価ではなく、このアプリ内で睡眠分析に使いやすいデータかを見る目安です。
        </p>
        <div className="source-quality-list">
          {sourceQuality.map((source) => (
            <article className="source-quality-item" key={source.sourceKey}>
              <div className="source-quality-head">
                <div>
                  <h3>{source.displayName}</h3>
                  <span>{toSourceKeyDisplay(source.sourceKey)}</span>
                </div>
                <strong>{source.qualityScore}</strong>
              </div>
              <p className={`source-use ${source.recommendedUse}`}>
                {toRecommendedUseDescription(source.recommendedUse)}
              </p>
              <StatusRow label="他データとの重なり率" value={`${Math.round(source.overlapRate * 100)}%`} />
              <div className="source-breakdown">
                {source.scoreBreakdown.map((item) => (
                  <div key={item.id}>
                    <span>{item.label}</span>
                    <strong>
                      {item.score}/{item.maxScore}
                    </strong>
                  </div>
                ))}
              </div>
              <SourceNotes title="強み" items={source.strengths} />
              {source.warnings.length > 0 && <SourceNotes title="注意点" items={source.warnings} />}
            </article>
          ))}
        </div>
      </Panel>
        </div>
      )}
    </section>
  )
}

function TodaySleep({
  actions,
  config,
  driveSyncStatus,
  importedAt,
  isFallbackSleepDay,
  firebaseAuthAvailable,
  firebaseUser,
  localImportStatus,
  metrics,
  onOpenSettings,
  onSignIn,
  summary,
  summaries,
  sleepHealthContext,
  targetSleepDayKey,
}: {
  actions: ImprovementAction[]
  config: AnalysisConfig
  driveSyncStatus: DriveSyncStatusPayload | null
  importedAt?: string
  isFallbackSleepDay: boolean
  firebaseAuthAvailable: boolean
  firebaseUser: FirebaseUserInfo | null
  localImportStatus: LocalImportStatus
  metrics: DayMetrics | null
  onOpenSettings: () => void
  onSignIn: () => Promise<void>
  summary: SleepDaySummary | null
  summaries: SleepDaySummary[]
  sleepHealthContext: SleepHealthContextState
  targetSleepDayKey: string
}) {
  const syncStatus = getCompactSyncStatus(localImportStatus, importedAt)
  const latestSummary = summaries[0] ?? null
  const latestMetrics = latestSummary ? getDayMetrics(latestSummary) : null
  const displayStatus = buildSleepDayDisplayStatus({
    boundaryHour: config.sleepDayBoundaryHour,
    displayedSleepDayKey: summary?.sleepDayKey ?? null,
    isFallbackSleepDay,
    targetSleepDayKey,
  })

  if (!summary || !metrics) {
    return (
      <section className="today-screen">
        <div className="today-hero empty">
          <img
            alt=""
            aria-hidden="true"
            className="hero-decoration"
            src={sleepHeroJournal}
          />
          <div className="today-hero-main">
            <p className="eyebrow">今日の睡眠</p>
            <h2>今日の睡眠データはまだ届いていません</h2>
            <p>
              {displayStatus.boundaryNotice} 対象の睡眠日
              <strong>{targetSleepDayKey}</strong>
              のデータが届くと、ここに今日の状態を表示します。
            </p>
            {CLOUD_API_BASE_URL && (
              <div className="drive-sync-mini warning">
                <span>Cloud API表示</span>
                <strong>
                  {!firebaseAuthAvailable
                    ? 'Firebase設定を確認してください'
                    : firebaseUser
                      ? '実データを取得中です'
                      : 'Googleログインが必要です'}
                </strong>
                <p>
                  {localImportStatus.lastError ??
                    (firebaseUser
                      ? '同期済みデータを読み込んでいます。少し待っても変わらない場合は再読み込みしてください。'
                      : 'ログイン後、Google Drive同期済みの睡眠データを表示します。')}
                </p>
                <div className="settings-actions">
                  {!firebaseUser && firebaseAuthAvailable && (
                    <button className="secondary-button" onClick={() => void onSignIn()} type="button">
                      Googleでログイン
                    </button>
                  )}
                  <button className="secondary-button" onClick={onOpenSettings} type="button">
                    設定を確認
                  </button>
                </div>
              </div>
            )}
            <CompactSyncStatus status={syncStatus} />
          </div>
          <div className="today-total">
            <span>表示状態</span>
            <strong>データ待ち</strong>
            <img
              alt=""
              aria-hidden="true"
              className="today-status-illustration"
              src={sleepEmptyWaiting}
            />
          </div>
        </div>

        <TimelinePlaceholder boundaryHour={config.sleepDayBoundaryHour} />

        <div className="empty-dashboard-grid">
          <article className="morning-action">
            <span>最後に取得した睡眠</span>
            <h2>{latestSummary ? latestSummary.sleepDayKey : 'まだありません'}</h2>
            <p>
              {latestSummary && latestMetrics
                ? `直近の記録は${formatMinutes(latestSummary.totalSleepMinutes)}、睡眠回数は${latestSummary.blockCount}回です。`
                : 'Google Drive同期後に、直近の睡眠日がここに表示されます。'}
            </p>
          </article>
          <DriveSyncMiniCard driveSyncStatus={driveSyncStatus} />
        </div>

        <section className="today-actions-panel next-step-panel">
          <h2>次にできること</h2>
          <div className="next-step-grid">
            <div>
              <strong>データ診断を見る</strong>
              <span>Google Drive同期と取り込み状態を確認します。</span>
            </div>
            <div>
              <strong>直近7日の睡眠を見る</strong>
              <span>タイムラインで最近の睡眠の形を確認します。</span>
            </div>
            <div>
              <strong>Health Auto Exportを確認</strong>
              <span>iPhone側の出力とDrive保存先を見ます。</span>
            </div>
          </div>
        </section>
      </section>
    )
  }

  const primaryAction = actions[0]
  const focusPoints = buildTodayFocusPoints(summary, metrics)
  const healthContextForDay =
    sleepHealthContext.days.find((day) => day.sleepDay === summary.sleepDayKey) ??
    sleepHealthContext.days[0] ??
    null
  const changeInsights = buildSleepHealthChangeInsights(healthContextForDay)
  const sevenDayTrend = getTrendComparison(summaries, summary, 7)
  const thirtyDayTrend = getTrendComparison(summaries, summary, 30)
  const visibleActions = actions.slice(0, 3)

  return (
    <section className="today-screen">
      <div className="today-hero today-hero-overview">
        <img
          alt=""
          aria-hidden="true"
          className="hero-decoration"
          src={sleepHeroJournal}
        />
        <div className="today-hero-column today-date-column">
          <p className="eyebrow">{isFallbackSleepDay ? '最新の睡眠' : '今日の睡眠'}</p>
          <h2>{summary.sleepDayKey}</h2>
          <p className="today-import-line">
            <span>最終取り込み</span>
            <strong>{formatDateTime(importedAt)}</strong>
          </p>
        </div>
        <div className="today-hero-column today-sync-column">
          <span className="today-column-label">自動取り込み</span>
          <CompactSyncStatus status={syncStatus} />
        </div>
        <div className="today-hero-column today-context-column">
          <span className="today-column-label">現在の睡眠日</span>
          <SleepDayNotice status={displayStatus} />
        </div>
        <div className="today-hero-facts" aria-label="今日の睡眠の要点">
          <MiniFact label="睡眠回数" value={`${summary.blockCount}回`} />
          <MiniFact label="最終起床" value={metrics.finalWakeTime} />
          <MiniFact label="中央時刻" value={metrics.sleepMidpoint} />
        </div>
        <div className="today-total">
          <span>総睡眠時間</span>
          <strong>{formatMinutes(summary.totalSleepMinutes)}</strong>
          <img
            alt=""
            aria-hidden="true"
            className="today-total-illustration"
            src={sleepHeroJournal}
          />
        </div>
      </div>

      <SleepTimeline24h boundaryHour={config.sleepDayBoundaryHour} summary={summary} />

      {primaryAction && (
        <article className="morning-action">
          <span>今日やること</span>
          <h2>{primaryAction.title}</h2>
          <p>{primaryAction.description}</p>
        </article>
      )}

      <section className="today-actions-panel">
        <h2>今日の注目ポイント</h2>
        <div className="today-focus-grid">
          {focusPoints.map((point) => (
            <article className={`focus-card ${point.tone}`} key={point.title}>
              <span>{point.title}</span>
              <strong>{point.value}</strong>
              <p>{point.description}</p>
            </article>
          ))}
        </div>
      </section>

      <SleepHealthChangeCard
        error={sleepHealthContext.error}
        insights={changeInsights}
        reasons={buildDataAvailabilityReasons({
          comparisonDayCount: sleepHealthContext.days.length,
          context: healthContextForDay,
          currentSleepDayWaiting: isFallbackSleepDay,
        })}
      />

      <div className="score-insight-grid">
        <ScoreInsightCard
          detail={summary.fragmentation.reasons[0] ?? summary.fragmentation.label}
          score={summary.fragmentation.score}
          title="分割睡眠"
        />
        <ScoreInsightCard
          detail={summary.circadian.reasons[0] ?? summary.circadian.label}
          score={summary.circadian.score}
          title="昼夜リズム"
        />
      </div>

      <div className="metric-grid">
        <Metric label="対象の睡眠日" value={summary.sleepDayKey} />
        <Metric label="睡眠回数" value={`${summary.blockCount}回`} />
        <Metric label="主睡眠候補" value={formatBlock(metrics.mainSleep)} />
        <Metric label="仮眠" value={formatBlockCount(metrics.napBlocks)} />
        <Metric label="補助睡眠" value={formatBlockCount(metrics.supportBlocks)} />
        <Metric label="夕方睡眠の有無" value={metrics.eveningBlocks.length > 0 ? 'あり' : 'なし'} />
        <Metric label="最終起床時刻" value={metrics.finalWakeTime} />
        <Metric label="睡眠中央時刻" value={metrics.sleepMidpoint} />
      </div>

      <section className="today-actions-panel">
        <h2>最近との比較</h2>
        <div className="trend-grid">
          <TrendCard label="過去7日" trend={sevenDayTrend} />
          <TrendCard label="過去30日" trend={thirtyDayTrend} />
        </div>
      </section>

      <section className="today-actions-panel">
        <h2>今日の改善アクション</h2>
        <div className="today-action-list">
          {visibleActions.map((action) => (
            <article className="today-action-item" key={action.id}>
              <img
                alt=""
                aria-hidden="true"
                className="today-action-illustration"
                src={getActionIllustration(action)}
              />
              <span className={`priority ${action.priority}`}>
                {toPriorityLabel(action.priority)}
              </span>
              <h3>{action.title}</h3>
              <p>{action.description}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  )
}

function SleepHealthChangeCard({
  error,
  insights,
  reasons,
}: {
  error?: string | null
  insights: SleepHealthChangeInsight[]
  reasons: string[]
}) {
  return (
    <section className="today-actions-panel sleep-health-change-card">
      <div className="section-head-row">
        <div>
          <span className="section-kicker">気づき候補</span>
          <h2>睡眠に影響していそうな変化</h2>
        </div>
      </div>
      <p className="sleep-health-change-copy">
        睡眠と活動の記録を並べて、見直しポイントだけを控えめに表示します。
      </p>
      {error && <p className="sleep-health-change-note">{error}</p>}
      <div className="sleep-health-change-list">
        {insights.map((insight) => (
          <article className={`sleep-health-change-item ${insight.tone}`} key={insight.id}>
            <span>{insight.title}</span>
            <p>{insight.description}</p>
          </article>
        ))}
      </div>
      {reasons.length > 0 && (
        <div className="sleep-health-reason-list">
          <span>表示が少ない時の理由</span>
          <ul>
            {reasons.slice(0, 4).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function CompactSyncStatus({
  status,
}: {
  status: { detail: string; label: string; tone: 'ok' | 'caution' | 'offline' }
}) {
  return (
    <div className={`sync-pill ${status.tone}`}>
      <span>{status.label}</span>
      <strong>{status.detail}</strong>
    </div>
  )
}

function TimelinePlaceholder({ boundaryHour }: { boundaryHour: number }) {
  const scaleLabels = getSleepDayBoundaryScaleLabels(boundaryHour)

  return (
    <section className="today-actions-panel sleep-day-timeline timeline-placeholder-card">
      <div className="section-head-row">
        <h2>24時間睡眠タイムライン</h2>
        <span className="timeline-window">{formatSleepDayBoundaryWindowLabel(boundaryHour)}</span>
      </div>
      <div className="timeline-scale" aria-hidden="true">
        {scaleLabels.map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
      <div
        aria-label="今日の睡眠データ取得後に表示される24時間タイムライン"
        className="timeline-track placeholder"
        role="img"
      >
        <img alt="" aria-hidden="true" className="timeline-empty-art" src={sleepTimelineClock} />
        <span className="timeline-empty">データが届くと、ここに睡眠ブロックが表示されます</span>
      </div>
      <p className="timeline-placeholder-copy">
        今日の睡眠バーは取得待ちです。直近データや同期状態は下のカードで確認できます。
      </p>
    </section>
  )
}

function DriveSyncMiniCard({
  driveSyncStatus,
}: {
  driveSyncStatus: DriveSyncStatusPayload | null
}) {
  const isNormal = driveSyncStatus?.lastStatus === 'normal'
  const needsAttention = driveSyncStatus?.lastStatus === 'needs_attention'

  return (
    <article className={`drive-sync-mini ${needsAttention ? 'warning' : 'normal'}`}>
      <span>Google Drive同期</span>
      <strong>
        {isNormal
          ? '正常に同期されています'
          : needsAttention
            ? '確認が必要なファイルがあります'
            : '同期状態を確認中です'}
      </strong>
      <div className="drive-sync-mini-grid">
        <MiniFact
          label="最終同期"
          value={formatDateTime(driveSyncStatus?.lastSyncAt ?? undefined)}
        />
        <MiniFact
          label="要確認"
          value={`${driveSyncStatus?.lastFailedFiles ?? 0}件`}
        />
        <MiniFact
          label="処理済み"
          value={`${driveSyncStatus?.processedDriveFileCount ?? 0}件`}
        />
      </div>
      <p>詳細はデータ診断タブで確認できます。</p>
    </article>
  )
}

function SleepDayNotice({ status }: { status: ReturnType<typeof buildSleepDayDisplayStatus> }) {
  return (
    <div className={`sleep-day-notice ${status.isCurrentSleepDayWaiting ? 'waiting' : 'current'}`}>
      <p>{status.reason}</p>
      <p>{status.boundaryNotice}</p>
    </div>
  )
}

function SleepImportStateCard({
  compact = false,
  driveSyncStatus,
  importedAt,
  latestSleepRecordAt,
  latestSummary,
  sleepDayDisplayStatus,
  targetSleepDayKey,
}: {
  compact?: boolean
  driveSyncStatus: DriveSyncStatusPayload | null
  importedAt?: string
  latestSleepRecordAt?: string
  latestSummary: SleepDaySummary | null
  sleepDayDisplayStatus: ReturnType<typeof buildSleepDayDisplayStatus>
  targetSleepDayKey: string
}) {
  const lastSync = driveSyncStatus?.lastSyncAt ?? importedAt
  const latestFile = driveSyncStatus?.latestFileName ?? '未取得'
  const currentSleepDayText = sleepDayDisplayStatus.isCurrentSleepDayWaiting
    ? `${targetSleepDayKey}はデータ待ち`
    : `${targetSleepDayKey}を表示中`

  return (
    <article className={`sleep-import-state ${compact ? 'compact' : ''}`}>
      <div className="sleep-import-state-head">
        <span>表示と取り込み</span>
        <strong>{sleepDayDisplayStatus.isCurrentSleepDayWaiting ? '最新の睡眠日を表示中' : '現在の睡眠日を表示中'}</strong>
      </div>
      <div className="sleep-import-state-grid">
        <MiniFact label="最終Drive同期" value={formatDateTime(lastSync)} />
        <MiniFact label="最新Driveファイル" value={latestFile} />
        <MiniFact label="最新睡眠レコード" value={formatDateTime(latestSleepRecordAt)} />
        <MiniFact label="最新睡眠日" value={latestSummary?.sleepDayKey ?? 'まだありません'} />
        <MiniFact label="現在の睡眠日" value={currentSleepDayText} />
      </div>
    </article>
  )
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="mini-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function SleepTimeline24h({
  boundaryHour,
  embedded = false,
  summary,
}: {
  boundaryHour: number
  embedded?: boolean
  summary: SleepDaySummary
}) {
  const scaleLabels = getSleepDayBoundaryScaleLabels(boundaryHour)
  const segments = getSleepTimelineSegments(summary, boundaryHour)
  const hasBlocks = segments.length > 0

  return (
    <section className={`${embedded ? 'embedded-timeline' : 'today-actions-panel'} sleep-day-timeline`}>
      <div className="section-head-row">
        <h2>24時間睡眠タイムライン</h2>
        <span className="timeline-window">{formatSleepDayBoundaryWindowLabel(boundaryHour)}</span>
      </div>
      <div className="timeline-scale" aria-hidden="true">
        {scaleLabels.map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
      <div
        aria-label={`${summary.sleepDayKey}の睡眠タイムライン`}
        className="timeline-track"
        role="img"
      >
        {segments.map((segment) => (
          <div
            className={`timeline-segment ${segment.tone}`}
            key={segment.id}
            style={{ left: `${segment.left}%`, width: `${segment.width}%` }}
            title={`${segment.label} ${segment.timeRange} ${segment.duration}${segment.stageSummary ? ` / ${segment.stageSummary}` : ''}`}
          >
            {segment.stageSegments.length > 0 && (
              <div className="timeline-stage-strip" aria-hidden="true">
                {segment.stageSegments.map((stageSegment) => (
                  <span
                    className={`timeline-stage-segment ${stageSegment.tone}`}
                    key={`${segment.id}-${stageSegment.stage}-${stageSegment.left}-${stageSegment.width}`}
                    style={{ left: `${stageSegment.left}%`, width: `${stageSegment.width}%` }}
                    title={`${stageSegment.label} ${stageSegment.timeRange} ${stageSegment.duration}`}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
        {!hasBlocks && <span className="timeline-empty">表示できる睡眠ブロックがありません</span>}
      </div>
      {hasBlocks && (
        <div className="timeline-block-labels" aria-label="睡眠ブロックの時刻">
          {segments.map((segment) => (
            <span
              className={segment.tone}
              key={`${segment.id}-label`}
              style={{ left: `${segment.left}%`, width: `${segment.width}%` }}
            >
              {segment.timeRange}
            </span>
          ))}
        </div>
      )}
      <div className="timeline-legend">
        <span className="main">主睡眠候補</span>
        <span className="nap">仮眠</span>
        <span className="evening">夕方睡眠</span>
        <span className="support">補助睡眠</span>
      </div>
      <StageLegend />
      {hasBlocks && <div className="timeline-summary-list">
        {segments.map((segment) => (
          <div key={`${segment.id}-summary`}>
            <span>{segment.label}</span>
            <strong>{segment.timeRange}</strong>
            <small>{segment.duration}</small>
            {segment.stageSummary && <em>{segment.stageSummary}</em>}
          </div>
        ))}
      </div>}
    </section>
  )
}

function ScoreInsightCard({
  detail,
  score,
  title,
}: {
  detail: string
  score: number
  title: string
}) {
  return (
    <article className="score-insight-card">
      <ScoreGauge score={score} title={`${title}スコア`} />
      <p>{detail}</p>
    </article>
  )
}

function TrendCard({
  label,
  trend,
}: {
  label: string
  trend: TrendComparison | null
}) {
  if (!trend) {
    return (
      <article className="trend-card">
        <span>{label}</span>
        <strong>比較データなし</strong>
        <p>もう少し記録が増えると、最近の傾向と比べられます。</p>
      </article>
    )
  }

  const totalDiff = trend.totalSleepDiffMinutes
  const countDiff = trend.blockCountDiff
  const totalText =
    Math.abs(totalDiff) < 1
      ? '平均とほぼ同じ'
      : `${totalDiff > 0 ? '+' : '-'}${formatMinutes(Math.abs(totalDiff))}`
  const countText =
    Math.abs(countDiff) < 0.1 ? '平均とほぼ同じ' : `${countDiff > 0 ? '+' : ''}${countDiff.toFixed(1)}回`

  return (
    <article className="trend-card">
      <span>{label}</span>
      <strong>{totalText}</strong>
      <p>
        総睡眠は平均{formatMinutes(trend.averageTotalSleepMinutes)}、睡眠回数は平均
        {trend.averageBlockCount.toFixed(1)}回です。今日の睡眠回数は{countText}です。
      </p>
    </article>
  )
}

function HealthAutoExportGuidePanel() {
  return (
    <Panel title="Health Auto Export 推奨出力">
      <p className="muted">{healthAutoExportGuide.intro}</p>
      <div className="hae-guide-grid">
        {healthAutoExportGuide.outputSections.map((section) => (
          <article className="hae-guide-card" key={section.title}>
            <span>{section.title}</span>
            {section.description && <p>{section.description}</p>}
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <DetailDisclosure title="同期が進まない時">
        <ol className="hae-recovery-list">
          {healthAutoExportGuide.recoverySteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="muted">{healthAutoExportGuide.recoveryNote}</p>
      </DetailDisclosure>
    </Panel>
  )
}

function DriveSyncStatusCard({
  driveSyncStatus,
}: {
  driveSyncStatus: DriveSyncStatusPayload | null
}) {
  const label =
    driveSyncStatus?.lastStatus === 'normal'
      ? '正常に同期されています'
      : driveSyncStatus?.lastStatus === 'needs_attention'
        ? '確認が必要なファイルがあります'
        : 'Drive同期はまだ確認できていません'
  const tone = driveSyncStatus?.lastStatus === 'needs_attention' ? 'warning' : 'good'

  return (
    <Panel title="Google Drive同期">
      <div className={`drive-sync-banner ${tone}`}>
        <span>同期状態</span>
        <strong>{label}</strong>
      </div>
      <div className="diagnosis-list">
        <StatusRow
          label="最終同期"
          value={formatDateTime(driveSyncStatus?.lastSyncAt ?? undefined)}
        />
        <StatusRow
          label="処理済みDriveファイル"
          value={`${driveSyncStatus?.processedDriveFileCount ?? 0}件`}
        />
        <StatusRow label="前回チェック" value={`${driveSyncStatus?.lastCheckedFiles ?? 0}件`} />
        <StatusRow label="前回処理" value={`${driveSyncStatus?.lastProcessedFiles ?? 0}件`} />
        <StatusRow
          label="処理済みスキップ"
          value={`${driveSyncStatus?.lastSkippedAlreadyProcessed ?? 0}件`}
        />
        <StatusRow
          label="確認が必要なファイル"
          value={`${driveSyncStatus?.lastFailedFiles ?? 0}件`}
        />
      </div>
      {driveSyncStatus && (
        <details className="drive-sync-details">
          <summary>同期の詳細</summary>
          <div className="diagnosis-list">
            <StatusRow label="最後のファイル" value={driveSyncStatus.latestFileName ?? 'なし'} />
            <StatusRow
              label="ファイル更新時刻"
              value={formatDateTime(driveSyncStatus.latestFileModifiedTime ?? undefined)}
            />
            <StatusRow label="警告" value={`${driveSyncStatus.warningCount}件`} />
            <StatusRow label="最新batch" value={driveSyncStatus.latestBatchId ?? 'なし'} />
          </div>
          {driveSyncStatus.failedFiles.length > 0 && (
            <ul className="quality-list">
              {driveSyncStatus.failedFiles.map((file) => (
                <li className="warning" key={`${file.fileName}-${file.processedAt ?? ''}`}>
                  {file.fileName}: {file.errorSummary}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
    </Panel>
  )
}

function SleepDayDataDiagnosticsPanel({ rows }: { rows: SleepDayDataDiagnosticRow[] }) {
  return (
    <Panel title="睡眠日ごとのデータ状況">
      <p className="muted">
        直近の睡眠日ごとに、睡眠・活動量・睡眠中メトリクスの有無だけを表示します。数値はここでは出しません。
      </p>
      <div className="sleep-day-data-list">
        {rows.map((row) => (
          <article className="sleep-day-data-row" key={row.sleepDay}>
            <div>
              <span className="eyebrow">睡眠日</span>
              <strong>{row.sleepDay}</strong>
              <small>{row.displayLabel}</small>
            </div>
            <DataStatusBadge label="睡眠" status={row.sleepDataStatus} />
            <DataStatusBadge
              detail={row.activityLabels.join(' / ') || undefined}
              label="活動量"
              status={row.activityDataStatus}
            />
            <DataStatusBadge
              detail={row.sleepWindowMetricLabels.join(' / ') || undefined}
              label="睡眠中"
              status={row.sleepWindowMetricStatus}
            />
          </article>
        ))}
      </div>
    </Panel>
  )
}

function DataStatusBadge({
  detail,
  label,
  status,
}: {
  detail?: string
  label: string
  status: SleepDayDataStatus
}) {
  return (
    <div className={`data-status-badge ${status}`}>
      <span>{label}</span>
      <strong>{toDataStatusLabel(status)}</strong>
      {detail && <small>{detail}</small>}
    </div>
  )
}

function AutoImportStatusPanel({
  localImportStatus,
  onRescan,
}: {
  localImportStatus: LocalImportStatus
  onRescan: () => Promise<void>
}) {
  return (
    <section className="today-actions-panel import-status-panel">
      <div className="section-head-row">
        <h2>自動取り込み</h2>
        <button className="secondary-button" onClick={() => void onRescan()} type="button">
          手動再スキャン
        </button>
      </div>
      <div className="diagnosis-list import-summary">
        <StatusRow
          label="自動取り込み"
          value={localImportStatus.connected && localImportStatus.isWatching ? '有効' : '無効'}
        />
        <StatusRow label="監視フォルダ" value={localImportStatus.watchDir ?? '未取得'} />
        <StatusRow
          label="定期スキャン間隔"
          value={formatMilliseconds(localImportStatus.scanIntervalMs)}
        />
        <StatusRow
          label="chokidarポーリング"
          value={localImportStatus.usePolling ? '使用中' : '未使用'}
        />
        <StatusRow
          label="chokidarポーリング間隔"
          value={formatMilliseconds(localImportStatus.pollIntervalMs)}
        />
        <StatusRow
          label="書き込み完了待ち時間"
          value={formatMilliseconds(localImportStatus.awaitWriteStabilityMs)}
        />
        <StatusRow
          label="最終スキャン"
          value={formatDateTime(localImportStatus.lastScanAt ?? undefined)}
        />
        <StatusRow
          label="最終取り込み"
          value={formatDateTime(localImportStatus.lastImportedAt ?? undefined)}
        />
        <StatusRow
          label="最後に処理したファイル"
          value={localImportStatus.lastProcessedFileName ?? 'なし'}
        />
        <StatusRow
          label="読み込んだファイル"
          value={`${localImportStatus.latestImport?.readFileCount ?? 0}件`}
        />
        <StatusRow
          label="新規追加レコード"
          value={`${localImportStatus.latestImport?.newRecordCount ?? 0}件`}
        />
        <StatusRow
          label="重複スキップ"
          value={`${localImportStatus.latestImport?.duplicateSkippedCount ?? 0}件`}
        />
        <StatusRow
          label="読み取れなかったデータ"
          value={`${localImportStatus.latestImport?.rejectedRows ?? 0}件`}
        />
        <StatusRow
          label="警告"
          value={`${localImportStatus.latestImport?.warningCount ?? 0}件`}
        />
      </div>
      {localImportStatus.lastError && (
        <p className="import-error">{localImportStatus.lastError}</p>
      )}
    </section>
  )
}

function SleepTimeline({
  config,
  latestAvailableMonth,
  monthStatus,
  onMonthChange,
  onTimelineViewChange,
  selectedMonth,
  summaries,
  timelineView,
}: {
  config: AnalysisConfig
  latestAvailableMonth: string | null
  monthStatus: { error?: string | null; isLoading: boolean }
  onMonthChange: (month: string) => void
  onTimelineViewChange: (view: TimelineViewMode) => void
  selectedMonth: string
  summaries: SleepDaySummary[]
  timelineView: TimelineViewMode
}) {
  const scaleLabels = getSleepDayBoundaryScaleLabels(config.sleepDayBoundaryHour)
  const scaleText = scaleLabels.join(' / ')

  if (summaries.length === 0) {
    return (
      <section className="stack timeline-screen">
        <PageHeader
          eyebrow="タイムライン"
          title="睡眠の形を日ごとに見る"
          description={`${formatSleepDayBoundaryWindowLabel(config.sleepDayBoundaryHour)}の24時間バーで、主睡眠・仮眠・補助睡眠の並びを確認します。`}
        />
        <DataViewToggle value={timelineView} onChange={onTimelineViewChange} />
        <MonthSelector
          latestAvailableMonth={latestAvailableMonth}
          monthStatus={monthStatus}
          onChange={onMonthChange}
          value={selectedMonth}
        />
        <EmptyState
          title={`${formatMonthLabel(selectedMonth)}の睡眠データはまだありません`}
          description="Google Drive同期またはファイル読み込みが完了すると、日ごとの24時間バーがここに並びます。データ診断タブで同期状態を確認できます。"
          actionLabel="データ診断で同期状態を確認"
          illustrationSrc={sleepTimelineClock}
        />
      </section>
    )
  }

  return (
    <section className="stack timeline-screen">
      <PageHeader
        eyebrow="タイムライン"
        title="睡眠の形を日ごとに見る"
        description="日ごとの24時間バーを縦に並べています。細かいブロック一覧は各日の詳細から確認できます。"
      />
      <DataViewToggle value={timelineView} onChange={onTimelineViewChange} />
      <MonthSelector
        latestAvailableMonth={latestAvailableMonth}
        monthStatus={monthStatus}
        onChange={onMonthChange}
        value={selectedMonth}
      />
      <SectionIntro
        title={`${formatMonthLabel(selectedMonth)}の日ごとの24時間バー`}
        description={`${scaleText} の流れで、複数回の睡眠も同じ線上に残します。`}
      />
      <div className="sleep-day-boundary-strip">
        {buildSleepDayBoundaryNotice(config.sleepDayBoundaryHour)}
      </div>
      {summaries.map((summary) => (
        <TimelineDayCard
          boundaryHour={config.sleepDayBoundaryHour}
          key={summary.sleepDayKey}
          summary={summary}
        />
      ))}
    </section>
  )
}

function TimelineDayCard({
  boundaryHour,
  summary,
}: {
  boundaryHour: number
  summary: SleepDaySummary
}) {
  const metrics = getDayMetrics(summary)
  const status = getTimelineDayStatus(summary)

  return (
    <article className="timeline-day-card">
      <div className="timeline-day-head">
        <div>
          <p className="eyebrow">睡眠日</p>
          <h2>{summary.sleepDayKey}</h2>
        </div>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>
      <div className="timeline-day-metrics">
        <MetricPill label="総睡眠" value={formatMinutes(summary.totalSleepMinutes)} />
        <MetricPill label="睡眠回数" value={`${summary.blockCount}回`} />
        <MetricPill label="主睡眠候補" value={formatBlock(metrics.mainSleep)} />
      </div>
      <TimelineBar boundaryHour={boundaryHour} summary={summary} />
      <DetailDisclosure title="睡眠ブロックの詳細">
        {summary.classifiedBlocks.length === 0 ? (
          <p className="muted">表示できる睡眠ブロックがありません。</p>
        ) : (
          <div className="timeline">
            {summary.classifiedBlocks.map((block) => (
              <article className="timeline-item" key={block.id}>
                <div className="timeline-time">
                  <strong>{formatTimeRange(block)}</strong>
                  <span>{formatMinutes(block.durationMinutes)}</span>
                </div>
                <div className="timeline-body">
                  <div className="tag-row">
                    {block.labels.map((label) => (
                      <span className="tag" key={label}>
                        {toBlockLabel(label)}
                      </span>
                    ))}
                  </div>
                  <p>{block.notes[0] ?? '睡眠ブロックとして集計しています。'}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </DetailDisclosure>
    </article>
  )
}

function FragmentationDetail({
  config,
  latestAvailableMonth,
  monthStatus,
  onMonthChange,
  onTimelineViewChange,
  selectedMonth,
  summaries,
  timelineView,
}: {
  config: AnalysisConfig
  latestAvailableMonth: string | null
  monthStatus: { error?: string | null; isLoading: boolean }
  onMonthChange: (month: string) => void
  onTimelineViewChange: (view: TimelineViewMode) => void
  selectedMonth: string
  summaries: SleepDaySummary[]
  timelineView: TimelineViewMode
}) {
  return (
    <section className="stack">
      <PageHeader
        eyebrow="分割睡眠"
        title="主睡眠と短い睡眠の関係を見る"
        description="睡眠が何回に分かれているか、どのブロックを主睡眠候補として見ているかを確認します。"
      />
      <DataViewToggle value={timelineView} onChange={onTimelineViewChange} />
      <MonthSelector
        latestAvailableMonth={latestAvailableMonth}
        monthStatus={monthStatus}
        onChange={onMonthChange}
        value={selectedMonth}
      />
      {summaries.length === 0 && (
        <EmptyState
          title={`${formatMonthLabel(selectedMonth)}の分割睡眠データはまだありません`}
          description="データが届くと、睡眠が何回に分かれたか、主睡眠候補と短い睡眠の関係をここに表示します。"
          actionLabel="データ診断で同期状態を確認"
          illustrationSrc={sleepSplitClouds}
        />
      )}
      {summaries.map((summary) => (
        <FragmentationDayCard
          boundaryHour={config.sleepDayBoundaryHour}
          key={summary.sleepDayKey}
          summary={summary}
        />
      ))}
    </section>
  )
}

function FragmentationDayCard({
  boundaryHour,
  summary,
}: {
  boundaryHour: number
  summary: SleepDaySummary
}) {
  const metrics = getDayMetrics(summary)
  const status = getTimelineDayStatus(summary)

  return (
    <article className="fragmentation-day-card">
      <div className="fragmentation-hero">
        <div>
          <p className="eyebrow">{summary.sleepDayKey}</p>
          <h2>{summary.blockCount}回に分かれています</h2>
          <p>
            {summary.blockCount <= 1
              ? '主睡眠候補を中心にまとまっています。'
              : '主睡眠候補と短い睡眠の関係を確認します。'}
          </p>
        </div>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>
      <div className="fragmentation-metrics">
        <MetricPill label="総睡眠" value={formatMinutes(summary.totalSleepMinutes)} />
        <MetricPill label="主睡眠候補" value={formatBlock(metrics.mainSleep)} />
        <MetricPill label="仮眠" value={formatBlockCount(metrics.napBlocks)} />
        <MetricPill label="夕方睡眠" value={metrics.eveningBlocks.length > 0 ? 'あり' : 'なし'} />
      </div>
      <TimelineBar boundaryHour={boundaryHour} summary={summary} />
      <SleepRelationDiagram summary={summary} />
      <section className="fragmentation-check-card">
        <div>
          <span>確認するとよいこと</span>
          <strong>{summary.fragmentation.label}</strong>
          <p>{summary.fragmentation.reasons[0] ?? '睡眠ブロックのまとまりを確認します。'}</p>
        </div>
        <ScoreGauge title="分割睡眠スコア" score={summary.fragmentation.score} />
      </section>
      <DetailDisclosure title="スコア理由と睡眠ブロックの詳細">
        <ul className="plain-list compact">
          {summary.fragmentation.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <div className="block-list">
          {summary.classifiedBlocks.map((block) => (
            <div className="block-row" key={block.id}>
              <span>{formatTimeRange(block)}</span>
              <strong>{formatMinutes(block.durationMinutes)}</strong>
              <span>{formatStageSummary(block.stageSegments) || 'ステージ未取得'}</span>
              <span>{block.labels.map(toBlockLabel).join(' / ')}</span>
            </div>
          ))}
        </div>
      </DetailDisclosure>
    </article>
  )
}

function SleepRelationDiagram({ summary }: { summary: SleepDaySummary }) {
  const metrics = getDayMetrics(summary)
  const relatedBlocks = summary.classifiedBlocks.filter((block) => block.id !== metrics.mainSleep?.id)

  return (
    <section className="sleep-relation-diagram" aria-label="主睡眠と仮眠の関係">
      <div className="relation-main">
        <span>主睡眠候補</span>
        <strong>{formatBlock(metrics.mainSleep)}</strong>
      </div>
      <div className="relation-line" aria-hidden="true" />
      <div className="relation-branches">
        {relatedBlocks.length === 0 && (
          <article className="relation-node calm">
            <span>追加の睡眠</span>
            <strong>なし</strong>
            <p>この睡眠日は主睡眠候補を中心にまとまっています。</p>
          </article>
        )}
        {relatedBlocks.map((block) => {
          const nodeType = getRelationNodeType(block)
          return (
            <article className={`relation-node ${nodeType}`} key={block.id}>
              <span>{toBlockLabelForRelation(block)}</span>
              <strong>{formatMinutes(block.durationMinutes)}</strong>
              <p>{formatTimeRange(block)}</p>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function TodayActions({ actions }: { actions: ImprovementAction[] }) {
  const fallbackActions: ImprovementAction[] =
    actions.length > 0
      ? actions
      : [
          {
            id: 'basic-morning-light',
            priority: 'medium',
            title: '起きたら部屋を明るくする',
            description: 'カーテンを開ける、照明をつける、短く外に出るなど、朝の合図を1つ作ります。',
            basis: '睡眠データがまだ少ないため、基本の行動を表示しています。',
          },
          {
            id: 'basic-evening-calm',
            priority: 'low',
            title: '寝る前の刺激を少し弱める',
            description: '照明、通知、長い動画を少し控えめにして、眠る前の切り替えを作ります。',
            basis: '無理なく続けやすい基本アクションです。',
          },
        ]
  const todayActions = fallbackActions.filter((action) => action.priority === 'high').slice(0, 2)
  const weeklyActions = fallbackActions.filter((action) => action.priority === 'medium').slice(0, 3)
  const enoughActions = fallbackActions.filter((action) => action.priority === 'low').slice(0, 3)
  const primaryTodayActions = todayActions.length > 0 ? todayActions : fallbackActions.slice(0, 1)

  return (
    <section className="action-list action-screen">
      <PageHeader
        eyebrow="改善アクション"
        title="今日できることを選ぶ"
        description="診断や指示ではなく、睡眠の傾向から生活で試しやすい目安を出します。できるものを1つ選べば十分です。"
      />
      {actions.length === 0 && (
        <EmptyState
          title="睡眠データが少ないため、基本アクションを表示しています"
          description="データが増えると、分割睡眠や昼夜リズムの傾向に合わせた行動がここに並びます。"
          illustrationSrc={sleepEmptyWaiting}
        />
      )}
      <ActionGroup
        actions={primaryTodayActions}
        description="今日まず見る行動です。全部やる必要はありません。"
        title="今日やること"
      />
      <ActionGroup
        actions={weeklyActions}
        description="数日かけて整える行動です。無理なく続けやすいものを選びます。"
        title="今週意識すること"
      />
      <ActionGroup
        actions={enoughActions}
        description="余裕がある時だけで十分な行動です。小さく続けるための候補です。"
        title="できたら十分"
      />
    </section>
  )
}

function ActionGroup({
  actions,
  description,
  title,
}: {
  actions: ImprovementAction[]
  description: string
  title: string
}) {
  if (actions.length === 0) {
    return null
  }

  return (
    <section className="action-group">
      <SectionIntro title={title} description={description} />
      <div className="action-card-grid">
        {actions.map((action) => (
          <article className="action-task-card" key={action.id}>
            <div className="action-task-head">
              <span className={`priority ${action.priority}`}>{toPriorityLabel(action.priority)}</span>
              <StatusBadge tone={action.priority === 'high' ? 'notice' : 'calm'}>
                {toActionStatusLabel(action.priority)}
              </StatusBadge>
            </div>
            <img
              alt=""
              aria-hidden="true"
              className="action-card-illustration"
              src={getActionIllustration(action)}
            />
            <h2>{action.title}</h2>
            <p>{action.description}</p>
            <small>理由: {action.basis}</small>
            <div className="action-state-row" aria-label="行動状態">
              <span>今日試す</span>
              <span>見送り</span>
              <span>あとで確認</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function Settings({
  config,
  firebaseAuthAvailable,
  firebaseUser,
  onChange,
  onReset,
}: {
  config: AnalysisConfig
  firebaseAuthAvailable: boolean
  firebaseUser: FirebaseUserInfo | null
  onChange: (config: AnalysisConfig) => void
  onReset: () => void
}) {
  const updateNumber = (
    key:
      | 'sleepDayBoundaryHour'
      | 'mergeGapMinutes'
      | 'napCandidateMaxMinutes'
      | 'eveningSleepStartHour',
    value: number,
    min: number,
    max: number,
  ) => {
    onChange({
      ...config,
      [key]: Math.min(max, Math.max(min, value)),
    })
  }

  return (
    <section className="settings-screen">
      <PageHeader
        eyebrow="設定"
        title="睡眠の見方と改善ペースを調整する"
        description="分析の基準をこの端末に保存します。変更すると、今日の睡眠・タイムライン・改善アクションを同じ条件で再計算します。"
      />
      <FirebaseUserPanel
        authAvailable={firebaseAuthAvailable}
        user={firebaseUser}
      />

      <Panel title="睡眠日の見方">
        <p className="settings-copy">
          どの時間帯を1つの睡眠日としてまとめるかを決めます。昼夜逆転や分割睡眠を見るための土台です。
        </p>
        <div className="settings-grid">
          <NumberSetting
            description={`睡眠を何時で区切って1日分として見るかです。現在は${formatSleepDayBoundaryWindowLabel(config.sleepDayBoundaryHour)}を1つの睡眠日として扱います。`}
            label="睡眠日の区切り"
            max={23}
            min={0}
            suffix="時"
            value={config.sleepDayBoundaryHour}
            onChange={(value) => updateNumber('sleepDayBoundaryHour', value, 0, 23)}
          />
          <TimeSetting
            description="朝に起きたい時刻です。改善アクションの目安に使います。"
            label="目標起床時刻"
            value={config.targetWakeTime}
            onChange={(value) =>
              onChange({
                ...config,
                targetWakeTime: value,
              })
            }
          />
        </div>
      </Panel>

      <Panel title="分類ルール">
        <p className="settings-copy">
          睡眠ブロック、仮眠、夕方睡眠の見分け方を調整します。迷う場合は初期値のままで十分です。
        </p>
        <div className="settings-grid">
          <NumberSetting
            description="睡眠中の短い途切れを同じ睡眠としてまとめる幅です。初期値は30分です。"
            label="睡眠ブロックを結合するすき間"
            max={120}
            min={0}
            suffix="分以内"
            value={config.mergeGapMinutes}
            onChange={(value) => updateNumber('mergeGapMinutes', value, 0, 120)}
          />
          <NumberSetting
            description="この分数未満の睡眠を仮眠として表示します。初期値は90分です。"
            label="仮眠とみなす上限"
            max={240}
            min={15}
            suffix="分未満"
            value={config.napCandidateMaxMinutes}
            onChange={(value) => updateNumber('napCandidateMaxMinutes', value, 15, 240)}
          />
          <NumberSetting
            description="この時刻以降、夜の睡眠より前に始まる睡眠を夕方睡眠の目安にします。初期値は16:00です。"
            label="夕方睡眠の開始時刻"
            max={23}
            min={0}
            suffix="時"
            value={config.eveningSleepStartHour}
            onChange={(value) => updateNumber('eveningSleepStartHour', value, 0, 23)}
          />
        </div>
      </Panel>

      <Panel title="改善ペース">
        <p className="settings-copy">
          今日の改善アクションをどのくらい控えめに出すかを選びます。医療的な指示ではなく、生活の目安です。
        </p>
        <div className="settings-grid single-setting-grid">
          <PaceSetting
            value={config.improvementPace}
            onChange={(value) =>
              onChange({
                ...config,
                improvementPace: value,
              })
            }
          />
        </div>
      </Panel>

      <Panel title="設定の管理">
        <div className="settings-actions">
          <button className="secondary-button" onClick={onReset} type="button">
            初期設定に戻す
          </button>
        </div>
        <ul className="plain-list import-format-list">
          <li>変更はこの端末のブラウザだけに保存されます。</li>
          <li>健康データや設定値を外部送信しません。</li>
          <li>判定名は診断ではなく、傾向を見るための目安です。</li>
        </ul>
      </Panel>
    </section>
  )
}

function FirebaseUserPanel({
  authAvailable,
  user,
}: {
  authAvailable: boolean
  user: FirebaseUserInfo | null
}) {
  const [copyStatus, setCopyStatus] = useState('')
  const [authStatus, setAuthStatus] = useState('')

  const signIn = async () => {
    if (!FIREBASE_AUTH) {
      setAuthStatus('Firebase設定が見つかりません。')
      return
    }

    try {
      setAuthStatus('')
      await signInToApp(FIREBASE_AUTH)
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : 'ログインできませんでした。')
    }
  }

  const logOut = async () => {
    if (!FIREBASE_AUTH) {
      return
    }

    try {
      setAuthStatus('')
      await signOutFromApp(FIREBASE_AUTH)
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : 'ログアウトできませんでした。')
    }
  }

  const copyUid = async () => {
    if (!user?.uid) {
      return
    }

    try {
      await navigator.clipboard.writeText(user.uid)
      setCopyStatus('コピーしました')
    } catch {
      setCopyStatus('コピーできませんでした')
    }
  }

  return (
    <Panel title="ログイン状態">
      {!authAvailable && (
        <p className="settings-copy">
          Firebase設定が見つからないため、ログイン情報を表示できません。
        </p>
      )}
      {authAvailable && !user && (
        <div className="auth-user-card">
          <p className="settings-copy">
            Firebaseにログインしていません。ログイン後、ここにUIDが表示されます。
          </p>
          <button className="secondary-button auth-button" onClick={() => void signIn()} type="button">
            Googleでログイン
          </button>
        </div>
      )}
      {user && (
        <div className="auth-user-card">
          <StatusRow label="表示名" value={user.displayName ?? '未設定'} />
          <StatusRow label="メールアドレス" value={user.email ?? '未設定'} />
          <div className="status-row uid-row">
            <span>Firebase UID</span>
            <div>
              <strong>{user.uid}</strong>
              <button className="secondary-button" onClick={() => void copyUid()} type="button">
                コピー
              </button>
            </div>
          </div>
          <p className="settings-copy auth-note">
            このUIDをCloud Runの ALLOWED_FIREBASE_UIDS に設定します。ID Token本文は表示しません。
          </p>
          {copyStatus && <p className="file-status">{copyStatus}</p>}
          <button className="secondary-button auth-button" onClick={() => void logOut()} type="button">
            ログアウト
          </button>
        </div>
      )}
      {authStatus && <p className="import-error">{authStatus}</p>}
    </Panel>
  )
}

function SourceSettings({
  details,
  preferences,
  onChange,
  onReset,
}: {
  details: SleepSourceDetail[]
  preferences: SleepSourcePreferenceMap
  onChange: (preferences: SleepSourcePreferenceMap) => void
  onReset: () => void
}) {
  const updateUse = (sourceKey: string, use: SourceUseSetting) => {
    onChange(upsertSourcePreference(preferences, sourceKey, { use }))
  }

  const updatePriority = (sourceKey: string, priority: number) => {
    onChange(upsertSourcePreference(preferences, sourceKey, { priority: clampSourcePriority(priority, details.length) }))
  }

  const resetOne = (sourceKey: string) => {
    onChange(removeSourcePreference(preferences, sourceKey))
  }

  return (
    <section className="settings-screen">
      <PageHeader
        eyebrow="睡眠ソース"
        title="使うデータ元を確認する"
        description="自動判定を目安に、どの睡眠データを優先するか調整できます。通常表示では使い方と注意点だけを見せます。"
      />
      <Panel title="睡眠ソース設定">
        <p className="settings-copy">
          自動判定を目安にしつつ、どのソースを優先するか調整できます。変更すると統合タイムライン、分割睡眠、昼夜逆転の目安を再計算します。
        </p>
        <div className="source-settings-list">
          {details.map((detail) => {
            return (
              <article className="source-setting-card" key={detail.sourceKey}>
                <div className="source-setting-head">
                  <div>
                    <h3>{detail.displayName}</h3>
                    <p>{detail.description}</p>
                  </div>
                  <div className={`source-status ${detail.effectiveUse}`}>
                    <span>{detail.statusLabel}</span>
                    <strong>{detail.quality.qualityScore}</strong>
                  </div>
                </div>

                <div className="source-setting-controls">
                  <label>
                    <span>使い方</span>
                    <select
                      value={detail.effectiveUse}
                      onChange={(event) =>
                        updateUse(detail.sourceKey, event.target.value as SourceUseSetting)
                      }
                    >
                      <option value="primary">優先して使う</option>
                      <option value="secondary">補助として使う</option>
                      <option value="fallback">他にない時だけ使う</option>
                      <option value="ignored">使わない</option>
                    </select>
                  </label>
                  <label>
                    <span>優先順位</span>
                    <input
                      disabled={details.length <= 1}
                      max={Math.max(1, details.length)}
                      min="1"
                      onChange={(event) =>
                        updatePriority(detail.sourceKey, Number(event.target.value))
                      }
                      type="number"
                      value={detail.priority}
                    />
                  </label>
                  <button
                    className="secondary-button"
                    onClick={() => resetOne(detail.sourceKey)}
                    type="button"
                  >
                    初期推奨に戻す
                  </button>
                </div>

                <div className="tag-row">
                  <span className="tag">{toRecommendedUseDescription(detail.quality.recommendedUse)}</span>
                  <span className="tag">推奨: {toRecommendedUseShortLabel(detail.quality.recommendedUse)}</span>
                  {detail.overlapCount > 0 && <span className="tag">他のデータと重なりがあります</span>}
                  {detail.isUnknownSource && <span className="tag">不明なデータ元</span>}
                </div>

                <DetailDisclosure title="このソースの詳細">
                  <div className="source-detail-panel">
                    <div className="overlap-summary-grid">
                      <StatusRow label="データ元キー" value={toSourceKeyDisplay(detail.sourceKey)} />
                      <StatusRow label="sourceApp" value={detail.sourceApp ?? 'なし'} />
                      <StatusRow label="sourceName" value={detail.sourceName ?? 'なし'} />
                      <StatusRow label="sourceBundleId" value={detail.sourceBundleId ?? 'なし'} />
                      <StatusRow label="deviceName" value={detail.deviceName ?? 'なし'} />
                      <StatusRow label="レコード数" value={`${detail.recordCount}件`} />
                      <StatusRow label="日付範囲" value={detail.dateRangeLabel} />
                      <StatusRow label="睡眠ステージ" value={detail.stageLabels.join(' / ') || 'なし'} />
                      <StatusRow label="他のデータと重なり" value={`${detail.overlapCount}件`} />
                      <StatusRow label="完全重複" value={`${detail.fullDuplicateCount}件`} />
                      <StatusRow label="部分重複" value={`${detail.partialOverlapCount}件`} />
                      <StatusRow label="統合時の採用" value={`${detail.adoptedCount}件`} />
                      <StatusRow label="統合時の除外" value={`${detail.excludedCount}件`} />
                      <StatusRow label="In Bedだけ" value={detail.inBedOnly ? 'はい' : 'いいえ'} />
                      <StatusRow label="手入力らしい" value={detail.isManualLike ? 'はい' : 'いいえ'} />
                      <StatusRow label="不明なデータ元" value={detail.isUnknownSource ? 'はい' : 'いいえ'} />
                    </div>
                    <div className="source-breakdown">
                      {detail.quality.scoreBreakdown.map((item) => (
                        <div key={item.id}>
                          <span>{item.label}</span>
                          <strong>
                            {item.score}/{item.maxScore}
                          </strong>
                        </div>
                      ))}
                    </div>
                    <SourceNotes title="強み" items={detail.quality.strengths} />
                    {detail.quality.warnings.length > 0 && (
                      <SourceNotes title="注意点" items={detail.quality.warnings} />
                    )}
                    <SourceNotes title="統合理由ログ" items={detail.logs} />
                  </div>
                </DetailDisclosure>
              </article>
            )
          })}
        </div>
      </Panel>

      <Panel title="ソース設定の管理">
        <button className="secondary-button" onClick={onReset} type="button">
          すべて初期推奨に戻す
        </button>
        <ul className="plain-list import-format-list">
          <li>「優先して使う」が複数ある場合は、優先順位の小さいソースを先に見ます。</li>
          <li>「使わない」にしたソースは統合タイムラインと主要指標から除外します。</li>
          <li>補助データは同じ時間帯に実睡眠データがない場合だけ使います。</li>
        </ul>
      </Panel>
    </section>
  )
}

function FileImport({
  fileStatus,
  onHealthAutoExportImported,
  onFileChange,
  onUseSample,
}: {
  fileStatus: string
  onHealthAutoExportImported: Parameters<typeof HealthAutoExportImportPanel>[0]['onImported']
  onFileChange: (file: File | undefined) => void
  onUseSample: () => void
}) {
  return (
    <section className="import-screen">
      <PageHeader
        eyebrow="読み込み"
        title="手動確認・緊急取り込み"
        description="通常運用はGoogle Drive同期で自動取り込みします。この画面は、ファイルの中身を確認したい時や緊急で手動取り込みしたい時に使います。"
      />
      <SectionIntro
        title="通常はGoogle Drive同期で十分です"
        description="Health Auto ExportがGoogle Driveへ保存したJSONは、Cloud Runが定期的に取得します。ここでファイルを選ぶ必要があるのは、手元のファイルを確認したい時だけです。"
      />
      <HealthAutoExportImportPanel onImported={onHealthAutoExportImported} />

      <div className="screen-grid">
      <Panel title="normalized JSON / AppleヘルスXMLを確認する">
        <p className="settings-copy">
          監査済みのnormalized JSONやAppleヘルスXMLを、ブラウザ内だけで読み込みます。通常運用では使わない補助ルートです。
        </p>
        <label className="file-drop">
          <span>normalized JSON / AppleヘルスXML</span>
          <input
            accept="application/json,.json,.xml,text/xml,application/xml"
            onChange={(event) => onFileChange(event.target.files?.[0])}
            type="file"
          />
        </label>
        <button className="secondary-button" onClick={onUseSample} type="button">
          匿名サンプルに戻す
        </button>
      </Panel>
      <Panel title="読み込み状態">
        <p className="file-status">{fileStatus}</p>
        <p className="muted">
          ファイルは端末のブラウザ内で解析します。健康データを外部送信する処理はありません。
        </p>
        <DetailDisclosure title="対応ファイル形式">
          <ul className="plain-list import-format-list">
            <li>推奨: Google Drive同期されたHealth Auto Export JSON</li>
            <li>手動確認: normalized-sleep-records.json</li>
            <li>手動確認: AppleヘルスXML</li>
          </ul>
        </DetailDisclosure>
      </Panel>
      </div>
    </section>
  )
}

function PageHeader({
  description,
  eyebrow,
  title,
}: {
  description: string
  eyebrow: string
  title: string
}) {
  const illustration = getPageHeaderIllustration(title, eyebrow)

  return (
    <header className="page-header">
      <div className="page-header-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {illustration && (
        <img
          alt=""
          aria-hidden="true"
          className="page-header-decoration"
          src={illustration}
        />
      )}
    </header>
  )
}

function SectionIntro({
  description,
  title,
}: {
  description: string
  title: string
}) {
  return (
    <section className="section-intro">
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  )
}

function StatusBadge({
  children,
  tone = 'calm',
}: {
  children: React.ReactNode
  tone?: 'good' | 'notice' | 'calm'
}) {
  return <span className={`status-badge ${tone}`}>{children}</span>
}

function EmptyState({
  actionLabel,
  description,
  illustrationSrc,
  title,
}: {
  actionLabel?: string
  description: string
  illustrationSrc?: string
  title: string
}) {
  return (
    <section className="empty-state redesigned-empty-state">
      {illustrationSrc && (
        <img alt="" aria-hidden="true" className="empty-state-illustration" src={illustrationSrc} />
      )}
      <p className="eyebrow">データ待ち</p>
      <h2>{title}</h2>
      <p>{description}</p>
      {actionLabel && <span className="empty-state-action">{actionLabel}</span>}
    </section>
  )
}

function DetailDisclosure({
  children,
  title,
}: {
  children: React.ReactNode
  title: string
}) {
  return (
    <details className="detail-disclosure">
      <summary>{title}</summary>
      <div>{children}</div>
    </details>
  )
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function DataViewToggle({
  onChange,
  value,
}: {
  onChange: (view: TimelineViewMode) => void
  value: TimelineViewMode
}) {
  return (
    <section className="data-view-toggle" aria-label="表示データの切り替え">
      <div>
        <strong>表示データ</strong>
        <p>統合後は重複を整理した睡眠データ、統合前は元データに近い表示です。</p>
      </div>
      <div className="data-view-toggle-buttons">
        <button
          className={value === 'unified' ? 'active' : ''}
          onClick={() => onChange('unified')}
          type="button"
        >
          統合後を見る
        </button>
        <button
          className={value === 'raw' ? 'active' : ''}
          onClick={() => onChange('raw')}
          type="button"
        >
          統合前を見る
        </button>
      </div>
    </section>
  )
}

function MonthSelector({
  latestAvailableMonth,
  monthStatus,
  onChange,
  value,
}: {
  latestAvailableMonth: string | null
  monthStatus: { error?: string | null; isLoading: boolean }
  onChange: (month: string) => void
  value: string
}) {
  const previousMonth = shiftMonthKey(value, -1)
  const nextMonth = shiftMonthKey(value, 1)

  return (
    <section className="month-selector" aria-label="表示月">
      <div>
        <strong>{formatMonthLabel(value)}</strong>
        <p>
          タイムラインと分割睡眠は、選択した睡眠日の月だけを表示します。
          {monthStatus.isLoading ? ' 取得中です。' : ''}
        </p>
        {monthStatus.error && <p className="import-error">{monthStatus.error}</p>}
      </div>
      <div className="month-selector-controls">
        <button onClick={() => onChange(previousMonth)} type="button">
          前月
        </button>
        <input
          aria-label="表示する年月"
          max="9999-12"
          min="2000-01"
          onChange={(event) => onChange(event.target.value)}
          type="month"
          value={value}
        />
        <button onClick={() => onChange(nextMonth)} type="button">
          翌月
        </button>
        {latestAvailableMonth && latestAvailableMonth !== value && (
          <button className="secondary-button" onClick={() => onChange(latestAvailableMonth)} type="button">
            最新月
          </button>
        )}
      </div>
    </section>
  )
}

function TimelineBar({
  boundaryHour,
  summary,
}: {
  boundaryHour: number
  summary: SleepDaySummary
}) {
  const scaleLabels = getSleepDayBoundaryScaleLabels(boundaryHour)
  const segments = getSleepTimelineSegments(summary, boundaryHour)

  return (
    <section className="timeline-bar" aria-label={`${summary.sleepDayKey}の24時間バー`}>
      <div className="timeline-scale" aria-hidden="true">
        {scaleLabels.map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
      <div className="timeline-track" role="img">
        {segments.map((segment) => (
          <div
            className={`timeline-segment ${segment.tone}`}
            key={segment.id}
            style={{ left: `${segment.left}%`, width: `${segment.width}%` }}
            title={`${segment.label} ${segment.timeRange} ${segment.duration}${segment.stageSummary ? ` / ${segment.stageSummary}` : ''}`}
          >
            {segment.stageSegments.length > 0 && (
              <div className="timeline-stage-strip" aria-hidden="true">
                {segment.stageSegments.map((stageSegment) => (
                  <span
                    className={`timeline-stage-segment ${stageSegment.tone}`}
                    key={`${segment.id}-${stageSegment.stage}-${stageSegment.left}-${stageSegment.width}`}
                    style={{ left: `${stageSegment.left}%`, width: `${stageSegment.width}%` }}
                    title={`${stageSegment.label} ${stageSegment.timeRange} ${stageSegment.duration}`}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
        {segments.length === 0 && <span className="timeline-empty">表示できる睡眠ブロックがありません</span>}
      </div>
      {segments.length > 0 && (
        <div className="timeline-block-labels" aria-label="睡眠ブロックの時刻">
          {segments.map((segment) => (
            <span
              className={segment.tone}
              key={`${segment.id}-label`}
              style={{ left: `${segment.left}%`, width: `${segment.width}%` }}
            >
              {segment.timeRange}
            </span>
          ))}
        </div>
      )}
      <div className="timeline-legend compact">
        <span className="main">主睡眠候補</span>
        <span className="nap">仮眠</span>
        <span className="evening">夕方睡眠</span>
        <span className="support">補助睡眠</span>
      </div>
      <StageLegend compact />
    </section>
  )
}

function StageLegend({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`stage-legend${compact ? ' compact' : ''}`}>
      <span className="stage-rem">レム</span>
      <span className="stage-core">コア</span>
      <span className="stage-deep">深い睡眠</span>
      <span className="stage-sleep">睡眠</span>
    </div>
  )
}

function Panel({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ScoreGauge({ score, title }: { score: number; title: string }) {
  return (
    <div className="score-gauge">
      <span>{title}</span>
      <strong>{score}</strong>
      <div className="score-track" aria-hidden="true">
        <div style={{ width: `${score}%` }} />
      </div>
    </div>
  )
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function SourceNotes({ items, title }: { items: string[]; title: string }) {
  return (
    <div className="source-notes">
      <span>{title}</span>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

function NumberSetting({
  description,
  label,
  max,
  min,
  onChange,
  suffix,
  value,
}: {
  description: string
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  suffix: string
  value: number
}) {
  return (
    <label className="setting-field">
      <span>
        {label}
        <small>{description}</small>
      </span>
      <div>
        <input
          inputMode="numeric"
          max={max}
          min={min}
          onChange={(event) => onChange(Number(event.target.value))}
          type="number"
          value={value}
        />
        <em>{suffix}</em>
      </div>
    </label>
  )
}

function TimeSetting({
  description,
  label,
  onChange,
  value,
}: {
  description: string
  label: string
  onChange: (value: string) => void
  value: string
}) {
  return (
    <label className="setting-field">
      <span>
        {label}
        <small>{description}</small>
      </span>
      <div>
        <input
          onChange={(event) => onChange(event.target.value)}
          type="time"
          value={value}
        />
      </div>
    </label>
  )
}

function PaceSetting({
  onChange,
  value,
}: {
  onChange: (value: ImprovementPace) => void
  value: ImprovementPace
}) {
  return (
    <fieldset className="setting-field pace-field">
      <legend>
        改善ペース
        <small>今日やることの強さを選びます。迷う場合は標準がおすすめです。</small>
      </legend>
      <div className="pace-options">
        {[
          ['slow', 'ゆっくり'],
          ['standard', '標準'],
          ['firm', 'しっかり'],
        ].map(([pace, label]) => (
          <button
            className={value === pace ? 'active' : ''}
            key={pace}
            onClick={() => onChange(pace as ImprovementPace)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function clampSourcePriority(priority: number, sourceCount: number): number {
  const maxPriority = Math.max(1, sourceCount)

  if (!Number.isFinite(priority)) {
    return 1
  }

  return Math.min(maxPriority, Math.max(1, Math.round(priority)))
}

function buildSourceDetails(
  records: SleepRecord[],
  sourceQuality: SourceQualityReport[],
  overlapReport: SleepOverlapReport,
  unifiedTimeline: UnifiedSleepTimeline,
  preferences: SleepSourcePreferenceMap,
): SleepSourceDetail[] {
  return sourceQuality.map((quality, index) => {
    const sourceRecords = records.filter(
      (record) => resolveSleepSource(record).sourceKey === quality.sourceKey,
    )
    const first = sourceRecords[0]
    const preference = preferences[quality.sourceKey]
    const effectiveUse = preference?.use ?? toSourceUseSetting(quality.recommendedUse)
    const priority = preference?.priority ?? index + 1
    const fullDuplicateCount = overlapReport.fullDuplicateCandidates.filter((candidate) =>
      candidate.sourceKeys.includes(quality.sourceKey),
    ).length
    const partialOverlapCount = overlapReport.partialOverlapCandidates.filter((candidate) =>
      candidate.sourceKeys.includes(quality.sourceKey),
    ).length
    const unifiedRecords = unifiedTimeline.records.filter(
      (record) => resolveSleepSource(record).sourceKey === quality.sourceKey,
    )
    const adoptedCount = unifiedRecords.filter((record) => record.unifiedStatus === 'adopted').length
    const excludedCount = unifiedRecords.filter((record) =>
      ['excluded_duplicate', 'pending_overlap', 'ignored'].includes(record.unifiedStatus),
    ).length
    const stageLabels = Array.from(
      new Set(sourceRecords.map((record) => String(record.stage ?? record.value))),
    )
    const inBedOnly =
      sourceRecords.length > 0 &&
      sourceRecords.every((record) => normalizeStageLabel(record.stage ?? record.value) === 'in_bed')
    const usesDefaultHealthExportLabel = isDefaultHealthExportSource(quality, sourceRecords)
    const displayName = usesDefaultHealthExportLabel ? 'Withings' : quality.displayName
    const sourceText = [
      quality.sourceKey,
      first?.sourceApp,
      first?.sourceName,
      first?.sourceKind,
      first?.sourceLabel,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return {
      sourceKey: quality.sourceKey,
      displayName,
      effectiveUse,
      priority,
      statusLabel: toSourceStatusLabel(effectiveUse, quality.warnings.length > 0),
      description: describeSourceSetting(quality, effectiveUse, usesDefaultHealthExportLabel),
      quality,
      sourceApp: first?.sourceApp ?? (usesDefaultHealthExportLabel ? 'Withings' : undefined),
      sourceName: first?.sourceName ?? (usesDefaultHealthExportLabel ? 'Withings' : undefined),
      sourceBundleId: first?.sourceBundleId,
      deviceName: first?.deviceName,
      recordCount: sourceRecords.length,
      dateRangeLabel: formatSourceDateRange(sourceRecords),
      stageLabels,
      overlapCount: fullDuplicateCount + partialOverlapCount,
      fullDuplicateCount,
      partialOverlapCount,
      adoptedCount,
      excludedCount,
      inBedOnly,
      isManualLike: sourceText.includes('manual') || sourceText.includes('手入力'),
      isUnknownSource: quality.sourceKey.startsWith('unknown_source') && !usesDefaultHealthExportLabel,
      logs: unifiedTimeline.logs
        .filter((log) => log.sourceKeys.includes(quality.sourceKey))
        .map((log) => log.message),
    }
  })
}

function describeSourceSetting(
  quality: SourceQualityReport,
  effectiveUse: SourceUseSetting,
  usesDefaultHealthExportLabel = false,
): string {
  if (effectiveUse === 'ignored') {
    return 'このソースはユーザー設定で除外されています。主要指標には使いません。'
  }

  if (usesDefaultHealthExportLabel) {
    return 'Health Auto Export由来の睡眠データです。元データのソース名が省略されているため、既定のデータ元として表示しています。'
  }

  if (quality.sourceKey.startsWith('unknown_source')) {
    return 'このソースは不明なソースですが、睡眠ステージが取れている場合は候補に残せます。'
  }

  if (quality.recommendedUse === 'primary') {
    return 'このソースは細かい睡眠ステージがあるため主データ候補です。'
  }

  if (quality.recommendedUse === 'fallback') {
    return 'このソースはIn Bed中心または手入力らしいため補助データです。'
  }

  if (quality.overlapRate > 0) {
    return 'このソースは他ソースと重なりが多いため、自動統合では一部除外されています。'
  }

  return 'このソースは睡眠分析の候補として利用できます。'
}

function isDefaultHealthExportSource(
  quality: SourceQualityReport,
  sourceRecords: SleepRecord[],
): boolean {
  return (
    quality.sourceKey.startsWith('unknown_source') &&
    (quality.displayName === '不明なソース' ||
      quality.sourceKey.includes('health_auto_export_json') ||
      sourceRecords.some((record) => record.sourceFormat === 'health_auto_export_json'))
  )
}

function toSourceStatusLabel(use: SourceUseSetting, hasWarnings: boolean): string {
  if (use === 'ignored') return '使わない'
  if (hasWarnings) return '注意あり'
  if (use === 'fallback') return '他にない時'
  if (use === 'secondary') return '補助'
  return '使用中'
}

function formatSourceDateRange(records: SleepRecord[]): string {
  const dates = records
    .flatMap((record) => [record.start ?? record.startDate, record.end ?? record.endDate])
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => left.getTime() - right.getTime())

  if (dates.length === 0) {
    return '日付なし'
  }

  return `${formatShortDate(dates[0])} - ${formatShortDate(dates.at(-1) ?? dates[0])}`
}

function toSourceKeyDisplay(sourceKey: string): string {
  if (sourceKey.startsWith('unknown_source')) {
    const suffix = sourceKey.replace(/^unknown_source:?/, '')
    return suffix ? `不明なデータ元（${suffix}）` : '不明なデータ元'
  }

  return sourceKey
}

function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function normalizeStageLabel(value: string): string {
  const normalized = value.toLowerCase()
  if (normalized.includes('inbed') || normalized === 'in_bed') return 'in_bed'
  return normalized
}

function loadStoredConfig(): AnalysisConfig {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY)

    if (!stored) {
      return defaultAnalysisConfig
    }

    const parsed = JSON.parse(stored) as Partial<AnalysisConfig>

    return {
      ...defaultAnalysisConfig,
      ...parsed,
    }
  } catch {
    return defaultAnalysisConfig
  }
}

function sortSleepSummariesDesc(summaries: SleepDaySummary[]): SleepDaySummary[] {
  return [...summaries].sort((left, right) => right.sleepDayKey.localeCompare(left.sleepDayKey))
}

function filterSummariesByMonth(summaries: SleepDaySummary[], month: string): SleepDaySummary[] {
  const monthKey = normalizeMonthInput(month)

  return summaries.filter((summary) => summary.sleepDayKey.startsWith(`${monthKey}-`))
}

function getCurrentMonthKey(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')

  return `${year}-${month}`
}

function getMonthKeyFromSleepDayKey(sleepDayKey: string): string {
  return normalizeMonthInput(sleepDayKey.slice(0, 7))
}

function normalizeMonthInput(value: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value)

  if (!match) {
    return getCurrentMonthKey()
  }

  const year = Number(match[1])
  const month = Number(match[2])

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return getCurrentMonthKey()
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
}

function shiftMonthKey(value: string, offset: number): string {
  const monthKey = normalizeMonthInput(value)
  const [year, month] = monthKey.split('-').map(Number)
  const shifted = new Date(year, month - 1 + offset, 1)

  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(value: string): string {
  const monthKey = normalizeMonthInput(value)
  const [year, month] = monthKey.split('-')

  return `${year}年${Number(month)}月`
}

function getLatestSleepRecordTimestamp(records: SleepRecord[]): string | undefined {
  let latestTime = Number.NEGATIVE_INFINITY
  let latestTimestamp: string | undefined

  for (const record of records) {
    const timestamp = record.end ?? record.endDate ?? record.start ?? record.startDate

    if (!timestamp) {
      continue
    }

    const time = new Date(timestamp).getTime()

    if (Number.isFinite(time) && time > latestTime) {
      latestTime = time
      latestTimestamp = timestamp
    }
  }

  return latestTimestamp
}

function getCompactSyncStatus(
  localImportStatus: LocalImportStatus,
  importedAt?: string,
): { detail: string; label: string; tone: 'ok' | 'caution' | 'offline' } {
  if (localImportStatus.connected && localImportStatus.isWatching) {
    return {
      detail: localImportStatus.lastProcessedFileName ?? '監視中',
      label: '自動取り込み 有効',
      tone: 'ok',
    }
  }

  if (localImportStatus.connected) {
    return {
      detail: localImportStatus.lastScanAt
        ? `最終スキャン ${formatDateTime(localImportStatus.lastScanAt)}`
        : 'ローカルサーバー接続中',
      label: '自動取り込み 待機',
      tone: 'caution',
    }
  }

  return {
    detail: importedAt ? `表示データ ${formatDateTime(importedAt)}` : '手動読み込みまたはサンプル',
    label: '手元のデータを表示中',
    tone: 'offline',
  }
}

function buildTodayFocusPoints(
  summary: SleepDaySummary,
  metrics: DayMetrics,
): TodayFocusPoint[] {
  const points: TodayFocusPoint[] = []

  points.push({
    title: '睡眠のまとまり',
    value: `${summary.blockCount}回`,
    description:
      summary.blockCount <= 1
        ? '大きな睡眠ブロックを中心にまとまっています。'
        : '複数の睡眠ブロックがあります。休む時間帯のばらつきを見ていきます。',
    tone: summary.blockCount <= 1 ? 'good' : 'notice',
  })

  points.push({
    title: '夕方睡眠',
    value: metrics.eveningBlocks.length > 0 ? 'あり' : 'なし',
    description:
      metrics.eveningBlocks.length > 0
        ? '16時以降に始まる睡眠があります。夜の眠気とのつながりを見る目安です。'
        : '夕方から夜にかけての長い睡眠は目立っていません。',
    tone: metrics.eveningBlocks.length > 0 ? 'notice' : 'good',
  })

  points.push({
    title: 'リズムの目安',
    value: metrics.sleepMidpoint,
    description:
      summary.circadian.score >= 70
        ? '睡眠の中心が遅めに寄っています。朝の光と起床時刻を少し意識します。'
        : '睡眠中央時刻を見ながら、無理のない範囲で整えていきます。',
    tone: summary.circadian.score >= 70 ? 'notice' : 'calm',
  })

  return points
}

function getTimelineDayStatus(summary: SleepDaySummary): {
  label: string
  tone: 'good' | 'notice' | 'calm'
} {
  if (summary.blockCount === 0) {
    return { label: 'データなし', tone: 'calm' }
  }

  if (summary.blockCount === 1 && summary.fragmentation.score <= 30) {
    return { label: 'まとまりあり', tone: 'good' }
  }

  if (summary.classifiedBlocks.some((block) => block.isEveningSleep)) {
    return { label: '夕方睡眠あり', tone: 'notice' }
  }

  if (summary.blockCount >= 3 || summary.fragmentation.score >= 60) {
    return { label: '分散気味', tone: 'notice' }
  }

  return { label: '確認しやすい記録', tone: 'calm' }
}

function getSleepTimelineSegments(
  summary: SleepDaySummary,
  boundaryHour: number,
): TimelineSegment[] {
  const boundaryStart = getSleepDayBoundaryStart(summary.sleepDayKey, boundaryHour)
  const windowStart = boundaryStart.getTime()
  const windowEnd = windowStart + 24 * 60 * 60 * 1000

  return summary.classifiedBlocks
    .map((block) => {
      if (!block.startDate || !block.endDate) {
        return null
      }

      const start = Math.max(new Date(block.startDate).getTime(), windowStart)
      const end = Math.min(new Date(block.endDate).getTime(), windowEnd)

      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return null
      }

      const left = ((start - windowStart) / (windowEnd - windowStart)) * 100
      const width = Math.max(((end - start) / (windowEnd - windowStart)) * 100, 1.2)
      const tone = getTimelineSegmentTone(block)
      const stageSegments = getStageTimelineSegments(block, start, end)
      const stageSummary = formatStageSummary(block.stageSegments)

      return {
        id: block.id,
        duration: formatMinutes(block.durationMinutes),
        label: block.labels.map(toBlockLabel).join(' / ') || '睡眠',
        left,
        stageSegments,
        stageSummary,
        timeRange: `${formatClock(new Date(start))} - ${formatClock(new Date(end))}`,
        tone,
        width,
      }
    })
    .filter((segment): segment is TimelineSegment => segment !== null)
}

function getStageTimelineSegments(
  block: ClassifiedSleepBlock,
  blockStart: number,
  blockEnd: number,
): TimelineSegment['stageSegments'] {
  const blockDuration = blockEnd - blockStart

  if (blockDuration <= 0) {
    return []
  }

  return block.stageSegments
    .map((stageSegment) => {
      const rawStart = new Date(stageSegment.start).getTime()
      const rawEnd = new Date(stageSegment.end).getTime()
      const start = Math.max(rawStart, blockStart)
      const end = Math.min(rawEnd, blockEnd)

      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return null
      }

      const stage = normalizeTimelineStage(stageSegment.stage)
      const left = ((start - blockStart) / blockDuration) * 100
      const width = Math.max(((end - start) / blockDuration) * 100, 0.8)

      return {
        duration: formatMinutes(Math.max(1, Math.round((end - start) / 60_000))),
        label: getStageLabel(stage),
        left,
        stage,
        timeRange: `${formatClock(new Date(start))} - ${formatClock(new Date(end))}`,
        tone: getStageTone(stage),
        width,
      }
    })
    .filter((segment): segment is TimelineSegment['stageSegments'][number] => segment !== null)
}

function formatStageSummary(stageSegments: StageSummaryInput): string {
  const totals = new Map<NonNullable<SleepRecord['stage']>, number>()

  for (const segment of stageSegments) {
    const stage = normalizeTimelineStage(segment.stage)
    totals.set(stage, (totals.get(stage) ?? 0) + segment.durationMinutes)
  }

  return getStageDisplayOrder()
    .map((stage) => {
      const minutes = totals.get(stage) ?? 0
      return minutes > 0 ? `${getStageLabel(stage)} ${formatMinutes(minutes)}` : null
    })
    .filter((item): item is string => Boolean(item))
    .join(' / ')
}

function getStageDisplayOrder(): Array<NonNullable<SleepRecord['stage']>> {
  return ['asleep_rem', 'asleep_core', 'asleep_deep', 'asleep', 'asleep_unspecified']
}

function getStageLabel(stage: NonNullable<SleepRecord['stage']>): string {
  switch (stage) {
    case 'asleep_rem':
      return 'レム'
    case 'asleep_core':
      return 'コア'
    case 'asleep_deep':
      return '深い睡眠'
    case 'asleep_unspecified':
      return '睡眠'
    case 'asleep':
      return '睡眠'
    case 'awake':
      return '覚醒'
    case 'in_bed':
      return 'ベッド内'
  }
}

function getStageTone(stage: NonNullable<SleepRecord['stage']>): TimelineSegment['stageSegments'][number]['tone'] {
  if (stage === 'asleep_rem') return 'rem'
  if (stage === 'asleep_core') return 'core'
  if (stage === 'asleep_deep') return 'deep'
  return 'sleep'
}

function normalizeTimelineStage(stage: string): NonNullable<SleepRecord['stage']> {
  const normalized = stage.toLowerCase()

  if (normalized.includes('rem')) return 'asleep_rem'
  if (normalized.includes('core')) return 'asleep_core'
  if (normalized.includes('deep')) return 'asleep_deep'
  if (normalized.includes('unspecified')) return 'asleep_unspecified'
  if (normalized === 'awake' || normalized.includes('awake')) return 'awake'
  if (normalized === 'in_bed' || normalized.includes('inbed')) return 'in_bed'
  if (normalized === 'asleep' || normalized.startsWith('asleep')) return 'asleep'

  return 'asleep_unspecified'
}

function getTimelineSegmentTone(block: ClassifiedSleepBlock): TimelineSegment['tone'] {
  if (block.isEveningSleep) return 'evening'
  if (block.isNapCandidate) return 'nap'
  if (block.labels.includes('main')) return 'main'
  return 'support'
}

function getRelationNodeType(block: ClassifiedSleepBlock): 'nap' | 'evening' | 'support' | 'calm' {
  if (block.isEveningSleep) return 'evening'
  if (block.isNapCandidate) return 'nap'
  if (block.labels.includes('other')) return 'support'
  return 'calm'
}

function toBlockLabelForRelation(block: ClassifiedSleepBlock): string {
  if (block.isEveningSleep) return '夕方睡眠'
  if (block.isNapCandidate) return '仮眠'
  if (block.labels.includes('other')) return '補助睡眠'
  return '追加の睡眠'
}

function getTrendComparison(
  summaries: SleepDaySummary[],
  current: SleepDaySummary,
  days: number,
): TrendComparison | null {
  const sorted = [...summaries].sort((left, right) =>
    left.sleepDayKey.localeCompare(right.sleepDayKey),
  )
  const currentIndex = sorted.findIndex((summary) => summary.sleepDayKey === current.sleepDayKey)

  if (currentIndex <= 0) {
    return null
  }

  const previous = sorted.slice(Math.max(0, currentIndex - days), currentIndex)

  if (previous.length === 0) {
    return null
  }

  const averageTotalSleepMinutes =
    previous.reduce((sum, summary) => sum + summary.totalSleepMinutes, 0) / previous.length
  const averageBlockCount =
    previous.reduce((sum, summary) => sum + summary.blockCount, 0) / previous.length

  return {
    averageBlockCount,
    averageTotalSleepMinutes,
    blockCountDiff: current.blockCount - averageBlockCount,
    totalSleepDiffMinutes: current.totalSleepMinutes - averageTotalSleepMinutes,
  }
}

function getDayMetrics(summary: SleepDaySummary): DayMetrics {
  const sortedByDuration = [...summary.classifiedBlocks].sort(
    (left, right) => right.durationMinutes - left.durationMinutes,
  )
  const mainSleep =
    sortedByDuration.find((block) => block.labels.includes('main')) ?? sortedByDuration[0] ?? null
  const napBlocks = summary.classifiedBlocks.filter((block) => block.isNapCandidate)
  const eveningBlocks = summary.classifiedBlocks.filter((block) => block.isEveningSleep)
  const supportBlocks = summary.classifiedBlocks.filter(
    (block) => block.id !== mainSleep?.id && !block.isNapCandidate,
  )

  return {
    mainSleep,
    napBlocks,
    supportBlocks,
    eveningBlocks,
    finalWakeTime: getFinalWakeTime(summary.classifiedBlocks),
    sleepMidpoint: getSleepMidpoint(summary.classifiedBlocks),
  }
}

function getFinalWakeTime(blocks: ClassifiedSleepBlock[]): string {
  const lastEnd = blocks
    .map((block) => (block.endDate ? new Date(block.endDate).getTime() : null))
    .filter((value): value is number => value !== null)
    .sort((left, right) => right - left)[0]

  return lastEnd ? formatClock(new Date(lastEnd)) : '時刻なし'
}

function getSleepMidpoint(blocks: ClassifiedSleepBlock[]): string {
  let weightedMidpoint = 0
  let totalMinutes = 0

  for (const block of blocks) {
    if (!block.startDate || !block.endDate) {
      continue
    }

    const start = new Date(block.startDate).getTime()
    const end = new Date(block.endDate).getTime()
    const minutes = (end - start) / 60_000
    weightedMidpoint += ((start + end) / 2) * minutes
    totalMinutes += minutes
  }

  return totalMinutes > 0 ? formatClock(new Date(weightedMidpoint / totalMinutes)) : '時刻なし'
}

function formatBlock(block: ClassifiedSleepBlock | null): string {
  if (!block) {
    return 'なし'
  }

  return `${formatMinutes(block.durationMinutes)} ${formatTimeRange(block)}`
}

function formatBlockCount(blocks: ClassifiedSleepBlock[]): string {
  if (blocks.length === 0) {
    return 'なし'
  }

  const totalMinutes = blocks.reduce((sum, block) => sum + block.durationMinutes, 0)
  return `${blocks.length}回 / ${formatMinutes(totalMinutes)}`
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = Math.round(minutes % 60)

  if (hours === 0) {
    return `${remainingMinutes}分`
  }

  return `${hours}時間${remainingMinutes}分`
}

function formatMilliseconds(milliseconds: number | undefined): string {
  if (!milliseconds || milliseconds <= 0) {
    return '未取得'
  }

  const seconds = Math.round(milliseconds / 1000)

  if (seconds < 60) {
    return `${seconds}秒`
  }

  const minutes = Math.round(seconds / 60)
  return `${minutes}分`
}

function formatTimeRange(block: SleepBlock): string {
  if (!block.startDate || !block.endDate) {
    return '時刻なし'
  }

  return `${formatClock(new Date(block.startDate))} - ${formatClock(new Date(block.endDate))}`
}

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatDateTime(value: string | undefined): string {
  if (!value) {
    return '未取り込み'
  }

  return new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function toBlockLabel(label: string): string {
  const labels: Record<string, string> = {
    main: '主睡眠候補',
    napCandidate: '仮眠',
    eveningSleep: '夕方睡眠',
    other: '補助睡眠',
  }

  return labels[label] ?? label
}

function toPriorityLabel(priority: ImprovementAction['priority']): string {
  const labels: Record<ImprovementAction['priority'], string> = {
    high: '今日の目安 高',
    medium: '今日の目安 中',
    low: '今日の目安 低',
  }

  return labels[priority]
}

function toActionStatusLabel(priority: ImprovementAction['priority']): string {
  if (priority === 'high') {
    return '今日の候補'
  }

  if (priority === 'medium') {
    return '続ける候補'
  }

  return '余裕があれば'
}

function getActionIllustration(action: ImprovementAction): string {
  const text = `${action.id} ${action.title} ${action.description}`

  if (
    text.includes('光') ||
    text.includes('朝') ||
    text.includes('カーテン') ||
    text.includes('照明') ||
    text.includes('歩') ||
    text.includes('散歩') ||
    text.includes('外')
  ) {
    return sleepActionMorning
  }

  if (
    text.includes('水分') ||
    text.includes('飲') ||
    text.includes('落ち着') ||
    text.includes('記録') ||
    text.includes('準備') ||
    text.includes('メモ') ||
    text.includes('寝') ||
    text.includes('眠') ||
    text.includes('ベッド')
  ) {
    return sleepActionEvening
  }

  return sleepActionEvening
}

function getPageHeaderIllustration(title: string, eyebrow: string): string {
  const text = `${title} ${eyebrow}`

  if (text.includes('タイムライン')) return sleepTimelineClock
  if (text.includes('分割睡眠')) return sleepSplitClouds
  if (text.includes('改善アクション')) return sleepActionMorning
  if (text.includes('データ診断')) return sleepEmptyWaiting
  if (text.includes('読み込み')) return sleepEmptyWaiting
  if (text.includes('設定')) return sleepActionEvening
  if (text.includes('睡眠ソース')) return sleepActionEvening

  return sleepHeroJournal
}

function toRecommendedUseDescription(use: SourceRecommendedUse): string {
  const labels: Record<SourceRecommendedUse, string> = {
    primary: 'このソースは主データ候補です',
    secondary: 'このソースは補助データ候補です',
    fallback: 'このソースはIn Bed中心または手入力らしいため補助データです',
    ignore: 'このソースは分析には使いにくい形式です',
  }

  return labels[use]
}

function toRecommendedUseShortLabel(use: SourceRecommendedUse): string {
  const labels: Record<SourceRecommendedUse, string> = {
    primary: '主データ',
    secondary: '補助データ候補',
    fallback: '補助データ',
    ignore: '使いにくい形式',
  }

  return labels[use]
}

export default App
