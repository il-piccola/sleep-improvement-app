import { FieldValue } from 'firebase-admin/firestore'
import { getFirestoreDb, isFirestoreAuthError } from './firestore.js'
import type { IngestBatchDocument } from '../types/firestore.js'

export class FirestoreSaveError extends Error {
  constructor(cause: unknown) {
    super(getFirestoreSaveErrorMessage(cause))
    this.name = 'FirestoreSaveError'
    this.cause = cause
  }
}

const FIRESTORE_WRITE_TIMEOUT_MS = 15_000

export function getDefaultUserId(): string {
  return process.env.DEFAULT_USER_ID?.trim() || 'maya'
}

export function createIngestBatchDocument({
  batchId,
  receivedAt,
  requestSizeBytes,
  userId = getDefaultUserId(),
}: {
  batchId: string
  receivedAt: string
  requestSizeBytes: number
  userId?: string
}): IngestBatchDocument {
  return {
    batchId,
    receivedAt,
    source: 'health_auto_export',
    requestSizeBytes,
    status: 'received',
    warningCount: 0,
    addedCount: 0,
    skippedDuplicateCount: 0,
    userId,
    cloudRun: process.env.NODE_ENV === 'production',
  }
}

export async function saveIngestBatch(batch: IngestBatchDocument): Promise<void> {
  const batchDocument = {
    batchId: batch.batchId,
    receivedAt: batch.receivedAt,
    source: batch.source,
    requestSizeBytes: batch.requestSizeBytes,
    status: batch.status,
    warningCount: batch.warningCount,
    addedCount: batch.addedCount,
    skippedDuplicateCount: batch.skippedDuplicateCount,
    userId: batch.userId,
    cloudRun: batch.cloudRun,
    createdAt: FieldValue.serverTimestamp(),
  }

  try {
    await withTimeout(
      getFirestoreDb()
        .collection('users')
        .doc(batch.userId)
        .collection('ingest_batches')
        .doc(batch.batchId)
        .set(batchDocument),
      FIRESTORE_WRITE_TIMEOUT_MS,
    )
  } catch (error) {
    throw new FirestoreSaveError(error)
  }
}

function getFirestoreSaveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'FirestoreWriteTimeoutError') {
    return 'Firestoreへの保存がタイムアウトしました。ローカル開発では gcloud auth application-default login と GOOGLE_CLOUD_PROJECT を確認してください。Cloud Run本番ではサービスアカウントのFirestore権限を確認してください。'
  }

  if (isFirestoreAuthError(error)) {
    return 'Firestore認証に失敗しました。ローカル開発では gcloud auth application-default login を実行してください。Cloud Run本番ではサービスアカウントのFirestore権限を確認してください。'
  }

  return 'Firestoreへの取り込み履歴保存に失敗しました。ローカル開発では gcloud auth application-default login を実行し、必要に応じて GOOGLE_CLOUD_PROJECT と FIRESTORE_DATABASE_ID を確認してください。Cloud Run本番ではサービスアカウントのFirestore権限を確認してください。'
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
