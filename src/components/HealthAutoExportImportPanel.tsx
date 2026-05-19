import { useMemo, useState, type ChangeEvent } from 'react'
import type { HealthAutoExportImportResult } from '../lib/importers/importTypes'
import { importHealthAutoExportJson } from '../lib/importers/importHealthAutoExportJson'

type HealthAutoExportImportPanelProps = {
  onImported: (result: HealthAutoExportImportResult) => void
}

const stageLabels: Record<string, string> = {
  awake: 'Awake',
  in_bed: 'In Bed',
  asleep: 'Asleep',
  asleep_core: 'Core',
  asleep_rem: 'REM',
  asleep_deep: 'Deep',
  asleep_unspecified: 'Unspecified',
}

export function HealthAutoExportImportPanel({ onImported }: HealthAutoExportImportPanelProps) {
  const [result, setResult] = useState<HealthAutoExportImportResult | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const downloadUrl = useMemo(() => {
    if (!result) {
      return ''
    }

    const blob = new Blob([JSON.stringify(result.normalizedFile, null, 2)], {
      type: 'application/json',
    })

    return URL.createObjectURL(blob)
  }, [result])

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    setIsLoading(true)
    setErrorMessage('')

    try {
      const text = await file.text()
      const importResult = await importHealthAutoExportJson(file.name, text)
      setResult(importResult)

      if (importResult.importStats.normalizedCount > 0) {
        onImported(importResult)
      }
    } catch (error) {
      setResult(null)
      setErrorMessage(error instanceof Error ? error.message : '読み込みに失敗しました。')
    } finally {
      setIsLoading(false)
      event.target.value = ''
    }
  }

  return (
    <section className="hae-import-panel">
      <div className="panel">
        <h2>Health Auto Export JSONを読み込む</h2>
        <p className="settings-copy">
          任意のJSONファイルを選択してください。アプリ内で監査して、使える睡眠データだけを正規化します。JSON原文は保存しません。
        </p>
        <label className="file-drop">
          <span>JSONファイルを選択</span>
          <input accept="application/json,.json" onChange={handleFileChange} type="file" />
        </label>
        {isLoading && <p className="file-status">監査と正規化を実行中です。</p>}
        {errorMessage && <p className="import-error">{errorMessage}</p>}
      </div>

      {result && (
        <>
          <div className="panel">
            <h2>監査結果</h2>
            <div className={`quality-banner ${toQualityClass(result.audit.status)}`}>
              <span>自動判定</span>
              <strong>{result.audit.statusLabel}</strong>
            </div>
            <div className="diagnosis-list import-summary">
              <Status label="変換できた件数" value={`${result.importStats.normalizedCount}件`} />
              <Status label="新規追加件数" value={`${result.importStats.newRecordCount}件`} />
              <Status label="重複としてスキップ" value={`${result.importStats.duplicateSkippedCount}件`} />
              <Status label="保存済み合計" value={`${result.importStats.totalSavedRecordCount}件`} />
              <Status label="読み取れなかったデータ" value={`${result.audit.rejectedRows}件`} />
              <Status label="データ期間" value={result.audit.dateRangeLabel} />
              <Status
                label="分割睡眠の検出"
                value={result.audit.hasMultipleSegmentsInOneDay ? '検出できます' : '未検出'}
              />
              {result.audit.sourceSummaries.length > 0 && (
                <Status
                  label="検出したソース"
                  value={result.audit.sourceSummaries
                    .map((source) => `${source.sourceLabel} ${source.count}件`)
                    .join(' / ')}
                />
              )}
            </div>
          </div>

          <div className="panel">
            <h2>注意点</h2>
            <ul className="quality-list">
              {result.audit.messages.map((message) => (
                <li className={message.severity} key={message.id}>
                  {message.message}
                </li>
              ))}
            </ul>
          </div>

          <div className="panel">
            <h2>睡眠ステージ一覧</h2>
            <div className="stage-grid">
              {Object.entries(result.audit.stageCounts).map(([stage, count]) => (
                <div className="stage-pill" key={stage}>
                  <span>{stageLabels[stage] ?? stage}</span>
                  <strong>{count}件</strong>
                </div>
              ))}
            </div>
            {downloadUrl && (
              <a
                className="download-button"
                download="normalized-sleep-records.json"
                href={downloadUrl}
              >
                normalized-sleep-records.jsonをダウンロード
              </a>
            )}
          </div>

          <div className="panel">
            <h2>読み込み履歴</h2>
            <div className="history-list">
              {result.importHistory.map((entry) => (
                <article className="history-item" key={`${entry.fileName}-${entry.importedAt}`}>
                  <strong>{entry.fileName}</strong>
                  <span>{formatDateTime(entry.importedAt)}</span>
                  <small>
                    新規 {entry.newRecordCount}件 / 重複 {entry.duplicateSkippedCount}件
                  </small>
                </article>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function toQualityClass(status: HealthAutoExportImportResult['audit']['status']): string {
  if (status === 'usable') {
    return 'good'
  }

  if (status === 'needs_settings') {
    return 'caution'
  }

  return 'insufficient'
}
