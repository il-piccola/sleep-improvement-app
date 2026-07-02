import type {
  AnalysisConfig,
  SleepBlock,
  SleepIntegrationLogEntry,
  SleepOverlapCandidate,
  SleepRecord,
  SleepSourcePreferenceMap,
  SourceQualityReport,
  UnifiedSleepBlock,
  UnifiedSleepRecord,
  UnifiedSleepTimeline,
} from '../../types/sleep'
import { buildSleepBlocks } from './buildSleepBlocks'
import { detectSleepOverlaps, PARTIAL_OVERLAP_RATIO } from './detectSleepOverlaps'
import { evaluateSourceQuality } from './evaluateSourceQuality'
import { resolveSleepSource } from '../source/resolveSleepSource'

type BlockDecision = {
  duplicateExcludedBy?: string
  pendingExcludedBy?: string
  ignored?: boolean
  notes: string[]
}

export function buildUnifiedSleepTimeline(
  records: SleepRecord[],
  config: Partial<AnalysisConfig> = {},
  sourcePreferences: SleepSourcePreferenceMap = {},
): UnifiedSleepTimeline {
  const supportLogs: SleepIntegrationLogEntry[] = []
  const integrationRecords = records.filter((record) => {
    const sourceKey = resolveSleepSource(record).sourceKey
    return sourcePreferences[sourceKey]?.use !== 'ignored'
  })
  const ignoredRecords = records.filter((record) => {
    const sourceKey = resolveSleepSource(record).sourceKey
    return sourcePreferences[sourceKey]?.use === 'ignored'
  })
  const initialActualBlocks = buildSleepBlocks(integrationRecords, config)
  const actualBlocks = applyFallbackSourceRules(
    initialActualBlocks,
    sourcePreferences,
    supportLogs,
  )
  const fallbackBlocks = buildInBedFallbackBlocks(
    integrationRecords,
    actualBlocks,
    sourcePreferences,
    supportLogs,
  )
  const candidateBlocks = [...actualBlocks, ...fallbackBlocks]
  const overlapReport = detectSleepOverlaps(candidateBlocks)
  const sourceQuality = evaluateSourceQuality(integrationRecords, new Date(), overlapReport)
  const sourceQualityByKey = new Map(sourceQuality.map((report) => [report.sourceKey, report]))
  const blockById = new Map(candidateBlocks.map((block) => [block.id, block]))
  const decisions = new Map(candidateBlocks.map((block) => [block.id, createDecision()]))
  const logs: SleepIntegrationLogEntry[] = [...supportLogs]

  for (const record of ignoredRecords) {
    const source = resolveSleepSource(record)
    logs.push({
      id: `ignored-source-${record.id}`,
      severity: 'info',
      action: 'support_only',
      message: `${source.sourceLabel} はユーザー設定で除外されているため、統合タイムラインと主要指標には使いません。`,
      affectedBlockIds: [],
      sourceKeys: [source.sourceKey],
    })
  }

  for (const component of buildOverlapComponents(overlapReport.fullDuplicateCandidates)) {
    const blocks = component.map((blockId) => blockById.get(blockId)).filter(isBlock)
    const winner = choosePreferredBlock(blocks, sourceQualityByKey, sourcePreferences)

    if (!winner) {
      continue
    }

    for (const block of blocks) {
      if (block.id === winner.id) {
        decisions.get(block.id)?.notes.push('完全重複候補の中から主要指標に採用しました。')
        continue
      }

      const decision = decisions.get(block.id)
      if (decision) {
        decision.duplicateExcludedBy = winner.id
        decision.notes.push('完全重複候補のため、主要指標では採用ソース側にまとめました。')
      }

      logs.push({
        id: `duplicate-${winner.id}-${block.id}`,
        severity: 'info',
        action: 'excluded_duplicate',
        message: `${describeBlock(block)} は ${describeBlock(winner)} と80%以上重なったため、品質スコアとソース情報をもとに主要指標から除外しました。元データは削除していません。`,
        adoptedBlockId: winner.id,
        affectedBlockIds: [winner.id, block.id],
        sourceKeys: uniqueStrings([...winner.sourceKeys, ...block.sourceKeys]),
      })
    }
  }

  const remainingPartialCandidates = overlapReport.partialOverlapCandidates.filter(
    (candidate) =>
      !candidate.blockIds.some((blockId) => decisions.get(blockId)?.duplicateExcludedBy),
  )

  for (const component of buildOverlapComponents(remainingPartialCandidates)) {
    const blocks = component.map((blockId) => blockById.get(blockId)).filter(isBlock)
    const winner = choosePreferredBlock(blocks, sourceQualityByKey, sourcePreferences)

    if (!winner) {
      continue
    }

    decisions
      .get(winner.id)
      ?.notes.push('部分重複のため、主要指標では暫定採用しました。判断保留ログに残しています。')

    for (const block of blocks) {
      if (block.id === winner.id) {
        continue
      }

      const decision = decisions.get(block.id)
      if (decision) {
        decision.pendingExcludedBy = winner.id
        decision.notes.push('部分重複のため、主要指標では二重加算せず判断保留にしました。')
      }

      logs.push({
        id: `partial-${winner.id}-${block.id}`,
        severity: 'warning',
        action: 'pending_overlap',
        message: `${describeBlock(block)} は ${describeBlock(winner)} と一部重なっています。初期実装では方式Aとして、品質スコアとソース優先順位が高い方だけを主要指標に暫定採用し、もう一方は判断保留として残します。`,
        adoptedBlockId: winner.id,
        affectedBlockIds: [winner.id, block.id],
        sourceKeys: uniqueStrings([...winner.sourceKeys, ...block.sourceKeys]),
      })
    }
  }

  const unifiedBlocks = candidateBlocks
    .filter((block) => {
      const decision = decisions.get(block.id)
      return !decision?.duplicateExcludedBy && !decision?.pendingExcludedBy
    })
    .map((block) => toUnifiedBlock(block, decisions, candidateBlocks))

  addAdoptionLogs(unifiedBlocks, logs)

  const anomalyWarnings = checkUnifiedTimelineAnomalies(actualBlocks, unifiedBlocks, overlapReport)
  anomalyWarnings.push(...checkIgnoredRecordWarnings(ignoredRecords))
  for (const [index, warning] of anomalyWarnings.entries()) {
    logs.push({
      id: `anomaly-${index + 1}`,
      severity: 'warning',
      action: 'anomaly',
      message: warning,
      affectedBlockIds: [],
      sourceKeys: [],
    })
  }

  const unifiedRecords = buildUnifiedRecords(
    records,
    candidateBlocks,
    unifiedBlocks,
    decisions,
    sourcePreferences,
  )
  const duplicateExcludedCount = countRecords(candidateBlocks, (block) =>
    Boolean(decisions.get(block.id)?.duplicateExcludedBy),
  )
  const fallbackUsedCount = unifiedBlocks.filter((block) => block.isFallbackBlock).length
  const pendingOverlapCount = remainingPartialCandidates.length

  return {
    records: unifiedRecords,
    blocks: unifiedBlocks,
    logs,
    comparison: {
      rawTotalSleepMinutes: sumMinutes(actualBlocks),
      unifiedTotalSleepMinutes: sumMinutes(unifiedBlocks),
      rawBlockCount: actualBlocks.length,
      unifiedBlockCount: unifiedBlocks.length,
      adoptedRecordCount: unifiedBlocks.reduce(
        (sum, block) => sum + block.sourceRecordIds.length,
        0,
      ),
      duplicateExcludedCount,
      fallbackUsedCount,
      pendingOverlapCount,
    },
    anomalyWarnings,
    overlapReport,
  }
}

function buildInBedFallbackBlocks(
  records: SleepRecord[],
  actualBlocks: SleepBlock[],
  sourcePreferences: SleepSourcePreferenceMap,
  logs: SleepIntegrationLogEntry[],
): SleepBlock[] {
  const fallbackBlocks: SleepBlock[] = []

  for (const record of records) {
    if (normalizeStage(record.stage ?? record.value) !== 'in_bed') {
      continue
    }

    const start = parseDate(record.startDate ?? record.start)
    const end = parseDate(record.endDate ?? record.end)
    const durationMinutes =
      start && end
        ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000))
        : Math.max(0, Math.round(record.durationMinutes ?? 0))

    if (durationMinutes <= 0) {
      continue
    }

    const source = resolveSleepSource(record)
    if (sourcePreferences[source.sourceKey]?.use === 'ignored') {
      continue
    }

    const supportBlock = createSingleRecordBlock(
      record,
      source.sourceKey,
      source.sourceLabel,
      durationMinutes,
      start,
      end,
      fallbackBlocks.length,
    )
    const overlapsActualSleep = actualBlocks.some(
      (block) => calculateOverlapRatio(supportBlock, block) >= PARTIAL_OVERLAP_RATIO,
    )

    if (overlapsActualSleep) {
      logs.push({
        id: `support-inbed-${record.id}`,
        severity: 'info',
        action: 'support_only',
        message: `${source.sourceLabel} のIn Bedデータは同じ時間帯に実睡眠データがあるため、主要指標では補助情報として扱います。`,
        affectedBlockIds: [supportBlock.id],
        sourceKeys: [source.sourceKey],
      })
      continue
    }

    logs.push({
      id: `fallback-inbed-${record.id}`,
      severity: 'info',
      action: 'fallback_used',
      message: `${source.sourceLabel} のIn Bedデータは同じ時間帯に実睡眠データがないため、補助的な睡眠候補として採用しました。`,
      adoptedBlockId: supportBlock.id,
      affectedBlockIds: [supportBlock.id],
      sourceKeys: [source.sourceKey],
    })
    fallbackBlocks.push(supportBlock)
  }

  return fallbackBlocks
}

function applyFallbackSourceRules(
  blocks: SleepBlock[],
  sourcePreferences: SleepSourcePreferenceMap,
  logs: SleepIntegrationLogEntry[],
): SleepBlock[] {
  const primaryBlocks = blocks.filter((block) => getConfiguredUse(block, sourcePreferences) !== 'fallback')
  const result: SleepBlock[] = []

  for (const block of blocks) {
    if (getConfiguredUse(block, sourcePreferences) !== 'fallback') {
      result.push(block)
      continue
    }

    const overlapsPrimary = primaryBlocks.some(
      (primaryBlock) => calculateOverlapRatio(block, primaryBlock) >= PARTIAL_OVERLAP_RATIO,
    )

    if (overlapsPrimary) {
      logs.push({
        id: `fallback-source-support-${block.id}`,
        severity: 'info',
        action: 'support_only',
        message: `${describeBlock(block)} は補助データです。同じ時間帯に主データまたは補助候補の実睡眠データがあるため、主要指標では補助扱いにしました。`,
        affectedBlockIds: [block.id],
        sourceKeys: block.sourceKeys,
      })
      continue
    }

    logs.push({
      id: `fallback-source-used-${block.id}`,
      severity: 'info',
      action: 'fallback_used',
      message: `${describeBlock(block)} は補助データですが、同じ時間帯に他の実睡眠データがないため補助的に採用しました。`,
      adoptedBlockId: block.id,
      affectedBlockIds: [block.id],
      sourceKeys: block.sourceKeys,
    })
    result.push(block)
  }

  return result
}

function createSingleRecordBlock(
  record: SleepRecord,
  sourceKey: string,
  sourceLabel: string,
  durationMinutes: number,
  start: Date | null,
  end: Date | null,
  index: number,
): SleepBlock {
  return {
    id: `in-bed-fallback-${index + 1}`,
    sourceRecordIds: [record.id],
    sourceKeys: [sourceKey],
    sourceLabels: [sourceLabel],
    recordKinds: ['inBed'],
    values: [record.value],
    stageSegments:
      start && end
        ? [
            {
              durationMinutes,
              end: end.toISOString(),
              stage: 'in_bed',
              start: start.toISOString(),
            },
          ]
        : [],
    startDate: start?.toISOString() ?? null,
    endDate: end?.toISOString() ?? null,
    durationMinutes,
    startMinutesFromMidnight: start ? getMinutesFromMidnight(start) : null,
    endMinutesFromMidnight: end ? getMinutesFromMidnight(end) : null,
    dayIndex: record.dayIndex ?? null,
    timeConfidence: start && end ? 'actual' : record.dayIndex ? 'estimated' : 'durationOnly',
  }
}

function buildOverlapComponents(candidates: SleepOverlapCandidate[]): string[][] {
  const adjacent = new Map<string, Set<string>>()

  for (const candidate of candidates) {
    const [left, right] = candidate.blockIds
    const leftSet = adjacent.get(left) ?? new Set<string>()
    const rightSet = adjacent.get(right) ?? new Set<string>()
    leftSet.add(right)
    rightSet.add(left)
    adjacent.set(left, leftSet)
    adjacent.set(right, rightSet)
  }

  const visited = new Set<string>()
  const components: string[][] = []

  for (const blockId of adjacent.keys()) {
    if (visited.has(blockId)) {
      continue
    }

    const stack = [blockId]
    const component: string[] = []
    visited.add(blockId)

    while (stack.length > 0) {
      const current = stack.pop()
      if (!current) {
        continue
      }

      component.push(current)
      for (const next of adjacent.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next)
          stack.push(next)
        }
      }
    }

    components.push(component)
  }

  return components
}

function choosePreferredBlock(
  blocks: SleepBlock[],
  sourceQualityByKey: Map<string, SourceQualityReport>,
  sourcePreferences: SleepSourcePreferenceMap,
): SleepBlock | null {
  return [...blocks].sort((left, right) => {
    const rightScore = scoreBlockPreference(right, sourceQualityByKey, sourcePreferences)
    const leftScore = scoreBlockPreference(left, sourceQualityByKey, sourcePreferences)
    return rightScore - leftScore || right.durationMinutes - left.durationMinutes
  })[0] ?? null
}

function scoreBlockPreference(
  block: SleepBlock,
  sourceQualityByKey: Map<string, SourceQualityReport>,
  sourcePreferences: SleepSourcePreferenceMap,
): number {
  const sourceKey = block.sourceKeys[0] ?? 'unknown_source'
  const quality = sourceQualityByKey.get(sourceKey)
  const preference = sourcePreferences[sourceKey]
  const configuredUse = preference?.use
  const recommendedUseScore = configuredUse
    ? toConfiguredUseScore(configuredUse)
    : toRecommendedUseScore(quality?.recommendedUse)
  const detailedStageScore = block.values.filter((value) =>
    ['asleep_core', 'asleep_rem', 'asleep_deep'].includes(normalizeStage(value)),
  ).length
  const inBedPenalty = block.recordKinds.every((kind) => kind === 'inBed') ? -30 : 0
  const manualPenalty = isManualSource(block) && configuredUse !== 'primary' ? -20 : 0
  const unknownButUsableBonus = sourceKey.startsWith('unknown_source') && detailedStageScore > 0 ? 5 : 0
  const priorityBonus = preference ? Math.max(0, 10_000 - preference.priority * 100) : 0

  return (
    (quality?.qualityScore ?? 0) +
    recommendedUseScore +
    detailedStageScore * 8 +
    inBedPenalty +
    manualPenalty +
    unknownButUsableBonus +
    priorityBonus
  )
}

function toConfiguredUseScore(use: NonNullable<SleepSourcePreferenceMap[string]>['use']) {
  switch (use) {
    case 'primary':
      return 80
    case 'secondary':
      return 35
    case 'fallback':
      return -20
    case 'ignored':
      return -500
  }
}

function getConfiguredUse(
  block: SleepBlock,
  sourcePreferences: SleepSourcePreferenceMap,
): NonNullable<SleepSourcePreferenceMap[string]>['use'] | undefined {
  const sourceKey = block.sourceKeys[0] ?? 'unknown_source'
  return sourcePreferences[sourceKey]?.use
}

function toRecommendedUseScore(recommendedUse: SourceQualityReport['recommendedUse'] | undefined) {
  switch (recommendedUse) {
    case 'primary':
      return 40
    case 'secondary':
      return 20
    case 'fallback':
      return -10
    case 'ignore':
      return -100
    default:
      return 0
  }
}

function isManualSource(block: SleepBlock): boolean {
  const text = [...block.sourceKeys, ...block.sourceLabels].join(' ').toLowerCase()
  return text.includes('manual') || text.includes('手入力')
}

function toUnifiedBlock(
  block: SleepBlock,
  decisions: Map<string, BlockDecision>,
  candidateBlocks: SleepBlock[],
): UnifiedSleepBlock {
  const excludedBlockIds = candidateBlocks
    .filter((candidate) => decisions.get(candidate.id)?.duplicateExcludedBy === block.id)
    .map((candidate) => candidate.id)
  const pendingOverlapBlockIds = candidateBlocks
    .filter((candidate) => decisions.get(candidate.id)?.pendingExcludedBy === block.id)
    .map((candidate) => candidate.id)
  const decision = decisions.get(block.id)

  return {
    ...block,
    adoptedFromBlockIds: [block.id],
    excludedBlockIds,
    pendingOverlapBlockIds,
    integrationNotes: decision?.notes ?? [],
    isFallbackBlock: block.recordKinds.every((kind) => kind === 'inBed'),
    isPendingReview: pendingOverlapBlockIds.length > 0,
  }
}

function addAdoptionLogs(blocks: UnifiedSleepBlock[], logs: SleepIntegrationLogEntry[]): void {
  for (const block of blocks) {
    if (block.sourceKeys.some((sourceKey) => sourceKey.startsWith('unknown_source'))) {
      logs.push({
        id: `unknown-adopted-${block.id}`,
        severity: 'info',
        action: 'adopted',
        message: `${describeBlock(block)} はソース名が不明ですが、時刻と睡眠ステージが利用できるため候補に残しました。`,
        adoptedBlockId: block.id,
        affectedBlockIds: [block.id],
        sourceKeys: block.sourceKeys,
      })
    }
  }
}

function buildUnifiedRecords(
  records: SleepRecord[],
  candidateBlocks: SleepBlock[],
  unifiedBlocks: UnifiedSleepBlock[],
  decisions: Map<string, BlockDecision>,
  sourcePreferences: SleepSourcePreferenceMap,
): UnifiedSleepRecord[] {
  const blockByRecordId = new Map<string, SleepBlock>()
  for (const block of candidateBlocks) {
    for (const recordId of block.sourceRecordIds) {
      blockByRecordId.set(recordId, block)
    }
  }

  const adoptedBlockByRecordId = new Map<string, UnifiedSleepBlock>()
  for (const block of unifiedBlocks) {
    for (const recordId of block.sourceRecordIds) {
      adoptedBlockByRecordId.set(recordId, block)
    }
  }

  return records.map((record) => {
    const source = resolveSleepSource(record)
    if (sourcePreferences[source.sourceKey]?.use === 'ignored') {
      return {
        ...record,
        ...source,
        unifiedStatus: 'ignored',
        unifiedReason: 'ユーザー設定で除外されているため、統合後の主要指標には使っていません。',
      }
    }

    const adoptedBlock = adoptedBlockByRecordId.get(record.id)
    const sourceBlock = blockByRecordId.get(record.id)
    const decision = sourceBlock ? decisions.get(sourceBlock.id) : undefined

    if (adoptedBlock) {
      return {
        ...record,
        ...source,
        unifiedStatus: 'adopted',
        unifiedReason: '統合後の主要指標に採用しました。',
        unifiedBlockId: adoptedBlock.id,
      }
    }

    if (decision?.duplicateExcludedBy) {
      return {
        ...record,
        ...source,
        unifiedStatus: 'excluded_duplicate',
        unifiedReason: '完全重複候補のため、主要指標では採用側にまとめました。',
        unifiedBlockId: decision.duplicateExcludedBy,
      }
    }

    if (decision?.pendingExcludedBy) {
      return {
        ...record,
        ...source,
        unifiedStatus: 'pending_overlap',
        unifiedReason: '部分重複のため、主要指標では暫定採用側に寄せ、判断保留にしました。',
        unifiedBlockId: decision.pendingExcludedBy,
      }
    }

    return {
      ...record,
      ...source,
      unifiedStatus: 'support',
      unifiedReason: 'Awakeまたは補助情報として保持し、睡眠時間には加算していません。',
    }
  })
}

function checkUnifiedTimelineAnomalies(
  rawBlocks: SleepBlock[],
  unifiedBlocks: UnifiedSleepBlock[],
  overlapReport: ReturnType<typeof detectSleepOverlaps>,
): string[] {
  const warnings: string[] = []
  const rawTotal = sumMinutes(rawBlocks)
  const unifiedTotal = sumMinutes(unifiedBlocks)
  const maxSourceTotal = calculateMaxSourceTotal(rawBlocks)

  if (rawTotal > 0 && unifiedTotal > rawTotal * 1.1 + 30) {
    warnings.push('統合後の総睡眠時間が統合前より大きく増えています。In Bedの補助データや独立睡眠を確認してください。')
  }

  if (maxSourceTotal > 0 && unifiedTotal > maxSourceTotal + 240) {
    warnings.push('統合後の総睡眠時間が単一ソースの最大値を大きく超えています。複数ソースの独立睡眠か重なりを確認してください。')
  }

  if (rawBlocks.some((block) => block.durationMinutes < 90) && !unifiedBlocks.some((block) => block.durationMinutes < 90)) {
    warnings.push('統合後に仮眠候補が消えています。重複判定の結果を確認してください。')
  }

  if (unifiedBlocks.some((block) => block.durationMinutes > 18 * 60)) {
    warnings.push('統合後に18時間を超える睡眠ブロックがあります。元データの時刻を確認してください。')
  }

  if (overlapReport.pendingReviewCandidates.length > 0) {
    warnings.push('部分重複があります。主要指標では二重加算を避けていますが、診断画面で判断保留を確認してください。')
  }

  return warnings
}

function checkIgnoredRecordWarnings(records: SleepRecord[]): string[] {
  const warnings: string[] = []
  const ignoredSleepRecords = records.filter((record) => normalizeStage(record.stage ?? record.value).includes('asleep'))
  const ignoredNapRecords = ignoredSleepRecords.filter((record) => getRecordDurationMinutes(record) < 90)

  if (ignoredSleepRecords.length > 0) {
    warnings.push('除外設定により、睡眠として扱えるソースが統合後の主要指標から外れています。')
  }

  if (ignoredNapRecords.length > 0) {
    warnings.push('除外設定により、仮眠候補が統合後の主要指標から外れています。')
  }

  return warnings
}

function getRecordDurationMinutes(record: SleepRecord): number {
  const start = parseDate(record.startDate ?? record.start)
  const end = parseDate(record.endDate ?? record.end)

  if (start && end) {
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000))
  }

  return Math.max(0, Math.round(record.durationMinutes ?? 0))
}

function calculateMaxSourceTotal(blocks: SleepBlock[]): number {
  const totals = new Map<string, number>()

  for (const block of blocks) {
    const sourceKey = block.sourceKeys[0] ?? 'unknown_source'
    totals.set(sourceKey, (totals.get(sourceKey) ?? 0) + block.durationMinutes)
  }

  return Math.max(0, ...totals.values())
}

function countRecords(blocks: SleepBlock[], predicate: (block: SleepBlock) => boolean): number {
  return blocks
    .filter(predicate)
    .reduce((sum, block) => sum + block.sourceRecordIds.length, 0)
}

function calculateOverlapRatio(left: SleepBlock, right: SleepBlock): number {
  const overlapMinutes = calculateOverlapMinutes(left, right)
  const shorterMinutes = Math.min(left.durationMinutes, right.durationMinutes)
  return shorterMinutes > 0 ? overlapMinutes / shorterMinutes : 0
}

function calculateOverlapMinutes(left: SleepBlock, right: SleepBlock): number {
  if (!left.startDate || !left.endDate || !right.startDate || !right.endDate) {
    return 0
  }

  const leftStart = Date.parse(left.startDate)
  const leftEnd = Date.parse(left.endDate)
  const rightStart = Date.parse(right.startDate)
  const rightEnd = Date.parse(right.endDate)

  if (
    !Number.isFinite(leftStart) ||
    !Number.isFinite(leftEnd) ||
    !Number.isFinite(rightStart) ||
    !Number.isFinite(rightEnd)
  ) {
    return 0
  }

  return Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart)) / 60_000
}

function createDecision(): BlockDecision {
  return {
    notes: [],
  }
}

function isBlock(block: SleepBlock | undefined): block is SleepBlock {
  return Boolean(block)
}

function sumMinutes(blocks: Array<Pick<SleepBlock, 'durationMinutes'>>): number {
  return blocks.reduce((sum, block) => sum + block.durationMinutes, 0)
}

function describeBlock(block: SleepBlock): string {
  const sourceLabel = block.sourceLabels[0] ?? block.sourceKeys[0] ?? '不明ソース'
  return `${sourceLabel} ${formatTimeRange(block)}`
}

function formatTimeRange(block: SleepBlock): string {
  if (!block.startDate || !block.endDate) {
    return '時刻なし'
  }

  return `${formatClock(new Date(block.startDate))}-${formatClock(new Date(block.endDate))}`
}

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function normalizeStage(value: string): string {
  if (value.includes('InBed')) {
    return 'in_bed'
  }

  return value.toLowerCase()
}

function parseDate(value: string | undefined): Date | null {
  if (!value) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getMinutesFromMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values))
}
