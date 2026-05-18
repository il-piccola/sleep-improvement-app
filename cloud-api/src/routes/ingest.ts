import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  createIngestBatchDocument,
  FirestoreSaveError,
  saveIngestBatch,
} from '../lib/batches.js'
import {
  hasJsonContentType,
  isAuthorized,
  readJsonBody,
  sendJson,
  sendSafeError,
} from '../lib/security.js'

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
  const batch = createIngestBatchDocument({
    batchId,
    receivedAt,
    requestSizeBytes: body.byteLength,
  })

  try {
    await saveIngestBatch(batch)
  } catch (error) {
    if (error instanceof FirestoreSaveError) {
      sendSafeError(response, 500, error.message)
      return
    }

    throw error
  }

  sendJson(response, 202, {
    batchId,
    receivedAt,
    firestoreSaved: true,
  })
}
