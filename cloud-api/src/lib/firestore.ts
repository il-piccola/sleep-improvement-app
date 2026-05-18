import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

let cachedFirestore: Firestore | null = null

export function getFirestoreDb(): Firestore {
  if (cachedFirestore) {
    return cachedFirestore
  }

  if (getApps().length === 0) {
    initializeApp({
      credential: applicationDefault(),
    })
  }

  const databaseId = process.env.FIRESTORE_DATABASE_ID?.trim()
  cachedFirestore = databaseId ? getFirestore(databaseId) : getFirestore()
  return cachedFirestore
}
