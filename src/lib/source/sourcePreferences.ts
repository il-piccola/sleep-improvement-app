import type {
  SleepSourcePreference,
  SleepSourcePreferenceMap,
  SourceRecommendedUse,
  SourceUseSetting,
} from '../../types/sleep'

export const SOURCE_PREFERENCES_STORAGE_KEY = 'sleep-improvement.source-preferences'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function toSourceUseSetting(recommendedUse: SourceRecommendedUse): SourceUseSetting {
  return recommendedUse === 'ignore' ? 'ignored' : recommendedUse
}

export function upsertSourcePreference(
  preferences: SleepSourcePreferenceMap,
  sourceKey: string,
  update: Partial<Omit<SleepSourcePreference, 'sourceKey'>>,
): SleepSourcePreferenceMap {
  const current = preferences[sourceKey] ?? {
    sourceKey,
    use: 'secondary',
    priority: Object.keys(preferences).length + 1,
  }

  return {
    ...preferences,
    [sourceKey]: {
      ...current,
      ...update,
      sourceKey,
      priority: Math.max(1, Math.round(update.priority ?? current.priority)),
    },
  }
}

export function removeSourcePreference(
  preferences: SleepSourcePreferenceMap,
  sourceKey: string,
): SleepSourcePreferenceMap {
  const next = { ...preferences }
  delete next[sourceKey]
  return next
}

export function loadStoredSourcePreferences(
  storage: StorageLike | undefined = getBrowserStorage(),
): SleepSourcePreferenceMap {
  if (!storage) {
    return {}
  }

  try {
    const stored = storage.getItem(SOURCE_PREFERENCES_STORAGE_KEY)
    if (!stored) {
      return {}
    }

    return normalizeSourcePreferences(JSON.parse(stored))
  } catch {
    return {}
  }
}

export function saveStoredSourcePreferences(
  preferences: SleepSourcePreferenceMap,
  storage: StorageLike | undefined = getBrowserStorage(),
): void {
  if (!storage) {
    return
  }

  storage.setItem(SOURCE_PREFERENCES_STORAGE_KEY, JSON.stringify(normalizeSourcePreferences(preferences)))
}

export function resetStoredSourcePreferences(
  storage: StorageLike | undefined = getBrowserStorage(),
): void {
  storage?.removeItem(SOURCE_PREFERENCES_STORAGE_KEY)
}

function normalizeSourcePreferences(value: unknown): SleepSourcePreferenceMap {
  if (!value || typeof value !== 'object') {
    return {}
  }

  const result: SleepSourcePreferenceMap = {}

  for (const [sourceKey, preference] of Object.entries(value)) {
    if (!preference || typeof preference !== 'object') {
      continue
    }

    const partial = preference as Partial<SleepSourcePreference>
    if (!isSourceUseSetting(partial.use)) {
      continue
    }

    result[sourceKey] = {
      sourceKey,
      use: partial.use,
      priority: Math.max(1, Math.round(Number(partial.priority) || 1)),
    }
  }

  return result
}

function isSourceUseSetting(value: unknown): value is SourceUseSetting {
  return value === 'primary' || value === 'secondary' || value === 'fallback' || value === 'ignored'
}

function getBrowserStorage(): StorageLike | undefined {
  if (typeof localStorage === 'undefined') {
    return undefined
  }

  return localStorage
}
