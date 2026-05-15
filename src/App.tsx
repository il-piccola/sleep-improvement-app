import { useEffect, useMemo, useState } from 'react'
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
import { normalizeSleepFile } from './lib/import/normalizeSleepFile'
import {
  type DataQualityReport,
  defaultAnalysisConfig,
  type AnalysisConfig,
  type ClassifiedSleepBlock,
  type ImprovementAction,
  type ImprovementPace,
  type SleepDaySummary,
  type SleepRecord,
} from './types/sleep'

type AppScreen =
  | 'diagnosis'
  | 'dashboard'
  | 'timeline'
  | 'fragmentation'
  | 'actions'
  | 'settings'
  | 'import'

type SleepDataFile = {
  generatedAt?: string
  sourceKind?: string
  inputFileName?: string
  note?: string
  records: SleepRecord[]
  warnings: string[]
}

type DayMetrics = {
  mainSleep: ClassifiedSleepBlock | null
  napBlocks: ClassifiedSleepBlock[]
  supportBlocks: ClassifiedSleepBlock[]
  eveningBlocks: ClassifiedSleepBlock[]
  finalWakeTime: string
  sleepMidpoint: string
}

const screens: Array<{ id: AppScreen; label: string }> = [
  { id: 'dashboard', label: '今日の睡眠' },
  { id: 'diagnosis', label: 'データ診断' },
  { id: 'timeline', label: 'タイムライン' },
  { id: 'fragmentation', label: '分割睡眠' },
  { id: 'actions', label: '改善アクション' },
  { id: 'settings', label: '設定' },
  { id: 'import', label: '読み込み' },
]

const SETTINGS_STORAGE_KEY = 'sleep-improvement.analysis-config'

function App() {
  const [activeScreen, setActiveScreen] = useState<AppScreen>('dashboard')
  const [sleepData, setSleepData] = useState<SleepDataFile>({
    ...sampleSleepData,
    warnings: [],
  })
  const [config, setConfig] = useState<AnalysisConfig>(loadStoredConfig)
  const [fileStatus, setFileStatus] = useState('匿名サンプルを使用中')

  const analysis = useMemo(() => {
    const blocks = buildSleepBlocks(sleepData.records, config)
    const groups = groupBySleepDay(blocks, config)
    const summaries = groups.map((group) => summarizeSleepDay(group, config))
    const actions = generateImprovementActions(summaries, config)
    const dataQuality = checkDataQuality(sleepData.records)
    const latestSummary = summaries.at(-1) ?? null
    const latestMetrics = latestSummary ? getDayMetrics(latestSummary) : null

    return {
      blocks,
      groups,
      summaries,
      actions,
      dataQuality,
      latestSummary,
      latestMetrics,
    }
  }, [config, sleepData])

  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(config))
  }, [config])

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
        <div className="import-stamp">
          <span>最終取り込み</span>
          <strong>{formatDateTime(sleepData.generatedAt)}</strong>
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
            {screen.label}
          </button>
        ))}
      </nav>

      {activeScreen === 'diagnosis' && (
        <DataDiagnosis
          fileStatus={fileStatus}
          inputFileName={sleepData.inputFileName}
          recordCount={sleepData.records.length}
          report={analysis.dataQuality}
          sourceKind={sleepData.sourceKind}
          summaries={analysis.summaries}
          warnings={sleepData.warnings}
        />
      )}

      {activeScreen === 'dashboard' && (
        <TodaySleep
          actions={analysis.actions}
          importedAt={sleepData.generatedAt}
          metrics={analysis.latestMetrics}
          summary={analysis.latestSummary}
        />
      )}

      {activeScreen === 'timeline' && <SleepTimeline summaries={analysis.summaries} />}

      {activeScreen === 'fragmentation' && (
        <FragmentationDetail summaries={analysis.summaries} />
      )}

      {activeScreen === 'actions' && <TodayActions actions={analysis.actions} />}

      {activeScreen === 'settings' && (
        <Settings
          config={config}
          onChange={setConfig}
          onReset={() => {
            setConfig(defaultAnalysisConfig)
            localStorage.removeItem(SETTINGS_STORAGE_KEY)
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

function DataDiagnosis({
  fileStatus,
  inputFileName,
  recordCount,
  report,
  sourceKind,
  summaries,
  warnings,
}: {
  fileStatus: string
  inputFileName?: string
  recordCount: number
  report: DataQualityReport
  sourceKind?: string
  summaries: SleepDaySummary[]
  warnings: string[]
}) {
  const blockCount = summaries.reduce((sum, summary) => sum + summary.blockCount, 0)
  const actualTimeBlocks = summaries.flatMap((summary) =>
    summary.classifiedBlocks.filter((block) => block.timeConfidence === 'actual'),
  ).length
  const notes = summaries.flatMap((summary) => summary.notes)

  return (
    <section className="screen-grid">
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
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </Panel>
    </section>
  )
}

function TodaySleep({
  actions,
  importedAt,
  metrics,
  summary,
}: {
  actions: ImprovementAction[]
  importedAt?: string
  metrics: DayMetrics | null
  summary: SleepDaySummary | null
}) {
  if (!summary || !metrics) {
    return <EmptyState title="表示できる睡眠データがありません" />
  }

  const primaryAction = actions[0]

  return (
    <section className="today-screen">
      <div className="today-hero">
        <div>
          <p className="eyebrow">今日の睡眠</p>
          <h2>{summary.sleepDayKey}</h2>
          <p>
            最終取り込み: <strong>{formatDateTime(importedAt)}</strong>
          </p>
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

      <div className="score-band">
        <ScoreGauge title="分割睡眠スコア" score={summary.fragmentation.score} />
        <ScoreGauge title="昼夜逆転スコア" score={summary.circadian.score} />
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
        <h2>今日の改善アクション</h2>
        <div className="today-action-list">
          {actions.map((action) => (
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

function SleepTimeline({ summaries }: { summaries: SleepDaySummary[] }) {
  return (
    <section className="stack">
      {summaries.map((summary) => (
        <Panel key={summary.sleepDayKey} title={`${summary.sleepDayKey} の睡眠`}>
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
  onChange,
  onReset,
}: {
  config: AnalysisConfig
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

function EmptyState({ title }: { title: string }) {
  return (
    <section className="empty-state">
      <h2>{title}</h2>
      <p>ファイル読み込み画面から匿名サンプルまたはJSONを読み込んでください。</p>
    </section>
  )
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

function formatTimeRange(block: ClassifiedSleepBlock): string {
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

export default App
