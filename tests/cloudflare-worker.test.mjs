import assert from 'node:assert/strict'
import test from 'node:test'
import worker from '../cloudflare/worker.mjs'

const env = {
  ALLOWED_EMAIL: 'owner@example.com',
  SLEEP_WEB: { fetch: async (request) => new Response(request.url, { status: 200 }) },
}
const authorized = { access: { getIdentity: async () => ({ email: 'owner@example.com' }) } }

test('rejects requests without verified Access identity', async () => {
  const request = new Request('https://sleep.example.workers.dev/api/health-records')
  assert.equal((await worker.fetch(request, env, {})).status, 403)
  assert.equal((await worker.fetch(request, { ...env, ALLOWED_EMAIL: '' }, authorized)).status, 403)
  assert.equal((await worker.fetch(request, env, {
    access: { getIdentity: async () => ({ email: 'other@example.com' }) },
  })).status, 403)
})

test('passes the same-origin path and query to the private service', async () => {
  let forwarded
  const response = await worker.fetch(
    new Request('https://sleep.example.workers.dev/api/health-records?month=2026-09', {
      headers: { Cookie: 'private', Accept: 'application/json', Authorization: 'secret' },
    }),
    { ...env, SLEEP_WEB: { fetch: async (request) => {
      forwarded = request
      return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
    } } },
    authorized,
  )
  assert.equal(forwarded.url, 'http://localhost:5180/api/health-records?month=2026-09')
  assert.equal(forwarded.headers.get('accept'), 'application/json')
  assert.equal(forwarded.headers.get('cookie'), null)
  assert.equal(forwarded.headers.get('authorization'), null)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(response.headers.get('access-control-allow-origin'), null)
})

test('only allows GET, HEAD, and the explicit rescan POST', async () => {
  const denied = await worker.fetch(new Request('https://sleep.example.workers.dev/api/data', {
    method: 'POST',
  }), env, authorized)
  assert.equal(denied.status, 405)

  const rescan = await worker.fetch(new Request('https://sleep.example.workers.dev/api/rescan', {
    method: 'POST',
  }), env, authorized)
  assert.equal(rescan.status, 200)
})
