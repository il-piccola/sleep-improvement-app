import { FieldValue } from 'firebase-admin/firestore'
import { getFirestoreDb, isFirestoreAuthError } from './firestore.js'
import type { HealthMetricAuditSummary } from '../types/healthMetrics.js'

export class MetricAuditSummarySaveError extends Error {
  constructor(cause: unknown) {
    super(getMetricAuditSummarySaveErrorMessage(cause))
    this.name = 'MetricAuditSummarySaveError'
    this.cause = cause
  }
}

const FIRESTORE_WRITE_TIMEOUT_MS = 15_000

export async function saveMetricAuditSummary({
  runId,
  summary,
  userId,
}: {
  runId: string
  summary: HealthMetricAuditSummary
  userId: string
}): Promise<string> {
  const path = `users/${userId}/metric_audit_summaries/${runId}`

  try {
    await withTimeout(
      getFirestoreDb()
        .collection('users')
        .doc(userId)
        .collection('metric_audit_summaries')
        .doc(runId)
        .set({
          ...summary,
          runId,
          userId,
          createdAt: FieldValue.serverTimestamp(),
        }),
      FIRESTORE_WRITE_TIMEOUT_MS,
    )

    return path
  } catch (error) {
    throw new MetricAuditSummarySaveError(error)
  }
}

function getMetricAuditSummarySaveErrorMessage(error: unknown): string {
  if (isFirestoreAuthError(error)) {
    return 'Firestore認証に失敗しました。Cloud Runのサービスアカウント権限を確認してください。'
  }

  return 'ヘルスメトリクス監査結果の保存に失敗しました。Firestore権限を確認してください。'
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
