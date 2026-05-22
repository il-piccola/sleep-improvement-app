import { createServer } from 'node:http'
import { loadLocalEnv } from './lib/env.js'
import { handleHealth } from './routes/health.js'
import { handleHealthAutoExportIngest } from './routes/ingest.js'
import { handleDriveSync } from './routes/driveSync.js'
import {
  handleImportStatus,
  handleDriveSyncStatus,
  handleInsights,
  handleSummaries,
  handleUnifiedTimeline,
} from './routes/view.js'

loadLocalEnv()

const port = Number(process.env.PORT ?? 8080)
const token = process.env.HEALTH_EXPORT_API_TOKEN

const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  response.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, X-Source-File-Name, X-File-Name',
  )

  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }

  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

    if (request.method === 'GET' && url.pathname === '/api/health') {
      handleHealth(response)
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/ingest/health-auto-export') {
      await handleHealthAutoExportIngest(request, response, token)
      return
    }

    if (url.pathname === '/api/drive-sync') {
      await handleDriveSync(request, response, token)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/import-status') {
      await handleImportStatus(request, response)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/drive-sync-status') {
      await handleDriveSyncStatus(request, response)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/summaries') {
      await handleSummaries(request, url, response)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/unified-timeline') {
      await handleUnifiedTimeline(request, url, response)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/insights') {
      await handleInsights(request, url, response)
      return
    }

    response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ error: 'Not found' }))
  } catch {
    response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ error: 'Internal server error' }))
  }
})

server.listen(port, () => {
  console.log(`Cloud API listening on port ${port}`)
})

process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0)
  })
})
