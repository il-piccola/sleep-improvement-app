import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { OAuth2Client } from 'google-auth-library'

export type JsonReadResult =
  | { ok: true; value: unknown; byteLength: number }
  | { ok: false; status: number; error: string }

const MAX_JSON_BYTES = 32 * 1024 * 1024
const oidcClient = new OAuth2Client()

type OidcPayload = {
  email?: string
  email_verified?: boolean
}

type VerifyOidcToken = (idToken: string, audience: string) => Promise<OidcPayload | null>

export function isAuthorized(request: IncomingMessage, expectedToken: string | undefined): boolean {
  if (!expectedToken) {
    return false
  }

  const token = getBearerToken(request)

  return safeEqual(token, expectedToken)
}

export async function isAuthorizedByStaticTokenOrOidc(
  request: IncomingMessage,
  expectedToken: string | undefined,
  options: {
    allowedServiceAccountEmail?: string
    audience?: string
    verifyOidcToken?: VerifyOidcToken
  } = {},
): Promise<boolean> {
  if (isAuthorized(request, expectedToken)) {
    return true
  }

  const allowedEmail = options.allowedServiceAccountEmail?.trim().toLowerCase()

  if (!allowedEmail) {
    return false
  }

  const token = getBearerToken(request)

  if (!token) {
    return false
  }

  const audience = options.audience?.trim() || getDefaultOidcAudience(request)

  if (!audience) {
    return false
  }

  try {
    const verifyOidcToken = options.verifyOidcToken ?? verifyGoogleOidcToken
    const payload = await verifyOidcToken(token, audience)
    const email = payload?.email?.trim().toLowerCase()

    return email === allowedEmail && payload?.email_verified !== false
  } catch {
    return false
  }
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

function getBearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization
  return authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : ''
}

function getDefaultOidcAudience(request: IncomingMessage): string | null {
  const host = request.headers.host

  if (!host) {
    return null
  }

  const proto = getForwardedProto(request)
  const url = new URL(request.url ?? '/', `${proto}://${host}`)
  return `${proto}://${host}${url.pathname}`
}

function getForwardedProto(request: IncomingMessage): 'http' | 'https' {
  const proto = request.headers['x-forwarded-proto']

  if (typeof proto === 'string' && proto.split(',')[0]?.trim() === 'http') {
    return 'http'
  }

  return 'https'
}

async function verifyGoogleOidcToken(idToken: string, audience: string): Promise<OidcPayload | null> {
  const ticket = await oidcClient.verifyIdToken({
    audience,
    idToken,
  })

  const payload = ticket.getPayload()

  return payload
    ? {
        email: payload.email,
        email_verified: payload.email_verified,
      }
    : null
}
