import { FieldValue } from 'firebase-admin/firestore'
import { getFirestoreDb, isFirestoreAuthError } from './firestore.js'
import type { HealthMetricRecordDocument } from '../types/firestore.js'

export class HealthMetricRecordSaveError extends Error {
  constructor(cause: unknown) {
    super(getHealthMetricRecordSaveErrorMessage(cause))
    this.name = 'HealthMetricRecordSaveError'
    this.cause = cause
  }
}

const FIRESTORE_WRITE_TIMEOUT_MS = 15_000
const WRITE_BATCH_LIMIT = 400

export async function saveHealthMetricRecords(records: HealthMetricRecordDocument[]): Promise<{
  savedRecordCount: number
  updatedRecordCount: number
}> {
  try {
    return await withTimeout(
      saveHealthMetricRecordsWithoutTimeout(records),
      FIRESTORE_WRITE_TIMEOUT_MS,
    )
  } catch (error) {
    throw new HealthMetricRecordSaveError(error)
  }
}

async function saveHealthMetricRecordsWithoutTimeout(records: HealthMetricRecordDocument[]): Promise<{
  savedRecordCount: number
  updatedRecordCount: number
}> {
  if (records.length === 0) {
    return {
      savedRecordCount: 0,
      updatedRecordCount: 0,
    }
  }

  const db = getFirestoreDb()
  const refs = records.map((record) =>
    db
      .collection('users')
      .doc(record.userId)
      .collection('health_metric_records')
      .doc(record.recordId),
  )
  const snapshots = await db.getAll(...refs)
  let batch = db.batch()
  let pendingWrites = 0
  let savedRecordCount = 0
  let updatedRecordCount = 0

  for (const [index, record] of records.entries()) {
    const exists = snapshots[index]?.exists ?? false
    const document = {
      recordId: record.recordId,
      userId: record.userId,
      metricName: record.metricName,
      metricGroup: record.metricGroup,
      aggregation: record.aggregation,
      granularity: record.granularity,
      ...(record.date ? { date: record.date } : {}),
      ...(record.sleepDay ? { sleepDay: record.sleepDay } : {}),
      ...(record.sleepBlockId ? { sleepBlockId: record.sleepBlockId } : {}),
      ...(record.sleepBlockType ? { sleepBlockType: record.sleepBlockType } : {}),
      ...(record.isMainSleep !== undefined ? { isMainSleep: record.isMainSleep } : {}),
      windowStart: record.windowStart,
      windowEnd: record.windowEnd,
      ...(record.timezone ? { timezone: record.timezone } : {}),
      ...(record.value !== undefined ? { value: record.value } : {}),
      ...(record.valueAvg !== undefined ? { valueAvg: record.valueAvg } : {}),
      ...(record.valueMin !== undefined ? { valueMin: record.valueMin } : {}),
      ...(record.valueMax !== undefined ? { valueMax: record.valueMax } : {}),
      ...(record.valueCount !== undefined ? { valueCount: record.valueCount } : {}),
      unit: record.unit,
      sourceFormat: record.sourceFormat,
      sourceKey: record.sourceKey,
      ...(record.sourceName ? { sourceName: record.sourceName } : {}),
      sourceRowCount: record.sourceRowCount,
      sourceFileCount: record.sourceFileCount,
      runId: record.runId,
      updatedAt: FieldValue.serverTimestamp(),
      ...(exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }

    batch.set(refs[index], document, { merge: true })

    if (exists) {
      updatedRecordCount += 1
    } else {
      savedRecordCount += 1
    }

    pendingWrites += 1

    if (pendingWrites >= WRITE_BATCH_LIMIT) {
      await batch.commit()
      batch = db.batch()
      pendingWrites = 0
    }
  }

  if (pendingWrites > 0) {
    await batch.commit()
  }

  return {
    savedRecordCount,
    updatedRecordCount,
  }
}

function getHealthMetricRecordSaveErrorMessage(error: unknown): string {
  if (isFirestoreAuthError(error)) {
    return 'Firestore認証に失敗しました。Cloud Runのサービスアカウント権限を確認してください。'
  }

  return 'Firestoreへのヘルスメトリクス集約レコード保存に失敗しました。Firestore権限を確認してください。'
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | null = null

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          const error = new Error('Firestore write timed out')
          error.name = 'FirestoreWriteTimeoutError'
          reject(error)
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}
