import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

export type JsonReadResult =
  | { ok: true; value: unknown; byteLength: number }
  | { ok: false; status: number; error: string }

const MAX_JSON_BYTES = 32 * 1024 * 1024

export function isAuthorized(request: IncomingMessage, expectedToken: string | undefined): boolean {
  if (!expectedToken) {
    return false
  }

  const authorization = request.headers.authorization
  const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : ''

  return safeEqual(token, expectedToken)
}

export function hasJsonContentType(request: IncomingMessage): boolean {
  const contentType = request.headers['content-type']
  return typeof contentType === 'string' && contentType.toLowerCase().includes('application/json')
}

export async function readJsonBody(request: IncomingMessage): Promise<JsonReadResult> {
  const chunks: Buffer[] = []
  let byteLength = 0

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    byteLength += buffer.byteLength

    if (byteLength > MAX_JSON_BYTES) {
      return { ok: false, status: 413, error: 'Request body is too large' }
    }

    chunks.push(buffer)
  }

  try {
    return {
      ok: true,
      value: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
      byteLength,
    }
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON' }
  }
}

export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

export function sendSafeError(response: ServerResponse, status: number, error: string): void {
  sendJson(response, status, { error })
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.byteLength !== rightBuffer.byteLength) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}
