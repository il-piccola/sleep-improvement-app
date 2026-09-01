import { createServer, type ServerResponse } from 'node:http'
import { loadHealthImportConfig } from './config.ts'
import { loadHealthStore, loadHealthStoreWithStatus } from './healthStore.ts'
import { createHealthExportWatcher } from './watchHealthExports.ts'
import { loadProcessedFiles } from './processedFiles.ts'
import {
  buildProcessedSleepHealthContext,
  loadLatestProcessedData,
} from './processedData.ts'
import { publishLocalProcessedData } from './localProcessedData.ts'

const config = loadHealthImportConfig()
const watcher = createHealthExportWatcher(config, undefined, {
  onProcessedDataReady: async () => {
    await publishLocalProcessedData(config)
  },
})

if (config.watchEnabled) {
  void watcher.start().catch((error) => {
    watcher.status.lastError = error instanceof Error ? error.message : String(error)
  })
}

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
      const processed = await loadLatestProcessedData(config.processedDataDir)
      if (processed) {
        sendJson(response, {
          generatedAt: processed.generatedAt,
          records: processed.records,
          warnings: processed.warnings,
          latestImport: processed.latestImport,
          dataSource: 'processed_data',
          snapshotId: processed.snapshotId,
        })
        return
      }

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
      const processed = await loadLatestProcessedData(config.processedDataDir)
      if (processed) {
        sendJson(response, {
          generatedAt: processed.generatedAt,
          summaries: processed.analysis.summaries,
          actions: processed.analysis.actions,
          dataSource: 'processed_data',
          snapshotId: processed.snapshotId,
        })
        return
      }

      const store = await loadHealthStore(config.dataDir)
      sendJson(response, {
        generatedAt: store.generatedAt,
        summaries: store.analysis?.summaries ?? [],
        actions: store.analysis?.actions ?? [],
      })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/import-status') {
      const processed = await loadLatestProcessedData(config.processedDataDir)
      const store = await loadHealthStoreWithStatus(config.dataDir)
      const processedFiles = await loadProcessedFiles(config.dataDir, config.watchDir)
      sendJson(response, {
        ...watcher.status,
        watchEnabled: config.watchEnabled,
        watchDir: config.watchDir,
        scanIntervalMs: config.scanIntervalMs,
        usePolling: config.usePolling,
        pollIntervalMs: config.pollIntervalMs,
        awaitWriteStabilityMs: config.awaitWriteStabilityMs,
        dataDir: config.dataDir,
        processedDataDir: config.processedDataDir,
        processedDataBackupDir: config.processedDataBackupDir,
        healthStoreLoadStatus: store.status,
        latestImport: processed?.latestImport ?? store.state.latestImport,
        importHistory: store.state.importHistory,
        processedFiles: processedFiles.files.slice(0, 20),
        processedFileCount: processedFiles.files.length,
        dataSource: processed ? 'processed_data' : 'legacy_health_store',
        processedDataSnapshotId: processed?.snapshotId ?? null,
        processedDataGeneratedAt: processed?.generatedAt ?? null,
        processedDataInputFileCount: processed?.inputFiles.length ?? 0,
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/rescan') {
      const status = await watcher.rescan()
      try {
        const processedData = await publishLocalProcessedData(config)
        sendJson(response, { ...status, processedData })
      } catch (error) {
        sendJson(
          response,
          {
            ...status,
            processedData: null,
            processedDataError: error instanceof Error ? error.message : String(error),
          },
          500,
        )
      }
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/source-audit') {
      const processed = await loadLatestProcessedData(config.processedDataDir)
      if (processed) {
        sendJson(response, {
          dataQuality: processed.analysis.dataQuality,
          sourceQuality: processed.analysis.sourceQuality,
          warnings: processed.warnings,
          dataSource: 'processed_data',
          snapshotId: processed.snapshotId,
        })
        return
      }

      const store = await loadHealthStore(config.dataDir)
      sendJson(response, {
        dataQuality: store.analysis?.dataQuality ?? null,
        sourceQuality: store.analysis?.sourceQuality ?? [],
        warnings: store.warnings,
      })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/unified-timeline') {
      const processed = await loadLatestProcessedData(config.processedDataDir)
      if (processed) {
        sendJson(response, processed.analysis.unifiedTimeline)
        return
      }

      const store = await loadHealthStore(config.dataDir)
      sendJson(response, store.analysis?.unifiedTimeline ?? null)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/sleep-health-context') {
      const processed = await loadLatestProcessedData(config.processedDataDir)
      sendJson(response, {
        boundaryHour: processed?.processingConfig.sleepDayBoundaryHour ?? 18,
        days: processed ? buildProcessedSleepHealthContext(processed) : [],
        dataSource: processed ? 'processed_data' : 'legacy_health_store',
        snapshotId: processed?.snapshotId ?? null,
      })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/drive-sync-status') {
      const processed = await loadLatestProcessedData(config.processedDataDir)
      sendJson(response, {
        lastSyncAt: processed?.generatedAt ?? null,
        lastStatus: processed ? 'normal' : 'not_synced',
        processedDriveFileCount: processed?.inputFiles.length ?? 0,
        latestBatchId: processed?.snapshotId ?? null,
        latestFileName: processed?.latestImport?.importedFileName ?? null,
        latestFileModifiedTime: processed?.generatedAt ?? null,
        lastCheckedFiles: processed?.inputFiles.length ?? 0,
        lastProcessedFiles: processed?.inputFiles.filter((file) => file.status === 'processed').length ?? 0,
        lastSkippedAlreadyProcessed: processed?.inputFiles.filter((file) => file.status === 'skipped').length ?? 0,
        lastFailedFiles: processed?.inputFiles.filter((file) => file.status === 'failed').length ?? 0,
        failedFiles: [],
        warningCount: processed?.warnings.length ?? 0,
      })
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

server.listen(config.serverPort, config.serverHost, () => {
  console.log(`Health import server listening on http://${config.serverHost}:${config.serverPort}`)
  console.log(
    config.watchEnabled
      ? `Watching ${config.watchDir}`
      : `Health export watcher disabled; standalone rescan remains available`,
  )
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
