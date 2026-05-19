import { FieldValue } from 'firebase-admin/firestore'
import { getFirestoreDb, isFirestoreAuthError } from './firestore.js'
import type { SleepRecordDocument } from '../types/firestore.js'

export class SleepRecordSaveError extends Error {
  constructor(cause: unknown) {
    super(getSleepRecordSaveErrorMessage(cause))
    this.name = 'SleepRecordSaveError'
    this.cause = cause
  }
}

const FIRESTORE_WRITE_TIMEOUT_MS = 15_000
const WRITE_BATCH_LIMIT = 400

export async function saveSleepRecords(records: SleepRecordDocument[]): Promise<{
  addedCount: number
  skippedDuplicateCount: number
}> {
  try {
    return await withTimeout(saveSleepRecordsWithoutTimeout(records), FIRESTORE_WRITE_TIMEOUT_MS)
  } catch (error) {
    throw new SleepRecordSaveError(error)
  }
}

async function saveSleepRecordsWithoutTimeout(records: SleepRecordDocument[]): Promise<{
  addedCount: number
  skippedDuplicateCount: number
}> {
  if (records.length === 0) {
    return {
      addedCount: 0,
      skippedDuplicateCount: 0,
    }
  }

  const db = getFirestoreDb()
  const refs = records.map((record) =>
    db
      .collection('users')
      .doc(record.userId)
      .collection('sleep_records')
      .doc(record.recordId),
  )
  const snapshots = await db.getAll(...refs)
  let batch = db.batch()
  let addedCount = 0
  let skippedDuplicateCount = 0
  let pendingWrites = 0

  for (const [index, record] of records.entries()) {
    if (snapshots[index]?.exists) {
      skippedDuplicateCount += 1
      continue
    }

    batch.set(refs[index], {
      recordId: record.recordId,
      userId: record.userId,
      batchId: record.batchId,
      start: record.start,
      end: record.end,
      durationMinutes: record.durationMinutes,
      stage: record.stage,
      originalValue: record.originalValue,
      sourceKey: record.sourceKey,
      ...(record.sourceName ? { sourceName: record.sourceName } : {}),
      sourceFormat: record.sourceFormat,
      sourceFile: record.sourceFile,
      createdAt: FieldValue.serverTimestamp(),
    })
    addedCount += 1
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
    addedCount,
    skippedDuplicateCount,
  }
}

function getSleepRecordSaveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'FirestoreWriteTimeoutError') {
    return 'Firestoreへの睡眠レコード保存がタイムアウトしました。ローカル開発では gcloud auth application-default login と GOOGLE_CLOUD_PROJECT を確認してください。'
  }

  if (isFirestoreAuthError(error)) {
    return 'Firestore認証に失敗しました。ローカル開発では gcloud auth application-default login を実行してください。'
  }

  return 'Firestoreへの睡眠レコード保存に失敗しました。Firestore Database ID、プロジェクトID、権限を確認してください。'
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
