import type { IncomingMessage } from 'node:http'
import { getAuth } from 'firebase-admin/auth'
import { getDefaultUserId } from './batches.js'
import { ensureFirebaseAdminApp } from './firestore.js'

type FirebaseIdTokenPayload = {
  uid: string
}

type ViewAuthorizationOptions = {
  verifyIdToken?: (idToken: string) => Promise<FirebaseIdTokenPayload>
}

export class ViewAuthError extends Error {
  status: 401 | 403

  constructor(status: 401 | 403, message: string) {
    super(message)
    this.name = 'ViewAuthError'
    this.status = status
  }
}

export async function authorizeViewRequest(
  request: IncomingMessage,
  options: ViewAuthorizationOptions = {},
): Promise<string> {
  if (process.env.ALLOW_DEV_READ_WITHOUT_AUTH?.toLowerCase() === 'true') {
    return getDefaultUserId()
  }

  const idToken = getBearerToken(request)

  if (!idToken) {
    throw new ViewAuthError(401, 'Firebase ID Token is required')
  }

  let uid: string

  try {
    const decoded = await (options.verifyIdToken ?? verifyFirebaseIdToken)(idToken)
    uid = decoded.uid
  } catch {
    throw new ViewAuthError(401, 'Invalid or expired Firebase ID Token')
  }

  const allowedUids = getAllowedFirebaseUids()

  if (!allowedUids.has(uid)) {
    throw new ViewAuthError(403, 'Firebase UID is not allowed to read this data')
  }

  return getDefaultUserId()
}

async function verifyFirebaseIdToken(idToken: string): Promise<FirebaseIdTokenPayload> {
  ensureFirebaseAdminApp()
  const decoded = await getAuth().verifyIdToken(idToken)
  return { uid: decoded.uid }
}

function getBearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization

  if (!authorization?.startsWith('Bearer ')) {
    return ''
  }

  return authorization.slice('Bearer '.length).trim()
}

function getAllowedFirebaseUids(): Set<string> {
  return new Set(
    (process.env.ALLOWED_FIREBASE_UIDS ?? '')
      .split(',')
      .map((uid) => uid.trim())
      .filter(Boolean),
  )
}
