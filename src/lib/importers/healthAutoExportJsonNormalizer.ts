import type { SleepRecord } from '../../types/sleep'
import type { RawHealthAutoExportRow } from './importTypes'
import { normalizeStage } from './healthAutoExportJsonAuditor'

const OVERLAP_THRESHOLD = 0.8

export function normalizeHealthAutoExportSleepRows(
  rows: RawHealthAutoExportRow[],
  sourceFile: string,
): { records: SleepRecord[]; rejectedCount: number } {
  const records: SleepRecord[] = []
  let rejectedCount = 0

  rows.forEach((row) => {
    const start = normalizeDate(getString(row.startDate))
    const end = normalizeDate(getString(row.endDate))
    const originalValue = getString(row.value)
    const stage = normalizeStage(originalValue)

    if (!start || !end || !originalValue || !stage) {
      rejectedCount += 1
      return
    }

    const startDate = parseDate(start)
    const endDate = parseDate(end)

    if (!startDate || !endDate) {
      rejectedCount += 1
      return
    }

    const sourceName = getString(row.sourceName) ?? getString(row.source)
    const sourceApp = sourceName && /withings/i.test(sourceName) ? 'Withings' : undefined
    const durationMinutes = Math.max(
      0,
      Math.round((endDate.getTime() - startDate.getTime()) / 60_000),
    )

    records.push({
      id:
        getString(row.id) ??
        getString(row.uuid) ??
        createId('health_auto_export_json', sourceFile, start, end, originalValue, sourceName),
      value: stage,
      sourceFormat: 'health_auto_export_json',
      sourceFile,
      sourceApp,
      originalValue,
      start,
      end,
      stage,
      startDate: start,
      endDate: end,
      durationMinutes,
      hasStartDate: true,
      hasEndDate: true,
      hasSource: Boolean(sourceName),
      source: sourceName,
      sourceName,
      sourceKind: sourceName ? 'present' : undefined,
    })
  })

  return {
    records: dedupeRecords(records),
    rejectedCount,
  }
}

function normalizeDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const raw = value.trim()
  const appleMatch = raw.match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?\s*([+-]\d{2})(\d{2})$/,
  )

  if (appleMatch) {
    return `${appleMatch[1]}T${appleMatch[2]}${appleMatch[3]}:${appleMatch[4]}`
  }

  const isoOffsetMatch = raw.match(/^(.+)([+-]\d{2})(\d{2})$/)

  if (isoOffsetMatch && raw.includes('T')) {
    return `${isoOffsetMatch[1]}${isoOffsetMatch[2]}:${isoOffsetMatch[3]}`
  }

  if (/^\d{4}-\d{2}-\d{2} /.test(raw)) {
    return raw.replace(' ', 'T')
  }

  return raw
}

function parseDate(value: string | undefined): Date | null {
  if (!value) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function sourcePriority(sourceApp: string | undefined): number {
  const source = String(sourceApp ?? '').toLowerCase()

  if (source.includes('withings')) return 100
  if (source.includes('apple watch')) return 90
  if (source.includes('iphone')) return 80
  if (source.includes('zepp')) return 70
  if (source.includes('mi fitness')) return 60
  if (source.includes('vitalbook')) return 50
  if (source.includes('熟睡')) return 40
  return 10
}

function stageSpecificity(stage: SleepRecord['stage']): number {
  if (stage === 'asleep_core' || stage === 'asleep_deep' || stage === 'asleep_rem') return 100
  if (stage === 'awake') return 90
  if (stage === 'asleep') return 70
  if (stage === 'asleep_unspecified') return 60
  if (stage === 'in_bed') return 20
  return 0
}

function qualityScore(record: SleepRecord): number {
  return sourcePriority(record.sourceApp) + stageSpecificity(record.stage)
}

function overlapRatio(candidate: SleepRecord, accepted: SleepRecord): number {
  const candidateStart = Date.parse(candidate.start ?? '')
  const candidateEnd = Date.parse(candidate.end ?? '')
  const acceptedStart = Date.parse(accepted.start ?? '')
  const acceptedEnd = Date.parse(accepted.end ?? '')

  if (
    !Number.isFinite(candidateStart) ||
    !Number.isFinite(candidateEnd) ||
    !Number.isFinite(acceptedStart) ||
    !Number.isFinite(acceptedEnd)
  ) {
    return 0
  }

  const overlap = Math.max(
    0,
    Math.min(candidateEnd, acceptedEnd) - Math.max(candidateStart, acceptedStart),
  )
  const candidateDuration = candidateEnd - candidateStart
  return candidateDuration > 0 ? overlap / candidateDuration : 0
}

function dedupeRecords(records: SleepRecord[]): SleepRecord[] {
  const ordered = [...records].sort((left, right) => {
    const qualityDiff = qualityScore(right) - qualityScore(left)

    if (qualityDiff !== 0) {
      return qualityDiff
    }

    return Date.parse(left.start ?? '') - Date.parse(right.start ?? '')
  })
  const accepted: SleepRecord[] = []
  const seen = new Set<string>()

  for (const record of ordered) {
    const exactKey = [record.sourceApp ?? '', record.stage ?? '', record.start ?? '', record.end ?? ''].join('|')

    if (seen.has(exactKey)) {
      continue
    }

    seen.add(exactKey)

    if (accepted.some((kept) => overlapRatio(record, kept) >= OVERLAP_THRESHOLD)) {
      continue
    }

    accepted.push(record)
  }

  return accepted.sort(
    (left, right) =>
      Date.parse(left.start ?? '') - Date.parse(right.start ?? '') ||
      Date.parse(left.end ?? '') - Date.parse(right.end ?? ''),
  )
}

function createId(
  sourceFormat: string,
  sourceFile: string,
  start: string,
  end: string,
  originalValue: string,
  sourceApp: string | undefined,
): string {
  const input = [sourceFormat, sourceFile, sourceApp ?? '', originalValue, start, end].join('|')
  let hash = 0x811c9dc5

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return `hae-${(hash >>> 0).toString(16).padStart(8, '0')}`
}
