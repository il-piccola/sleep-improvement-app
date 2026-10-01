import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { createProductionWebServer } from '../scripts/production-web-server.mjs'

const root = await mkdtemp(join(tmpdir(), 'sleep-compass-production-web-'))
const distDir = join(root, 'dist')
await mkdir(join(distDir, 'assets'), { recursive: true })
await writeFile(join(distDir, 'index.html'), '<!doctype html><title>Sleep Compass</title>')
await writeFile(join(distDir, 'assets', 'app.js'), 'window.sleepCompass = true')
await writeFile(join(root, 'private.txt'), 'PRIVATE')

const api = createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify({ path: request.url, method: request.method }))
})
await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve))
const web = await createProductionWebServer({ distDir, apiPort: api.address().port })
await new Promise((resolve) => web.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${web.address().port}`

after(async () => {
  await Promise.all([
    new Promise((resolve) => web.close(resolve)),
    new Promise((resolve) => api.close(resolve)),
  ])
  await rm(root, { recursive: true, force: true })
})

test('serves the production build and browser routes without caching index.html', async () => {
  const home = await fetch(base)
  assert.equal(home.status, 200)
  assert.match(await home.text(), /Sleep Compass/)
  assert.equal(home.headers.get('cache-control'), 'no-cache')

  const route = await fetch(`${base}/timeline/2026-09`)
  assert.equal(route.status, 200)
  assert.match(await route.text(), /Sleep Compass/)

  const asset = await fetch(`${base}/assets/app.js`)
  assert.equal(asset.status, 200)
  assert.equal(asset.headers.get('content-type'), 'text/javascript; charset=utf-8')
  assert.equal(await asset.text(), 'window.sleepCompass = true')
})

test('proxies API requests on the same origin, including POST', async () => {
  const get = await fetch(`${base}/api/healthz?compact=1`)
  assert.deepEqual(await get.json(), { path: '/api/healthz?compact=1', method: 'GET' })

  const post = await fetch(`${base}/api/rescan`, { method: 'POST' })
  assert.deepEqual(await post.json(), { path: '/api/rescan', method: 'POST' })
})

test('does not serve private files or unknown assets', async () => {
  const privateFile = await fetch(`${base}/%2e%2e/private.txt`)
  assert.equal(privateFile.status, 404)
  const missingAsset = await fetch(`${base}/assets/missing.js`)
  assert.equal(missingAsset.status, 404)
  const head = await fetch(`${base}/assets/app.js`, { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
})
