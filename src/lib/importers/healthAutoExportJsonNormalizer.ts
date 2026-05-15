import type { SleepRecord } from '../../types/sleep'
import type { RawHealthAutoExportRow } from './importTypes'
import { normalizeStage } from './healthAutoExportJsonAuditor'
import { resolveSleepSource } from '../source/resolveSleepSource'

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
    const deviceName = getString(row.deviceName)
    const sourceBundleId = getString(row.sourceBundleId)
    const sourceKind = getString(row.sourceKind)
    const source = resolveSleepSource({
      sourceApp: getString(row.sourceApp),
      sourceName,
      source: getString(row.source),
      sourceKind,
      deviceName,
      sourceBundleId,
      sourceFormat: 'health_auto_export_json',
      sourceFile,
    })
    const durationMinutes = Math.max(
      0,
      Math.round((endDate.getTime() - startDate.getTime()) / 60_000),
    )

    records.push({
      id:
        getString(row.id) ??
        getString(row.uuid) ??
        createId('health_auto_export_json', sourceFile, start, end, originalValue, source.sourceKey),
      value: stage,
      sourceFormat: 'health_auto_export_json',
      sourceFile,
      sourceKey: source.sourceKey,
      sourceApp: source.sourceApp,
      sourceLabel: source.sourceLabel,
      originalValue,
      start,
      end,
      stage,
      startDate: start,
      endDate: end,
      durationMinutes,
      hasStartDate: true,
      hasEndDate: true,
      hasSource: Boolean(sourceName ?? deviceName ?? sourceBundleId ?? sourceKind),
      source: sourceName,
      sourceName,
      deviceName,
      sourceBundleId,
      sourceKind: sourceKind ?? (sourceName ? 'present' : undefined),
    })
  })

  return {
    records,
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

function createId(
  sourceFormat: string,
  sourceFile: string,
  start: string,
  end: string,
  originalValue: string,
  sourceKey: string,
): string {
  const input = [sourceFormat, sourceFile, sourceKey, originalValue, start, end].join('|')
  let hash = 0x811c9dc5

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return `hae-${(hash >>> 0).toString(16).padStart(8, '0')}`
}
