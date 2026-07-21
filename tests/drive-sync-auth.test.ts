import { strict as assert } from 'node:assert'
import type { IncomingMessage } from 'node:http'
import { isAuthorizedByStaticTokenOrOidc } from '../cloud-api/src/lib/security.js'
import { authorizeViewRequest } from '../cloud-api/src/lib/viewAuth.js'

async function run(): Promise<void> {
  await testStaticTokenRemainsAuthorized()
  await testMissingSchedulerConfigRejectsOidc()
  await testSchedulerOidcServiceAccountIsAuthorized()
  await testSchedulerOidcRejectsDifferentEmail()
  await testSchedulerOidcRejectsUnverifiedEmail()
  await testDefaultAudienceUsesPathWithoutQuery()
  await testAllowedFirebaseUserCanAuthorizeDriveSync()
  await testUnlistedFirebaseUserCannotAuthorizeDriveSync()
}

async function testAllowedFirebaseUserCanAuthorizeDriveSync(): Promise<void> {
  const originalAllowedUids = process.env.ALLOWED_FIREBASE_UIDS
  const originalDevRead = process.env.ALLOW_DEV_READ_WITHOUT_AUTH
  process.env.ALLOWED_FIREBASE_UIDS = 'maya-uid'
  delete process.env.ALLOW_DEV_READ_WITHOUT_AUTH

  try {
    const userId = await authorizeViewRequest(request('firebase-token'), {
      verifyIdToken: async () => ({ uid: 'maya-uid' }),
    })
    assert.equal(userId, 'maya')
  } finally {
    restoreEnv('ALLOWED_FIREBASE_UIDS', originalAllowedUids)
    restoreEnv('ALLOW_DEV_READ_WITHOUT_AUTH', originalDevRead)
  }
}

async function testUnlistedFirebaseUserCannotAuthorizeDriveSync(): Promise<void> {
  const originalAllowedUids = process.env.ALLOWED_FIREBASE_UIDS
  const originalDevRead = process.env.ALLOW_DEV_READ_WITHOUT_AUTH
  process.env.ALLOWED_FIREBASE_UIDS = 'maya-uid'
  delete process.env.ALLOW_DEV_READ_WITHOUT_AUTH

  try {
    await assert.rejects(
      () =>
        authorizeViewRequest(request('firebase-token'), {
          verifyIdToken: async () => ({ uid: 'other-uid' }),
        }),
      { message: 'Firebase UID is not allowed to read this data' },
    )
  } finally {
    restoreEnv('ALLOWED_FIREBASE_UIDS', originalAllowedUids)
    restoreEnv('ALLOW_DEV_READ_WITHOUT_AUTH', originalDevRead)
  }
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}

async function testStaticTokenRemainsAuthorized(): Promise<void> {
  const authorized = await isAuthorizedByStaticTokenOrOidc(
    request('manual-token'),
    'manual-token',
  )

  assert.equal(authorized, true)
}

async function testMissingSchedulerConfigRejectsOidc(): Promise<void> {
  const authorized = await isAuthorizedByStaticTokenOrOidc(
    request('oidc-token'),
    'manual-token',
    {
      verifyOidcToken: async () => ({
        email: 'scheduler@example.iam.gserviceaccount.com',
        email_verified: true,
      }),
    },
  )

  assert.equal(authorized, false)
}

async function testSchedulerOidcServiceAccountIsAuthorized(): Promise<void> {
  const authorized = await isAuthorizedByStaticTokenOrOidc(
    request('oidc-token'),
    'manual-token',
    {
      allowedServiceAccountEmail: 'scheduler@example.iam.gserviceaccount.com',
      audience: 'https://sleep.example/api/drive-sync',
      verifyOidcToken: async (_token, audience) => {
        assert.equal(audience, 'https://sleep.example/api/drive-sync')
        return {
          email: 'scheduler@example.iam.gserviceaccount.com',
          email_verified: true,
        }
      },
    },
  )

  assert.equal(authorized, true)
}

async function testSchedulerOidcRejectsDifferentEmail(): Promise<void> {
  const authorized = await isAuthorizedByStaticTokenOrOidc(
    request('oidc-token'),
    'manual-token',
    {
      allowedServiceAccountEmail: 'scheduler@example.iam.gserviceaccount.com',
      audience: 'https://sleep.example/api/drive-sync',
      verifyOidcToken: async () => ({
        email: 'other@example.iam.gserviceaccount.com',
        email_verified: true,
      }),
    },
  )

  assert.equal(authorized, false)
}

async function testSchedulerOidcRejectsUnverifiedEmail(): Promise<void> {
  const authorized = await isAuthorizedByStaticTokenOrOidc(
    request('oidc-token'),
    'manual-token',
    {
      allowedServiceAccountEmail: 'scheduler@example.iam.gserviceaccount.com',
      audience: 'https://sleep.example/api/drive-sync',
      verifyOidcToken: async () => ({
        email: 'scheduler@example.iam.gserviceaccount.com',
        email_verified: false,
      }),
    },
  )

  assert.equal(authorized, false)
}

async function testDefaultAudienceUsesPathWithoutQuery(): Promise<void> {
  const authorized = await isAuthorizedByStaticTokenOrOidc(
    request('oidc-token', '/api/drive-sync?boundaryHour=6'),
    'manual-token',
    {
      allowedServiceAccountEmail: 'scheduler@example.iam.gserviceaccount.com',
      verifyOidcToken: async (_token, audience) => {
        assert.equal(audience, 'https://sleep.example/api/drive-sync')
        return {
          email: 'scheduler@example.iam.gserviceaccount.com',
          email_verified: true,
        }
      },
    },
  )

  assert.equal(authorized, true)
}

function request(token: string, url = '/api/drive-sync'): IncomingMessage {
  return {
    headers: {
      authorization: `Bearer ${token}`,
      host: 'sleep.example',
      'x-forwarded-proto': 'https',
    },
    url,
  } as IncomingMessage
}

await run()
