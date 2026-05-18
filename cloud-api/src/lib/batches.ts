import { getFirestoreDb } from './firestore.js'
import type { IngestBatchDocument } from '../types/firestore.js'

export class FirestoreSaveError extends Error {
  constructor(cause: unknown) {
    super('Firestoreへの取り込み履歴保存に失敗しました。認証情報または接続設定を確認してください。')
    this.name = 'FirestoreSaveError'
    this.cause = cause
  }
}

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
    cloudRun: true,
  }
}

export async function saveIngestBatch(batch: IngestBatchDocument): Promise<void> {
  try {
    await getFirestoreDb()
      .collection('users')
      .doc(batch.userId)
      .collection('ingest_batches')
      .doc(batch.batchId)
      .set(batch)
  } catch (error) {
    throw new FirestoreSaveError(error)
  }
}
