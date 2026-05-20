import { FieldValue } from 'firebase-admin/firestore'
import { getFirestoreDb, isFirestoreAuthError } from './firestore.js'
import type { DriveJsonFile } from './drive.js'
import type { ProcessedDriveFileDocument } from '../types/firestore.js'

export class ProcessedDriveFileError extends Error {
  constructor(cause: unknown) {
    super(getProcessedDriveFileErrorMessage(cause))
    this.name = 'ProcessedDriveFileError'
    this.cause = cause
  }
}

type DriveFileFingerprint = Pick<
  ProcessedDriveFileDocument,
  'fileId' | 'fileName' | 'md5Checksum' | 'mimeType' | 'modifiedTime' | 'sha256' | 'size'
>

const FIRESTORE_WRITE_TIMEOUT_MS = 15_000

export async function shouldProcessDriveFile(
  userId: string,
  file: DriveJsonFile,
): Promise<boolean> {
  try {
    const snapshot = await getFirestoreDb()
      .collection('users')
      .doc(userId)
      .collection('processed_drive_files')
      .doc(file.fileId)
      .get()

    if (!snapshot.exists) {
      return true
    }

    const existing = snapshot.data() as Partial<ProcessedDriveFileDocument>

    if (existing.status === 'failed') {
      return true
    }

    return (
      existing.modifiedTime !== file.modifiedTime ||
      existing.size !== file.size ||
      existing.md5Checksum !== file.md5Checksum
    )
  } catch (error) {
    throw new ProcessedDriveFileError(error)
  }
}

export async function saveProcessedDriveFile(input: {
  addedCount: number
  batchId?: string
  errorSummary?: string
  file: DriveFileFingerprint
  skippedDuplicateCount: number
  status: ProcessedDriveFileDocument['status']
  userId: string
  warningCount: number
}): Promise<void> {
  const document = {
    fileId: input.file.fileId,
    fileName: input.file.fileName,
    ...(input.file.mimeType ? { mimeType: input.file.mimeType } : {}),
    ...(input.file.modifiedTime ? { modifiedTime: input.file.modifiedTime } : {}),
    ...(input.file.size ? { size: input.file.size } : {}),
    ...(input.file.md5Checksum ? { md5Checksum: input.file.md5Checksum } : {}),
    ...(input.file.sha256 ? { sha256: input.file.sha256 } : {}),
    status: input.status,
    ...(input.batchId ? { batchId: input.batchId } : {}),
    ...(input.errorSummary ? { errorSummary: input.errorSummary } : {}),
    addedCount: input.addedCount,
    skippedDuplicateCount: input.skippedDuplicateCount,
    warningCount: input.warningCount,
    userId: input.userId,
    processedAt: new Date().toISOString(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  try {
    await withTimeout(
      getFirestoreDb()
        .collection('users')
        .doc(input.userId)
        .collection('processed_drive_files')
        .doc(input.file.fileId)
        .set(document, { merge: true }),
      FIRESTORE_WRITE_TIMEOUT_MS,
    )
  } catch (error) {
    throw new ProcessedDriveFileError(error)
  }
}

function getProcessedDriveFileErrorMessage(error: unknown): string {
  if (isFirestoreAuthError(error)) {
    return 'Firestore認証に失敗しました。Cloud Runのサービスアカウント権限を確認してください。'
  }

  return 'Google Drive処理済みファイル台帳の保存に失敗しました。Firestore権限を確認してください。'
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
