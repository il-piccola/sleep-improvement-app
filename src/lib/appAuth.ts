import { FirebaseAuthentication, type User as NativeAuthUser } from '@capacitor-firebase/authentication'
import { Capacitor } from '@capacitor/core'
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type Auth } from 'firebase/auth'

export type AppAuthUser = {
  displayName: string | null
  email: string | null
  uid: string
}

type Unsubscribe = () => void

export function isNativeAndroidAuth(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export function subscribeToAppAuthState(
  webAuth: Auth | null,
  onChange: (user: AppAuthUser | null) => void,
): Unsubscribe {
  if (isNativeAndroidAuth()) {
    let listenerHandle: { remove: () => Promise<void> } | null = null
    let active = true

    void FirebaseAuthentication.getCurrentUser()
      .then(({ user }) => {
        if (active) {
          onChange(toAppAuthUser(user))
        }
      })
      .catch(() => {
        if (active) {
          onChange(null)
        }
      })

    void FirebaseAuthentication.addListener('authStateChange', ({ user }) => {
      onChange(toAppAuthUser(user))
    }).then((handle) => {
      listenerHandle = handle
    })

    return () => {
      active = false
      void listenerHandle?.remove()
    }
  }

  if (!webAuth) {
    onChange(null)
    return () => {}
  }

  return onAuthStateChanged(webAuth, (user) => {
    onChange(
      user
        ? {
            displayName: user.displayName,
            email: user.email,
            uid: user.uid,
          }
        : null,
    )
  })
}

export async function signInToApp(webAuth: Auth | null): Promise<void> {
  if (isNativeAndroidAuth()) {
    await FirebaseAuthentication.signInWithGoogle({ useCredentialManager: false })
    return
  }

  if (!webAuth) {
    throw new Error('Firebase設定が見つかりません。')
  }

  await signInWithPopup(webAuth, new GoogleAuthProvider())
}

export async function signOutFromApp(webAuth: Auth | null): Promise<void> {
  if (isNativeAndroidAuth()) {
    await FirebaseAuthentication.signOut()
    return
  }

  if (!webAuth) {
    return
  }

  await signOut(webAuth)
}

export async function getAppIdToken(webAuth: Auth | null): Promise<string | null> {
  if (isNativeAndroidAuth()) {
    const { user } = await FirebaseAuthentication.getCurrentUser()

    if (!user) {
      return null
    }

    const { token } = await FirebaseAuthentication.getIdToken()
    return token ?? null
  }

  return webAuth?.currentUser?.getIdToken() ?? null
}

function toAppAuthUser(user: NativeAuthUser | null | undefined): AppAuthUser | null {
  if (!user) {
    return null
  }

  return {
    displayName: user.displayName,
    email: user.email,
    uid: user.uid,
  }
}
