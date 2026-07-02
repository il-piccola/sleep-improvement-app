import { strict as assert } from 'node:assert'
import type { IncomingMessage } from 'node:http'
import { isAuthorizedByStaticTokenOrOidc } from '../cloud-api/src/lib/security.js'

async function run(): Promise<void> {
  await testStaticTokenRemainsAuthorized()
  await testMissingSchedulerConfigRejectsOidc()
  await testSchedulerOidcServiceAccountIsAuthorized()
  await testSchedulerOidcRejectsDifferentEmail()
  await testSchedulerOidcRejectsUnverifiedEmail()
  await testDefaultAudienceUsesPathWithoutQuery()
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
