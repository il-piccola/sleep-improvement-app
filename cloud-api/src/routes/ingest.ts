import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  createIngestBatchDocument,
  FirestoreSaveError,
  getDefaultUserId,
  saveIngestBatch,
  updateIngestBatchResult,
} from '../lib/batches.js'
import { normalizeHealthAutoExportJson } from '../lib/healthAutoExport.js'
import {
  hasJsonContentType,
  isAuthorized,
  readJsonBody,
  sendJson,
  sendSafeError,
} from '../lib/security.js'
import { saveSleepRecords, SleepRecordSaveError } from '../lib/sleepRecords.js'

export async function handleHealthAutoExportIngest(
  request: IncomingMessage,
  response: ServerResponse,
  token: string | undefined,
): Promise<void> {
  if (!isAuthorized(request, token)) {
    sendSafeError(response, 401, 'Unauthorized')
    return
  }

  if (!hasJsonContentType(request)) {
    sendSafeError(response, 415, 'Content-Type must be application/json')
    return
  }

  const body = await readJsonBody(request)

  if (!body.ok) {
    sendSafeError(response, body.status, body.error)
    return
  }

  const batchId = randomUUID()
  const receivedAt = new Date().toISOString()
  const userId = getDefaultUserId()
  const sourceFile = getSourceFileName(request)
  const batch = createIngestBatchDocument({
    batchId,
    receivedAt,
    requestSizeBytes: body.byteLength,
    userId,
  })

  try {
    await saveIngestBatch(batch)
    const normalized = normalizeHealthAutoExportJson({
      batchId,
      input: body.value,
      sourceFile,
      userId,
    })
    const saved = await saveSleepRecords(normalized.records)
    const warningCount = normalized.warnings.length
    const status = warningCount > 0 ? 'completed_with_warnings' : 'completed'

    await updateIngestBatchResult({
      addedCount: saved.addedCount,
      batchId,
      skippedDuplicateCount: saved.skippedDuplicateCount,
      status,
      userId,
      warningCount,
    })

    sendJson(response, 202, {
      batchId,
      receivedAt,
      firestoreSaved: true,
      sleepRecordCount: normalized.records.length,
      addedCount: saved.addedCount,
      skippedDuplicateCount: saved.skippedDuplicateCount,
      warningCount,
      ...(warningCount > 0 ? { warnings: normalized.warnings } : {}),
    })
  } catch (error) {
    if (error instanceof FirestoreSaveError || error instanceof SleepRecordSaveError) {
      sendSafeError(response, 500, error.message)
      return
    }

    throw error
  }
}

function getSourceFileName(request: IncomingMessage): string {
  const header = request.headers['x-source-file-name'] ?? request.headers['x-file-name']
  const value = Array.isArray(header) ? header[0] : header
  return typeof value === 'string' && value.trim() ? value.trim() : 'health-auto-export.json'
}
