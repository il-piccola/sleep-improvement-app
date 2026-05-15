export type SleepRecordValue =
  | 'HKCategoryValueSleepAnalysisAsleep'
  | 'HKCategoryValueSleepAnalysisAsleepCore'
  | 'HKCategoryValueSleepAnalysisAsleepDeep'
  | 'HKCategoryValueSleepAnalysisAsleepREM'
  | 'HKCategoryValueSleepAnalysisAsleepUnspecified'
  | 'HKCategoryValueSleepAnalysisAwake'
  | 'HKCategoryValueSleepAnalysisInBed'
  | string

export type NormalizedSleepStage =
  | 'awake'
  | 'in_bed'
  | 'asleep'
  | 'asleep_core'
  | 'asleep_rem'
  | 'asleep_deep'
  | 'asleep_unspecified'

export type SleepRecordKind = 'asleep' | 'inBed' | 'awake' | 'unknown'

export type SleepBlockLabel = 'main' | 'napCandidate' | 'eveningSleep' | 'other'

export type TrendLevel = 'low' | 'moderate' | 'high'

export type TimeConfidence = 'actual' | 'estimated' | 'durationOnly'

export type DataQualityLevel = 'good' | 'caution' | 'insufficient'

export type DataQualityIssueSeverity = 'info' | 'warning' | 'error'

export type ImprovementPace = 'slow' | 'standard' | 'firm'

export type SleepRecord = {
  id: string
  value: SleepRecordValue
  sourceFormat?: 'health_auto_export_json' | 'normalized_sleep_records' | 'apple_health_xml' | string
  sourceFile?: string
  sourceApp?: string
  originalValue?: string
  start?: string
  end?: string
  stage?: NormalizedSleepStage
  startDate?: string
  endDate?: string
  durationMinutes?: number
  dayIndex?: number
  hasStartDate?: boolean
  hasEndDate?: boolean
  hasSource?: boolean
  source?: string
  sourceName?: string
  sourceKind?: string
}

export type SleepBlock = {
  id: string
  sourceRecordIds: string[]
  recordKinds: SleepRecordKind[]
  values: SleepRecordValue[]
  startDate: string | null
  endDate: string | null
  durationMinutes: number
  startMinutesFromMidnight: number | null
  endMinutesFromMidnight: number | null
  dayIndex: number | null
  timeConfidence: TimeConfidence
}

export type ClassifiedSleepBlock = SleepBlock & {
  labels: SleepBlockLabel[]
  isNapCandidate: boolean
  isEveningSleep: boolean
  notes: string[]
}

export type SleepDayGroup = {
  sleepDayKey: string
  boundaryStartDate: string | null
  boundaryEndDate: string | null
  blocks: SleepBlock[]
}

export type ScoreResult = {
  score: number
  level: TrendLevel
  label: string
  reasons: string[]
  confidence: TimeConfidence
}

export type SleepDaySummary = {
  sleepDayKey: string
  blockCount: number
  totalSleepMinutes: number
  longestBlockMinutes: number
  napCandidateCount: number
  eveningSleepCount: number
  classifiedBlocks: ClassifiedSleepBlock[]
  fragmentation: ScoreResult
  circadian: ScoreResult
  notes: string[]
}

export type ImprovementAction = {
  id: string
  priority: 'low' | 'medium' | 'high'
  title: string
  description: string
  basis: string
}

export type DataQualityIssue = {
  id: string
  severity: DataQualityIssueSeverity
  message: string
}

export type DataQualityReport = {
  level: DataQualityLevel
  label: string
  recordCount: number
  dateRangeLabel: string
  latestRecordDateLabel: string
  hasMultipleSleepsInOneDay: boolean
  hasSourceInfo: boolean
  isLikelyAggregated: boolean
  issues: DataQualityIssue[]
}

export type AnalysisConfig = {
  sleepDayBoundaryHour: number
  napCandidateMaxMinutes: number
  eveningSleepStartHour: number
  mergeGapMinutes: number
  targetWakeTime: string
  improvementPace: ImprovementPace
  mainSleepMinMinutes: number
  daytimeStartHour: number
  daytimeEndHour: number
  nightStartHour: number
  fragmentationHighBlockCount: number
  fragmentationModerateBlockCount: number
  circadianHighDaytimeRatio: number
  circadianModerateDaytimeRatio: number
}

export const defaultAnalysisConfig: AnalysisConfig = {
  sleepDayBoundaryHour: 18,
  napCandidateMaxMinutes: 90,
  eveningSleepStartHour: 16,
  mergeGapMinutes: 30,
  targetWakeTime: '07:00',
  improvementPace: 'standard',
  mainSleepMinMinutes: 180,
  daytimeStartHour: 6,
  daytimeEndHour: 18,
  nightStartHour: 22,
  fragmentationHighBlockCount: 4,
  fragmentationModerateBlockCount: 2,
  circadianHighDaytimeRatio: 0.5,
  circadianModerateDaytimeRatio: 0.25,
}

export function normalizeAnalysisConfig(
  config: Partial<AnalysisConfig> = {},
): AnalysisConfig {
  return {
    ...defaultAnalysisConfig,
    ...config,
  }
}
