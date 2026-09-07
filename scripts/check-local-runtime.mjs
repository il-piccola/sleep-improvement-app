const apiUrl = (process.env.SLEEP_COMPASS_API_URL || 'http://127.0.0.1:8787').replace(/\/$/, '')
const webUrl = (process.env.SLEEP_COMPASS_WEB_URL || 'http://127.0.0.1:5173').replace(/\/$/, '')

const api = await check(`${apiUrl}/api/healthz`)
const web = await check(`${webUrl}/`)

const apiHealthy = api.ok && api.body?.status === 'healthy'
const webHealthy = web.ok

console.log(
  `[runtime-check] api=${apiHealthy ? 'ok' : 'failed'} web=${webHealthy ? 'ok' : 'failed'} ` +
    `data=${api.body?.data?.source ?? 'unknown'} freshness=${api.body?.data?.processedDataFreshness ?? 'unknown'}`,
)

if (!apiHealthy || !webHealthy) {
  if (api.error) console.error(`[runtime-check] api error: ${api.error}`)
  if (web.error) console.error(`[runtime-check] web error: ${web.error}`)
  process.exitCode = 1
}

async function check(url) {
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
    const text = await response.text()
    let body = null
    try {
      body = JSON.parse(text)
    } catch {
      // The Web endpoint is expected to return HTML.
    }
    return { ok: response.ok, body, error: response.ok ? null : `HTTP ${response.status}` }
  } catch (error) {
    return { ok: false, body: null, error: error instanceof Error ? error.message : String(error) }
  }
}
