export type SleepSourceInput = {
  sourceKey?: unknown
  sourceLabel?: unknown
  sourceApp?: unknown
  sourceName?: unknown
  source?: unknown
  sourceKind?: unknown
  deviceName?: unknown
  sourceBundleId?: unknown
  sourceFormat?: unknown
  sourceFile?: unknown
}

export type ResolvedSleepSource = {
  sourceKey: string
  sourceLabel: string
  sourceApp?: string
}

export const UNKNOWN_SOURCE_KEY = 'unknown_source'

export function resolveSleepSource(input: SleepSourceInput): ResolvedSleepSource {
  const explicitKey = getString(input.sourceKey)

  if (explicitKey) {
    const defaultHealthExportSource = resolveDefaultHealthExportSource(input)

    if (defaultHealthExportSource) {
      return defaultHealthExportSource
    }

    const sourceKey =
      normalizeExplicitSourceKey(explicitKey) === UNKNOWN_SOURCE_KEY
        ? buildUnknownSourceKey(input)
        : normalizeExplicitSourceKey(explicitKey)
    const values = [
      explicitKey,
      getString(input.sourceLabel),
      getString(input.sourceApp),
      getString(input.sourceName),
      getString(input.source),
      getString(input.deviceName),
      getString(input.sourceBundleId),
      getString(input.sourceKind),
    ].filter((value): value is string => Boolean(value))
    const known = resolveKnownSource(values)
    const sourceLabel =
      sourceKey.startsWith(UNKNOWN_SOURCE_KEY)
        ? '不明なソース'
        : known?.sourceLabel ?? getString(input.sourceLabel) ?? explicitKey

    return {
      sourceKey,
      sourceLabel,
      sourceApp: sourceKey.startsWith(UNKNOWN_SOURCE_KEY) ? undefined : sourceLabel,
    }
  }

  const values = [
    getString(input.sourceApp),
    getString(input.sourceName),
    getString(input.source),
    getString(input.deviceName),
    getString(input.sourceBundleId),
    getString(input.sourceKind),
  ].filter((value): value is string => Boolean(value))

  if (values.length === 0) {
    const defaultHealthExportSource = resolveDefaultHealthExportSource(input)

    if (defaultHealthExportSource) {
      return defaultHealthExportSource
    }

    return {
      sourceKey: buildUnknownSourceKey(input),
      sourceLabel: '不明なソース',
    }
  }

  const known = resolveKnownSource(values)
  const sourceLabel = known?.sourceLabel ?? values[0]
  const sourceKey = known?.sourceKey ?? toSourceKey(sourceLabel)

  return {
    sourceKey,
    sourceLabel,
    sourceApp: sourceLabel,
  }
}

function buildUnknownSourceKey(input: SleepSourceInput): string {
  const sourceFormat = getString(input.sourceFormat)
  const sourceFile = getString(input.sourceFile)
  const parts = [UNKNOWN_SOURCE_KEY]

  if (sourceFormat) {
    parts.push(toSourceKey(sourceFormat))
  }

  if (sourceFile) {
    parts.push(toSourceKey(sourceFile))
  }

  return parts.join(':')
}

function resolveDefaultHealthExportSource(input: SleepSourceInput): ResolvedSleepSource | null {
  const explicitKey = getString(input.sourceKey)
  const sourceFormat = getString(input.sourceFormat)
  const sourceFile = getString(input.sourceFile)

  if (
    sourceFormat !== 'health_auto_export_json' ||
    sourceFile ||
    (explicitKey && !normalizeExplicitSourceKey(explicitKey).startsWith(UNKNOWN_SOURCE_KEY))
  ) {
    return null
  }

  return {
    sourceKey: 'withings',
    sourceLabel: 'Withings',
    sourceApp: 'Withings',
  }
}

export function toSourceKey(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize('NFKC')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return normalized || `source_${hashString(value)}`
}

function normalizeExplicitSourceKey(value: string): string {
  return value
    .split(':')
    .map(toSourceKey)
    .filter(Boolean)
    .join(':') || UNKNOWN_SOURCE_KEY
}

function resolveKnownSource(values: string[]): Pick<ResolvedSleepSource, 'sourceKey' | 'sourceLabel'> | null {
  const text = values.join(' ').toLowerCase()

  if (text.includes('withings')) {
    return { sourceKey: 'withings', sourceLabel: 'Withings' }
  }

  if (text.includes('apple watch') || /\bwatch\b/.test(text)) {
    return { sourceKey: 'apple_watch', sourceLabel: 'Apple Watch' }
  }

  if (text.includes('iphone') || text.includes('i phone')) {
    return { sourceKey: 'iphone', sourceLabel: 'iPhone' }
  }

  if (text.includes('manual') || text.includes('hand input') || text.includes('手入力')) {
    return { sourceKey: 'manual', sourceLabel: '手入力' }
  }

  if (text.includes('com.apple.health') || text.includes('apple health')) {
    return { sourceKey: 'apple_health', sourceLabel: 'Apple Health' }
  }

  return null
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function hashString(value: string): string {
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}
