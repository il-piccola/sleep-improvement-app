export const SLEEP_DAY_BOUNDARY_NOTICE =
  '睡眠日は18:00で区切っています。未明〜夕方の睡眠は前日の睡眠日として表示されます。'

export const SLEEP_DAY_FALLBACK_NOTICE =
  '現在の睡眠日はまだデータ待ちのため、最新の睡眠日を表示しています。'

export type SleepDayDisplayStatus = {
  boundaryNotice: string
  currentSleepDayLabel: string
  displayedSleepDayLabel: string
  isCurrentSleepDayWaiting: boolean
  reason: string
}

export function buildSleepDayDisplayStatus({
  displayedSleepDayKey,
  isFallbackSleepDay,
  targetSleepDayKey,
}: {
  displayedSleepDayKey?: string | null
  isFallbackSleepDay: boolean
  targetSleepDayKey: string
}): SleepDayDisplayStatus {
  const displayedSleepDayLabel = displayedSleepDayKey
    ? `${displayedSleepDayKey}の睡眠日`
    : '表示できる睡眠日はまだありません'

  if (isFallbackSleepDay && displayedSleepDayKey) {
    return {
      boundaryNotice: SLEEP_DAY_BOUNDARY_NOTICE,
      currentSleepDayLabel: 'データ待ち',
      displayedSleepDayLabel,
      isCurrentSleepDayWaiting: true,
      reason: `${SLEEP_DAY_FALLBACK_NOTICE} 表示中: ${displayedSleepDayLabel}。`,
    }
  }

  return {
    boundaryNotice: SLEEP_DAY_BOUNDARY_NOTICE,
    currentSleepDayLabel: displayedSleepDayKey ? '表示中' : 'データ待ち',
    displayedSleepDayLabel,
    isCurrentSleepDayWaiting: !displayedSleepDayKey,
    reason: displayedSleepDayKey
      ? `現在の睡眠日 ${targetSleepDayKey} を表示しています。`
      : `現在の睡眠日 ${targetSleepDayKey} はまだデータ待ちです。`,
  }
}

export const SLEEP_DAY_VISIBILITY_FORBIDDEN_TERMS = [
  '失敗',
  '異常',
  '診断',
  '原因',
  '悪化',
  '改善します',
  'リスク',
]
