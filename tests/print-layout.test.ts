import assert from 'node:assert/strict'
import { formatPrintStageSummary, getPrintTimeline, getPrintTimelineScaleLabels, selectPrintSummaries } from '../src/lib/print/sleepPrint'
import type { SleepDaySummary } from '../src/types/sleep'

const block = (id: string, start: string, end: string, stageSegments = []) => ({ id, sourceRecordIds: [], sourceKeys: [], sourceLabels: [], recordKinds: ['asleep'] as const, values: [], stageSegments, startDate: start, endDate: end, durationMinutes: 60, startMinutesFromMidnight: 0, endMinutesFromMidnight: 60, dayIndex: 0, timeConfidence: 'actual' as const, labels: ['main'] as const, isNapCandidate: false, isEveningSleep: false, notes: [] })
const summary = (key: string, blocks = [block('a', `${key}T22:00:00Z`, `${key}T23:00:00Z`)]) => ({ sleepDayKey: key, blockCount: blocks.length, totalSleepMinutes: 60, longestBlockMinutes: 60, napCandidateCount: 0, eveningSleepCount: 0, classifiedBlocks: blocks, fragmentation: { score: 20, level: 'low', label: 'まとまり', reasons: ['理由'], confidence: 'actual' }, circadian: { score: 20, level: 'low', label: '安定', reasons: [], confidence: 'actual' }, notes: [] }) as SleepDaySummary

assert.deepEqual(selectPrintSummaries([summary('2026-02-01'), summary('2026-01-31'), summary('2026-02-02')], '2026-02').map((s) => s.sleepDayKey), ['2026-02-02', '2026-02-01'])
assert.equal(getPrintTimeline(summary('2026-02-01'), 18).length, 1)
assert.deepEqual(getPrintTimelineScaleLabels(18), ['18:00', '00:00', '06:00', '12:00', '翌18:00'])
assert.equal(formatPrintStageSummary(summary('2026-02-01').classifiedBlocks[0]), 'ステージ未取得')
const staged = block('s', '2026-02-01T22:00:00Z', '2026-02-01T23:00:00Z', [{ stage: 'asleep_rem', start: '2026-02-01T22:00:00Z', end: '2026-02-01T22:30:00Z', durationMinutes: 30 }, { stage: 'asleep_deep', start: '2026-02-01T22:30:00Z', end: '2026-02-01T23:00:00Z', durationMinutes: 30 }])
assert.match(formatPrintStageSummary(staged), /レム/)
console.log('print-layout tests passed')
