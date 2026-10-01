import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createProductionWebServer } from './production-web-server.mjs'

const distDir = resolve(process.env.SLEEP_COMPASS_WEB_DIST_DIR || 'dist')
const webPort = readPort(process.env.SLEEP_COMPASS_WEB_PORT, 5180)
const apiPort = readPort(process.env.HEALTH_IMPORT_SERVER_PORT, 8787)

await access(distDir)
const server = await createProductionWebServer({ distDir, apiPort })
server.listen(webPort, '127.0.0.1', () => {
  console.log(`Production Web listening on http://127.0.0.1:${webPort}`)
})

function readPort(value, fallback) {
  if (value === undefined || value === '') return fallback
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${value}`)
  }
  return port
}
