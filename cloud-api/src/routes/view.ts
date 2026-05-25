import type { IncomingMessage, ServerResponse } from 'node:http'
import { authorizeViewRequest, ViewAuthError } from '../lib/viewAuth.js'
import {
  getDriveSyncStatus,
  getImportStatus,
  getInsights,
  getSummaries,
  getUnifiedTimeline,
  parseDays,
} from '../lib/viewModels.js'
import { getSleepHealthContext } from '../lib/sleepHealthContext.js'
import { sendJson, sendSafeError } from '../lib/security.js'

export async function handleImportStatus(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const userId = await authorizeViewRequest(request)
    sendJson(response, 200, await getImportStatus(userId))
  } catch (error) {
    sendViewError(response, error)
  }
}

export async function handleDriveSyncStatus(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const userId = await authorizeViewRequest(request)
    sendJson(response, 200, await getDriveSyncStatus(userId))
  } catch (error) {
    sendViewError(response, error)
  }
}

export async function handleSummaries(
  request: IncomingMessage,
  url: URL,
  response: ServerResponse,
): Promise<void> {
  try {
    const userId = await authorizeViewRequest(request)
    sendJson(response, 200, await getSummaries(parseDays(url.searchParams.get('days')), userId))
  } catch (error) {
    sendViewError(response, error)
  }
}

export async function handleUnifiedTimeline(
  request: IncomingMessage,
  url: URL,
  response: ServerResponse,
): Promise<void> {
  try {
    const userId = await authorizeViewRequest(request)
    sendJson(
      response,
      200,
      await getUnifiedTimeline(parseDays(url.searchParams.get('days')), userId),
    )
  } catch (error) {
    sendViewError(response, error)
  }
}

export async function handleInsights(
  request: IncomingMessage,
  url: URL,
  response: ServerResponse,
): Promise<void> {
  try {
    const userId = await authorizeViewRequest(request)
    sendJson(response, 200, await getInsights(parseDays(url.searchParams.get('days')), userId))
  } catch (error) {
    sendViewError(response, error)
  }
}

export async function handleSleepHealthContext(
  request: IncomingMessage,
  url: URL,
  response: ServerResponse,
): Promise<void> {
  try {
    const userId = await authorizeViewRequest(request)
    sendJson(response, 200, await getSleepHealthContext(parseDays(url.searchParams.get('days')), userId))
  } catch (error) {
    sendViewError(response, error)
  }
}

function sendViewError(response: ServerResponse, error: unknown): void {
  if (error instanceof ViewAuthError) {
    sendSafeError(response, error.status, error.message)
    return
  }

  const message = error instanceof Error ? error.message : '閲覧用データを取得できませんでした。'
  sendSafeError(response, 500, message)
}
