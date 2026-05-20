import { useEffect, useMemo, useState } from 'react'
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
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
import { getFirebaseAuth } from './lib/firebaseClient'
import { resolveSleepSource } from './lib/source/resolveSleepSource'
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
  timeRange: string
  tone: 'main' | 'nap' | 'evening' | 'support'
  width: number
}

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
  days?: Array<{
    date: string
    blocks: Array<{
      start: string
      end: string
      durationMinutes: number
      type: 'main' | 'nap' | 'supplemental' | 'evening' | 'unknown'
    }>
  }>
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

function App() {
  const [activeScreen, setActiveScreen] = useState<AppScreen>('dashboard')
  const [sleepData, setSleepData] = useState<SleepDataFile>({
    ...sampleSleepData,
    warnings: [],
  })
  const [config, setConfig] = useState<AnalysisConfig>(loadStoredConfig)
  const [sourcePreferences, setSourcePreferences] = useState<SleepSourcePreferenceMap>(
    loadStoredSourcePreferences,
  )
  const [fileStatus, setFileStatus] = useState('匿名サンプルを使用中')
  const [timelineView, setTimelineView] = useState<'unified' | 'raw'>('unified')
  const [localImportStatus, setLocalImportStatus] = useState<LocalImportStatus>({
    connected: false,
  })
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUserInfo | null>(null)
  const firebaseAuthAvailable = Boolean(FIREBASE_AUTH)

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
    const todaySummary = todaySelection.todaySummary
    const todayMetrics = todaySummary ? getDayMetrics(todaySummary) : null
    const todayActions = todaySummary ? generateImprovementActions([todaySummary], config) : []

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
      targetSleepDayKey: todaySelection.targetSleepDayKey,
      latestSummary,
      todaySummary,
      todayMetrics,
      todayActions,
    }
  }, [config, sleepData, sourcePreferences])

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

    return onAuthStateChanged(FIREBASE_AUTH, (user) => {
      setFirebaseUser(
        user
          ? {
              displayName: user.displayName,
              email: user.email,
              uid: user.uid,
            }
          : null,
      )
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    const refresh = async () => {
      const result = CLOUD_API_BASE_URL
        ? await fetchCloudServerData(firebaseUser)
        : await fetchLocalServerData()

      if (cancelled) {
        return
      }

      setLocalImportStatus(result.status)

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
  }, [firebaseUser])

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
  const displayRawSummaries = sortSleepSummariesDesc(analysis.rawSummaries)
  const visibleSummaries = timelineView === 'unified' ? displaySummaries : displayRawSummaries
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
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">睡眠改善ログ</p>
          <h1>Sleep Compass</h1>
          <p className="header-copy">
            医学的診断ではなく、睡眠ブロックの傾向と改善の目安を表示します。
          </p>
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

      <div className="timeline-view-toggle" aria-label="統合表示の切り替え">
        <span>表示データ</span>
        <button
          className={timelineView === 'unified' ? 'active' : ''}
          onClick={() => setTimelineView('unified')}
          type="button"
        >
          統合後を見る
        </button>
        <button
          className={timelineView === 'raw' ? 'active' : ''}
          onClick={() => setTimelineView('raw')}
          type="button"
        >
          統合前を見る
        </button>
      </div>

      {activeScreen === 'diagnosis' && (
        <DataDiagnosis
          fileStatus={fileStatus}
          inputFileName={sleepData.inputFileName}
          localImportStatus={localImportStatus}
          onRescan={handleLocalRescan}
          recordCount={sleepData.records.length}
          report={analysis.dataQuality}
          sourceKind={sleepData.sourceKind}
          overlapReport={analysis.overlapReport}
          sourceQuality={analysis.sourceQuality}
          summaries={displaySummaries}
          unifiedTimeline={analysis.unifiedTimeline}
          warnings={sleepData.warnings}
        />
      )}

      {activeScreen === 'dashboard' && (
        <TodaySleep
          actions={analysis.todayActions}
          importedAt={sleepData.generatedAt}
          localImportStatus={localImportStatus}
          metrics={analysis.todayMetrics}
          summary={analysis.todaySummary}
          summaries={displaySummaries}
          targetSleepDayKey={analysis.targetSleepDayKey}
        />
      )}

      {activeScreen === 'timeline' && <SleepTimeline summaries={visibleSummaries} />}

      {activeScreen === 'fragmentation' && (
        <FragmentationDetail summaries={visibleSummaries} />
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
  records: SleepRecord[]
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

async function fetchCloudServerData(user: FirebaseUserInfo | null): Promise<{
  generatedAt?: string
  records: SleepRecord[]
  warnings: string[]
  status: LocalImportStatus
}> {
  if (!FIREBASE_AUTH || !user) {
    return {
      records: [],
      warnings: [],
      status: {
        connected: false,
        lastError: 'Cloud Runの睡眠データを見るにはFirebaseログインが必要です。',
      },
    }
  }

  try {
    const idToken = await FIREBASE_AUTH.currentUser?.getIdToken()

    if (!idToken) {
      throw new Error('Firebase ID Tokenを取得できませんでした。')
    }

    const headers = {
      Authorization: `Bearer ${idToken}`,
    }
    const [statusResponse, timelineResponse] = await Promise.all([
      fetch(`${CLOUD_API_BASE_URL}/api/import-status`, { headers }),
      fetch(`${CLOUD_API_BASE_URL}/api/unified-timeline?days=30`, { headers }),
    ])

    if (!statusResponse.ok || !timelineResponse.ok) {
      throw new Error('Cloud Run APIから睡眠データを取得できません。')
    }

    const statusPayload = (await statusResponse.json()) as CloudImportStatusPayload
    const timelinePayload = (await timelineResponse.json()) as CloudTimelinePayload
    const records = cloudTimelineToSleepRecords(timelinePayload)

    return {
      generatedAt: statusPayload.lastIngestedAt ?? undefined,
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
      warnings: [],
      status: {
        connected: false,
        lastError: error instanceof Error ? error.message : 'Cloud Run APIから取得できません。',
      },
    }
  }
}

function cloudTimelineToSleepRecords(payload: CloudTimelinePayload): SleepRecord[] {
  return (payload.days ?? []).flatMap((day) =>
    day.blocks.map((block, index): SleepRecord => ({
      id: `cloud-${day.date}-${index}-${block.start}`,
      value: 'asleep',
      sourceFormat: 'cloud_run_api',
      sourceFile: 'cloud_run_unified_timeline',
      sourceKey: 'cloud_run_unified_timeline',
      sourceApp: 'Cloud Run',
      sourceName: 'Cloud Run',
      sourceKind: 'present',
      sourceLabel: 'Cloud Run',
      originalValue: block.type,
      start: block.start,
      end: block.end,
      startDate: block.start,
      endDate: block.end,
      stage: 'asleep',
      durationMinutes: block.durationMinutes,
      hasStartDate: true,
      hasEndDate: true,
      hasSource: true,
    })),
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
  fileStatus,
  inputFileName,
  localImportStatus,
  onRescan,
  recordCount,
  report,
  sourceKind,
  overlapReport,
  sourceQuality,
  summaries,
  unifiedTimeline,
  warnings,
}: {
  fileStatus: string
  inputFileName?: string
  localImportStatus: LocalImportStatus
  onRescan: () => Promise<void>
  recordCount: number
  report: DataQualityReport
  sourceKind?: string
  overlapReport: SleepOverlapReport
  sourceQuality: SourceQualityReport[]
  summaries: SleepDaySummary[]
  unifiedTimeline: UnifiedSleepTimeline
  warnings: string[]
}) {
  const [diagnosisView, setDiagnosisView] = useState<'normal' | 'detail'>('normal')
  const blockCount = summaries.reduce((sum, summary) => sum + summary.blockCount, 0)
  const actualTimeBlocks = summaries.flatMap((summary) =>
    summary.classifiedBlocks.filter((block) => block.timeConfidence === 'actual'),
  ).length
  const notes = summaries.flatMap((summary) => summary.notes)

  return (
    <section className="diagnosis-screen">
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
          <Panel title="データ診断">
            <div className="diagnosis-list">
              <div className={`quality-banner ${report.level}`}>
                <span>データ品質</span>
                <strong>{report.label}</strong>
              </div>
              <StatusRow label="読み込み状態" value={fileStatus} />
              <StatusRow label="ファイル名" value={inputFileName ?? '匿名サンプル'} />
              <StatusRow label="データ種別" value={sourceKind ?? '不明'} />
              <StatusRow label="睡眠レコード" value={`${recordCount}件`} />
              <StatusRow label="睡眠ブロック" value={`${blockCount}件`} />
              <StatusRow label="時刻つきブロック" value={`${actualTimeBlocks}件`} />
              <StatusRow label="日付範囲" value={report.dateRangeLabel} />
              <StatusRow label="最新データ日" value={report.latestRecordDateLabel} />
            </div>
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
          <Panel title="判定メモ">
            <ul className="plain-list">
              {warnings.map((warning) => (
                <li className="warning-note" key={warning}>
                  {warning}
                </li>
              ))}
              <li>18:00から翌18:00までを1つの睡眠日として扱います。</li>
              <li>1日に複数回の睡眠がある場合もすべて表示します。</li>
              <li>健康データはこの画面内で処理し、外部送信しません。</li>
              {notes.slice(0, 6).map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </Panel>
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
  importedAt,
  localImportStatus,
  metrics,
  summary,
  summaries,
  targetSleepDayKey,
}: {
  actions: ImprovementAction[]
  importedAt?: string
  localImportStatus: LocalImportStatus
  metrics: DayMetrics | null
  summary: SleepDaySummary | null
  summaries: SleepDaySummary[]
  targetSleepDayKey: string
}) {
  const syncStatus = getCompactSyncStatus(localImportStatus, importedAt)

  if (!summary || !metrics) {
    return (
      <section className="today-screen">
        <div className="today-hero">
          <div className="today-hero-main">
            <p className="eyebrow">今日の睡眠</p>
            <h2>{targetSleepDayKey}</h2>
            <p>
              最終取り込み: <strong>{formatDateTime(importedAt)}</strong>
            </p>
            <CompactSyncStatus status={syncStatus} />
          </div>
          <div className="today-total">
            <span>総睡眠時間</span>
            <strong>今日のデータなし</strong>
          </div>
        </div>
        <article className="morning-action">
          <span>今日のデータ</span>
          <h2>対象の睡眠日データがありません</h2>
          <p>
            18:00から翌18:00までを1つの睡眠日として見ています。対象の睡眠日
            {targetSleepDayKey}
            のデータが取り込まれていないため、古い睡眠日は今日の睡眠として表示しません。
          </p>
        </article>
      </section>
    )
  }

  const primaryAction = actions[0]
  const focusPoints = buildTodayFocusPoints(summary, metrics)
  const sevenDayTrend = getTrendComparison(summaries, summary, 7)
  const thirtyDayTrend = getTrendComparison(summaries, summary, 30)
  const visibleActions = actions.slice(0, 3)

  return (
    <section className="today-screen">
      <div className="today-hero">
        <div className="today-hero-main">
          <p className="eyebrow">今日の睡眠</p>
          <h2>{summary.sleepDayKey}</h2>
          <p>
            最終取り込み: <strong>{formatDateTime(importedAt)}</strong>
          </p>
          <CompactSyncStatus status={syncStatus} />
          <div className="today-hero-facts" aria-label="今日の睡眠の要点">
            <MiniFact label="睡眠回数" value={`${summary.blockCount}回`} />
            <MiniFact label="最終起床" value={metrics.finalWakeTime} />
            <MiniFact label="中央時刻" value={metrics.sleepMidpoint} />
          </div>
        </div>
        <div className="today-total">
          <span>総睡眠時間</span>
          <strong>{formatMinutes(summary.totalSleepMinutes)}</strong>
        </div>
      </div>

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

      <SleepTimeline24h summary={summary} />

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

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="mini-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function SleepTimeline24h({
  embedded = false,
  summary,
}: {
  embedded?: boolean
  summary: SleepDaySummary
}) {
  const segments = getSleepTimelineSegments(summary)
  const hasBlocks = segments.length > 0

  return (
    <section className={`${embedded ? 'embedded-timeline' : 'today-actions-panel'} sleep-day-timeline`}>
      <div className="section-head-row">
        <h2>24時間睡眠タイムライン</h2>
        <span className="timeline-window">18:00 - 翌18:00</span>
      </div>
      <div className="timeline-scale" aria-hidden="true">
        <span>18:00</span>
        <span>0:00</span>
        <span>6:00</span>
        <span>12:00</span>
        <span>18:00</span>
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
            title={`${segment.label} ${segment.timeRange} ${segment.duration}`}
          />
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
      {hasBlocks && <div className="timeline-summary-list">
        {segments.map((segment) => (
          <div key={`${segment.id}-summary`}>
            <span>{segment.label}</span>
            <strong>{segment.timeRange}</strong>
            <small>{segment.duration}</small>
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

function SleepTimeline({ summaries }: { summaries: SleepDaySummary[] }) {
  return (
    <section className="stack">
      {summaries.map((summary) => (
        <Panel key={summary.sleepDayKey} title={`${summary.sleepDayKey} の睡眠`}>
          <SleepTimeline24h embedded summary={summary} />
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
        </Panel>
      ))}
    </section>
  )
}

function FragmentationDetail({ summaries }: { summaries: SleepDaySummary[] }) {
  return (
    <section className="stack">
      {summaries.map((summary) => (
        <Panel key={summary.sleepDayKey} title={`${summary.sleepDayKey} の分割睡眠`}>
          <div className="detail-head">
            <ScoreGauge title="分割睡眠スコア" score={summary.fragmentation.score} />
            <div>
              <p className="detail-label">{summary.fragmentation.label}</p>
              <ul className="plain-list compact">
                {summary.fragmentation.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          </div>
          <SleepRelationDiagram summary={summary} />
          <div className="block-list">
            {summary.classifiedBlocks.map((block) => (
              <div className="block-row" key={block.id}>
                <span>{formatTimeRange(block)}</span>
                <strong>{formatMinutes(block.durationMinutes)}</strong>
                <span>{block.labels.map(toBlockLabel).join(' / ')}</span>
              </div>
            ))}
          </div>
        </Panel>
      ))}
    </section>
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
  return (
    <section className="action-list">
      {actions.map((action) => (
        <article className="action-item" key={action.id}>
          <span className={`priority ${action.priority}`}>{toPriorityLabel(action.priority)}</span>
          <h2>{action.title}</h2>
          <p>{action.description}</p>
          <small>{action.basis}</small>
        </article>
      ))}
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
      <FirebaseUserPanel
        authAvailable={firebaseAuthAvailable}
        user={firebaseUser}
      />

      <Panel title="変更できる項目">
        <p className="settings-copy">
          ここで変更した値はこの端末のブラウザに保存されます。変更すると、今日の睡眠・タイムライン・改善アクションを同じ設定で再計算します。
        </p>
        <div className="settings-grid">
          <NumberSetting
            description="睡眠を何時で区切って1日分として見るかです。初期値は18:00なので、18:00から翌18:00までを1つの睡眠日として扱います。"
            label="睡眠日の区切り"
            max={23}
            min={0}
            suffix="時"
            value={config.sleepDayBoundaryHour}
            onChange={(value) => updateNumber('sleepDayBoundaryHour', value, 0, 23)}
          />
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
      await signInWithPopup(FIREBASE_AUTH, new GoogleAuthProvider())
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
      await signOut(FIREBASE_AUTH)
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
  const [expandedSourceKey, setExpandedSourceKey] = useState<string | null>(null)

  const updateUse = (sourceKey: string, use: SourceUseSetting) => {
    onChange(upsertSourcePreference(preferences, sourceKey, { use }))
  }

  const updatePriority = (sourceKey: string, priority: number) => {
    onChange(upsertSourcePreference(preferences, sourceKey, { priority }))
  }

  const resetOne = (sourceKey: string) => {
    onChange(removeSourcePreference(preferences, sourceKey))
  }

  return (
    <section className="settings-screen">
      <Panel title="睡眠ソース設定">
        <p className="settings-copy">
          自動判定を目安にしつつ、どのソースを優先するか調整できます。変更すると統合タイムライン、分割睡眠、昼夜逆転の目安を再計算します。
        </p>
        <div className="source-settings-list">
          {details.map((detail) => {
            const isExpanded = expandedSourceKey === detail.sourceKey
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
                      <option value="primary">主データ</option>
                      <option value="secondary">補助</option>
                      <option value="fallback">補助データ</option>
                      <option value="ignored">除外</option>
                    </select>
                  </label>
                  <label>
                    <span>優先順位</span>
                    <input
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
                    onClick={() =>
                      setExpandedSourceKey(isExpanded ? null : detail.sourceKey)
                    }
                    type="button"
                  >
                    {isExpanded ? '詳細を閉じる' : '詳細を見る'}
                  </button>
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

                {isExpanded && (
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
                )}
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
          <li>primaryが複数ある場合は優先順位の小さいソースを先に見ます。</li>
          <li>ignoredにしたソースは統合タイムラインと主要指標から除外します。</li>
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
      <HealthAutoExportImportPanel onImported={onHealthAutoExportImported} />

      <div className="screen-grid">
      <Panel title="ファイル読み込み">
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
        <ul className="plain-list import-format-list">
          <li>推奨: normalized-sleep-records.json</li>
          <li>対応: Health Auto Export JSON</li>
          <li>対応: AppleヘルスXML</li>
        </ul>
      </Panel>
      </div>
    </section>
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
      displayName: quality.displayName,
      effectiveUse,
      priority,
      statusLabel: toSourceStatusLabel(effectiveUse, quality.warnings.length > 0),
      description: describeSourceSetting(quality, effectiveUse),
      quality,
      sourceApp: first?.sourceApp,
      sourceName: first?.sourceName,
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
      isUnknownSource: quality.sourceKey.startsWith('unknown_source'),
      logs: unifiedTimeline.logs
        .filter((log) => log.sourceKeys.includes(quality.sourceKey))
        .map((log) => log.message),
    }
  })
}

function describeSourceSetting(
  quality: SourceQualityReport,
  effectiveUse: SourceUseSetting,
): string {
  if (effectiveUse === 'ignored') {
    return 'このソースはユーザー設定で除外されています。主要指標には使いません。'
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

function toSourceStatusLabel(use: SourceUseSetting, hasWarnings: boolean): string {
  if (use === 'ignored') return '除外'
  if (hasWarnings) return '注意あり'
  if (use === 'fallback') return '補助'
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

function getSleepTimelineSegments(summary: SleepDaySummary): TimelineSegment[] {
  const boundaryStart = parseSleepDayBoundaryStart(summary.sleepDayKey)
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

      return {
        id: block.id,
        duration: formatMinutes(block.durationMinutes),
        label: block.labels.map(toBlockLabel).join(' / ') || '睡眠',
        left,
        timeRange: `${formatClock(new Date(start))} - ${formatClock(new Date(end))}`,
        tone,
        width,
      }
    })
    .filter((segment): segment is TimelineSegment => segment !== null)
}

function parseSleepDayBoundaryStart(sleepDayKey: string): Date {
  const [year, month, day] = sleepDayKey.split('-').map(Number)

  if (!year || !month || !day) {
    return new Date()
  }

  return new Date(year, month - 1, day, 18, 0, 0, 0)
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
