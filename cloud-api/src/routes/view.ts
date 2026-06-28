import type { IncomingMessage, ServerResponse } from 'node:http'
import { authorizeViewRequest, ViewAuthError } from '../lib/viewAuth.js'
import {
  getDriveSyncStatus,
  getImportStatus,
  getInsights,
  getSummaries,
  getUnifiedTimeline,
  getUnifiedTimelineForMonth,
  parseDays,
  parseMonthKey,
} from '../lib/viewModels.js'
import { getSleepHealthContext } from '../lib/sleepHealthContext.js'
import { sendJson, sendSafeError } from '../lib/security.js'
import { parseSleepDayBoundaryHour } from '../lib/sleepDayBoundary.js'

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
    sendJson(
      response,
      200,
      await getSummaries(
        parseDays(url.searchParams.get('days')),
        userId,
        parseSleepDayBoundaryHour(url.searchParams.get('boundaryHour')),
      ),
    )
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
    const boundaryHour = parseSleepDayBoundaryHour(url.searchParams.get('boundaryHour'))
    const month = parseMonthKey(url.searchParams.get('month'))
    sendJson(
      response,
      200,
      month
        ? await getUnifiedTimelineForMonth(month, userId, boundaryHour)
        : await getUnifiedTimeline(parseDays(url.searchParams.get('days')), userId, boundaryHour),
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
    sendJson(
      response,
      200,
      await getInsights(
        parseDays(url.searchParams.get('days')),
        userId,
        parseSleepDayBoundaryHour(url.searchParams.get('boundaryHour')),
      ),
    )
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
    sendJson(
      response,
      200,
      await getSleepHealthContext(
        parseDays(url.searchParams.get('days')),
        userId,
        parseSleepDayBoundaryHour(url.searchParams.get('boundaryHour')),
      ),
    )
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
