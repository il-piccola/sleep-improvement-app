import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

let cachedFirestore: Firestore | null = null

export function getFirestoreDb(): Firestore {
  if (cachedFirestore) {
    return cachedFirestore
  }

  if (getApps().length === 0) {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT?.trim()

    initializeApp({
      credential: applicationDefault(),
      ...(projectId ? { projectId } : {}),
    })
  }

  const databaseId = process.env.FIRESTORE_DATABASE_ID?.trim() || '(default)'
  cachedFirestore = getFirestore(databaseId)
  return cachedFirestore
}

export function isFirestoreAuthError(error: unknown): boolean {
  const text = getErrorText(error).toLowerCase()

  return (
    text.includes('could not load the default credentials') ||
    text.includes('application default credentials') ||
    text.includes('google application credentials') ||
    text.includes('unauthenticated') ||
    text.includes('permission_denied') ||
    text.includes('permission denied') ||
    text.includes('the caller does not have permission')
  )
}

function getErrorText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name} ${error.message}`
  }

  return String(error)
}
