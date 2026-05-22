import { FieldValue } from 'firebase-admin/firestore'
import { getFirestoreDb, isFirestoreAuthError } from './firestore.js'
import type { DriveSyncRunDocument } from '../types/firestore.js'

export class DriveSyncRunSaveError extends Error {
  constructor(cause: unknown) {
    super(getDriveSyncRunSaveErrorMessage(cause))
    this.name = 'DriveSyncRunSaveError'
    this.cause = cause
  }
}

const FIRESTORE_WRITE_TIMEOUT_MS = 15_000

export async function saveDriveSyncRun(run: DriveSyncRunDocument): Promise<void> {
  try {
    await withTimeout(
      getFirestoreDb()
        .collection('users')
        .doc(run.userId)
        .collection('drive_sync_runs')
        .doc(run.runId)
        .set({
          ...run,
          createdAt: FieldValue.serverTimestamp(),
        }),
      FIRESTORE_WRITE_TIMEOUT_MS,
    )
  } catch (error) {
    throw new DriveSyncRunSaveError(error)
  }
}

function getDriveSyncRunSaveErrorMessage(error: unknown): string {
  if (isFirestoreAuthError(error)) {
    return 'Firestore認証に失敗しました。Cloud Runのサービスアカウント権限を確認してください。'
  }

  return 'Google Drive同期実行履歴の保存に失敗しました。Firestore権限を確認してください。'
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
