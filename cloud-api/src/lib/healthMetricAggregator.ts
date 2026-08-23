import {
  aggregateProcessorDailyHealthMetrics,
  getProcessorDailyHealthMetricTargetMetrics,
} from '../../../processor/dailyHealthMetrics.ts'
import { DEFAULT_PROCESSOR_CONFIG } from '../../../processor/types.ts'
import type { ProcessorHealthMetricRecord } from '../../../processor/healthMetricTypes.ts'
import type { HealthMetricRecordDocument } from '../types/firestore.js'

export type HealthMetricAggregationResult = {
  records: HealthMetricRecordDocument[]
  targetMetricCount: number
  skippedMetricCount: number
  rejectedRowCount: number
}

type TargetMetricName = Extract<
  HealthMetricRecordDocument['metricName'],
  'active_energy' | 'step_count' | 'walking_running_distance'
>

export function aggregateHealthAutoExportMetrics({
  input,
  runId,
  sourceFile,
  userId,
}: {
  input: unknown
  runId: string
  sourceFile: string
  userId: string
}): HealthMetricAggregationResult {
  void sourceFile
  const result = aggregateProcessorDailyHealthMetrics({
    input,
    config: DEFAULT_PROCESSOR_CONFIG,
  })

  return {
    ...result,
    records: result.records.map((record) => toFirestoreRecord(record, runId, userId)),
  }
}

export function getHealthMetricTargetMetrics(): TargetMetricName[] {
  return getProcessorDailyHealthMetricTargetMetrics()
}

function toFirestoreRecord(
  record: ProcessorHealthMetricRecord,
  runId: string,
  userId: string,
): HealthMetricRecordDocument {
  if (
    record.aggregation !== 'daily_total' ||
    record.granularity !== 'day' ||
    !record.date ||
    record.value === null
  ) {
    throw new Error('Processor returned an invalid daily health metric record')
  }

  return {
    recordId: record.metricRecordId,
    userId,
    metricName: record.metricName as TargetMetricName,
    metricGroup: 'activity',
    aggregation: 'daily_total',
    granularity: 'day',
    date: record.date,
    windowStart: record.windowStart,
    windowEnd: record.windowEnd,
    value: record.value,
    unit: record.unit as HealthMetricRecordDocument['unit'],
    sourceFormat: 'health_auto_export_json',
    sourceKey: record.sourceKey,
    ...(record.sourceName ? { sourceName: record.sourceName } : {}),
    sourceRowCount: record.sourceRowCount,
    sourceFileCount: record.sourceFileCount,
    runId,
  }
}
