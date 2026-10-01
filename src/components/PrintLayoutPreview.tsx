import type { AnalysisConfig, SleepDaySummary } from '../types/sleep'
import { formatPrintMinutes, formatPrintStageSummary, getPrintTimeline, getPrintTimelineScaleLabels, toPrintBlockLabel, type PrintMode, type PrintReportKind } from '../lib/print/sleepPrint'

export function PrintLayoutPreview({ kind, mode, onModeChange, onBack, config, summaries, month, timelineView, outputAt }: {
  kind: PrintReportKind; mode: PrintMode; onModeChange: (mode: PrintMode) => void; onBack: () => void
  config: AnalysisConfig; summaries: SleepDaySummary[]; month: string; timelineView: 'unified' | 'raw'; outputAt: string
}) {
  return <main className="print-preview-screen">
    <div className="print-preview-controls no-print"><button onClick={onBack} type="button">戻る</button><h1>印刷用レイアウト</h1><div className="print-mode-toggle"><button className={mode === 'compact' ? 'selected' : ''} onClick={() => onModeChange('compact')} type="button">コンパクト版</button><button className={mode === 'full' ? 'selected' : ''} onClick={() => onModeChange('full')} type="button">完全版</button></div><button className="primary-button" onClick={() => window.print()} type="button">印刷する</button></div>
    <section className="print-report">
      <header className="print-report-header"><div><p className="eyebrow">Sleep Compass</p><h1>{kind === 'timeline' ? '睡眠の記録（時間）' : '睡眠の記録（分割）'}</h1></div><dl><div><dt>対象月</dt><dd>{month}</dd></div><div><dt>データ</dt><dd>{timelineView === 'unified' ? '統合後' : '統合前'}</dd></div><div><dt>睡眠日区切り</dt><dd>{config.sleepDayBoundaryHour}:00</dd></div><div><dt>出力日時</dt><dd>{new Date(outputAt).toLocaleString('ja-JP')}</dd></div></dl><p className="print-disclaimer">非診断・セルフモニタリング用</p></header>
      {summaries.length === 0 ? <p className="print-empty">{month}の睡眠データはありません。</p> : summaries.map((summary) => <PrintDay key={summary.sleepDayKey} summary={summary} kind={kind} mode={mode} boundaryHour={config.sleepDayBoundaryHour} />)}
    </section>
  </main>
}

function PrintDay({ summary, kind, mode, boundaryHour }: { summary: SleepDaySummary; kind: PrintReportKind; mode: PrintMode; boundaryHour: number }) {
  const timeline = getPrintTimeline(summary, boundaryHour)
  const scaleLabels = getPrintTimelineScaleLabels(boundaryHour)
  const main = summary.classifiedBlocks.find((block) => block.labels.includes('main'))
  return <article className="print-day-card">
    <div className="print-day-title"><h2>{summary.sleepDayKey}</h2><span>{summary.blockCount}回</span></div>
    <div className="print-metrics"><span>総睡眠 <b>{formatPrintMinutes(summary.totalSleepMinutes)}</b></span><span>主睡眠候補 <b>{main ? formatPrintMinutes(main.durationMinutes) : 'なし'}</b></span>{kind === 'fragmentation' && <span>分割スコア <b>{summary.fragmentation.score}</b></span>}</div>
    <div className="print-timeline"><div className="print-timeline-scale">{scaleLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div><div className="print-timeline-track">{timeline.map(({ block, left, width, stages }) => <div key={block.id} className="print-timeline-block" style={{ left: `${left}%`, width: `${width}%` }} aria-label={`${block.labels.map(toPrintBlockLabel).join(' / ')} ${formatPrintTime(block.startDate)} - ${formatPrintTime(block.endDate)}`}><div className="print-stage-strip">{stages.map((stage, index) => <i key={`${block.id}-${index}`} className={`print-stage-${stage.stage}`} style={{ left: `${stage.left}%`, width: `${stage.width}%` }} title={stage.stage} />)}</div></div>)}</div><ul className="print-timeline-labels">{timeline.map(({ block }) => <li key={`label-${block.id}`}><strong>{block.labels.map(toPrintBlockLabel).join(' / ')}</strong><span>{formatPrintTime(block.startDate)} - {formatPrintTime(block.endDate)}</span></li>)}</ul></div>
    <p className="print-legend">主睡眠・仮眠・夕方睡眠・その他 | レム・コア・深い睡眠・睡眠（ステージ未取得は表記）</p>
    {kind === 'fragmentation' && <div className="print-relation"><strong>主睡眠候補</strong><span>→</span><span>{summary.classifiedBlocks.filter((b) => b.id !== main?.id).map((b) => b.labels.includes('napCandidate') ? '仮眠' : b.labels.includes('eveningSleep') ? '夕方睡眠' : '追加睡眠').join('、') || '追加の睡眠なし'}</span><p>{summary.fragmentation.reasons.join(' / ')}</p></div>}
    {mode === 'full' && <table className="print-block-table"><thead><tr><th>開始-終了</th><th>時間</th><th>分類</th><th>ステージ内訳</th></tr></thead><tbody>{summary.classifiedBlocks.map((block) => <tr key={block.id}><td>{block.startDate ? new Date(block.startDate).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '時刻不明'} - {block.endDate ? new Date(block.endDate).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '時刻不明'}</td><td>{formatPrintMinutes(block.durationMinutes)}</td><td>{block.labels.map(toPrintBlockLabel).join(' / ')}</td><td>{formatPrintStageSummary(block)}</td></tr>)}</tbody></table>}
  </article>
}

function formatPrintTime(value: string | null) {
  return value ? new Date(value).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '時刻不明'
}
