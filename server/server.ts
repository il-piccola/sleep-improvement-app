import { createServer, type ServerResponse } from 'node:http'
import { loadHealthImportConfig } from './config.ts'
import { loadHealthStore } from './healthStore.ts'
import { createHealthExportWatcher } from './watchHealthExports.ts'
import { loadProcessedFiles } from './processedFiles.ts'

const config = loadHealthImportConfig()
const watcher = createHealthExportWatcher(config)

await watcher.start()

const server = createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }

  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

    if (request.method === 'GET' && url.pathname === '/api/health-records') {
      const store = await loadHealthStore(config.dataDir)
      sendJson(response, {
        generatedAt: store.generatedAt,
        records: store.records,
        warnings: store.warnings,
        latestImport: store.latestImport,
      })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/summaries') {
      const store = await loadHealthStore(config.dataDir)
      sendJson(response, {
        generatedAt: store.generatedAt,
        summaries: store.analysis?.summaries ?? [],
        actions: store.analysis?.actions ?? [],
      })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/import-status') {
      const store = await loadHealthStore(config.dataDir)
      const processedFiles = await loadProcessedFiles(config.dataDir)
      sendJson(response, {
        ...watcher.status,
        watchDir: config.watchDir,
        scanIntervalMs: config.scanIntervalMs,
        usePolling: config.usePolling,
        pollIntervalMs: config.pollIntervalMs,
        awaitWriteStabilityMs: config.awaitWriteStabilityMs,
        latestImport: store.latestImport,
        importHistory: store.importHistory,
        processedFiles: processedFiles.files.slice(0, 20),
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/rescan') {
      const status = await watcher.rescan()
      sendJson(response, status)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/source-audit') {
      const store = await loadHealthStore(config.dataDir)
      sendJson(response, {
        dataQuality: store.analysis?.dataQuality ?? null,
        sourceQuality: store.analysis?.sourceQuality ?? [],
        warnings: store.warnings,
      })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/unified-timeline') {
      const store = await loadHealthStore(config.dataDir)
      sendJson(response, store.analysis?.unifiedTimeline ?? null)
      return
    }

    sendJson(response, { error: 'Not found' }, 404)
  } catch (error) {
    sendJson(
      response,
      {
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    )
  }
})

server.listen(config.serverPort, () => {
  console.log(`Health import server listening on http://localhost:${config.serverPort}`)
  console.log(`Watching ${config.watchDir}`)
})

process.on('SIGINT', () => {
  void shutdown()
})

process.on('SIGTERM', () => {
  void shutdown()
})

async function shutdown() {
  await watcher.stop()
  server.close(() => {
    process.exit(0)
  })
}

function sendJson(response: ServerResponse, body: unknown, status = 200) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(body))
}
