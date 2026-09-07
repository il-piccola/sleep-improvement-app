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
import {
  assessProcessedDataFreshness,
  inspectRawJsonFiles,
  type RawJsonFilesStatus,
} from './rawDataStatus.ts'

const config = loadHealthImportConfig()
let rawStatusCache: RawJsonFilesStatus | null = null
let rawStatusError: string | null = null
let publicationPromise: Promise<unknown> | null = null
const watcher = createHealthExportWatcher(config, undefined, {
  onProcessedDataReady: async () => {
    await publishProcessedData()
  },
})

if (config.watchEnabled) {
  const startWatcher = () =>
    watcher.start().catch((error) => {
      watcher.status.lastError = error instanceof Error ? error.message : String(error)
    })

  if (config.startupScanEnabled) {
    void startWatcher()
  } else {
    void reconcileProcessedData()
      .catch((error) => {
        watcher.status.lastError = error instanceof Error ? error.message : String(error)
      })
      .finally(() => {
        void startWatcher()
      })
  }
}

const rawStatusTimer = setInterval(() => {
  void refreshRawStatus()
}, 60_000)
void refreshRawStatus()

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

    if (request.method === 'GET' && (url.pathname === '/api/health' || url.pathname === '/api/healthz')) {
      const health = await buildRuntimeHealth()
      sendJson(response, health, health.status === 'healthy' ? 200 : 503)
      return
    }

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
      const raw = await getRawStatus()
      const freshness = assessProcessedDataFreshness(raw, processed)
      sendJson(response, {
        ...watcher.status,
        watchEnabled: config.watchEnabled,
        startupScanEnabled: config.startupScanEnabled,
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
        rawFileCount: raw.fileCount,
        latestRawFileName: raw.latestFileName,
        latestRawFileModifiedAt: raw.latestModifiedAt,
        rawStatusError,
        processedDataFreshness: freshness.status,
        processedDataStaleReason: freshness.reason,
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/rescan') {
      const status = await watcher.rescan()
      try {
        const processedData = await publishProcessedData()
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
      const raw = await getRawStatus()
      const freshness = assessProcessedDataFreshness(raw, processed)
      sendJson(response, {
        lastSyncAt: processed?.generatedAt ?? null,
        lastStatus: freshness.status === 'fresh' ? 'normal' : processed ? 'needs_attention' : 'not_synced',
        processedDriveFileCount: processed?.inputFiles.length ?? 0,
        latestBatchId: processed?.snapshotId ?? null,
        latestFileName: raw.latestFileName ?? processed?.latestImport?.importedFileName ?? null,
        latestFileModifiedTime: raw.latestModifiedAt ?? processed?.generatedAt ?? null,
        lastCheckedFiles: raw.fileCount,
        lastProcessedFiles: processed?.inputFiles.filter((file) => file.status === 'processed').length ?? 0,
        lastSkippedAlreadyProcessed: processed?.inputFiles.filter((file) => file.status === 'skipped').length ?? 0,
        lastFailedFiles: processed?.inputFiles.filter((file) => file.status === 'failed').length ?? 0,
        failedFiles: [],
        warningCount: processed?.warnings.length ?? 0,
        processedDataFreshness: freshness.status,
        processedDataStaleReason: freshness.reason,
        rawStatusError,
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
  clearInterval(rawStatusTimer)
  await watcher.stop()
  server.close(() => {
    process.exit(0)
  })
}

function sendJson(response: ServerResponse, body: unknown, status = 200) {
  response.writeHead(status, {
    'Cache-Control': 'no-store, max-age=0',
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(body))
}

async function reconcileProcessedData(): Promise<void> {
  const processed = await loadLatestProcessedData(config.processedDataDir).catch(() => null)
  const raw = await refreshRawStatus()

  if (!processed || raw.fileCount !== processed.inputFiles.length) {
    await publishProcessedData()
    return
  }

  const freshness = assessProcessedDataFreshness(raw, processed)
  if (freshness.status === 'stale') {
    await publishProcessedData()
  }
}

async function publishProcessedData(): Promise<unknown> {
  if (!publicationPromise) {
    publicationPromise = publishLocalProcessedData(config).finally(() => {
      publicationPromise = null
    })
  }

  return publicationPromise
}

async function refreshRawStatus(): Promise<RawJsonFilesStatus> {
  try {
    rawStatusCache = await inspectRawJsonFiles(config.watchDir)
    rawStatusError = null
  } catch (error) {
    rawStatusError = error instanceof Error ? error.message : String(error)
  }

  return rawStatusCache ?? {
    fileCount: 0,
    latestFileName: null,
    latestModifiedAt: null,
  }
}

async function getRawStatus(): Promise<RawJsonFilesStatus> {
  return rawStatusCache ?? refreshRawStatus()
}

async function buildRuntimeHealth() {
  const processed = await loadLatestProcessedData(config.processedDataDir).catch(() => null)
  const raw = await getRawStatus()
  const freshness = assessProcessedDataFreshness(raw, processed)
  const watcherHealthy = !config.watchEnabled || (watcher.status.isWatching && !watcher.status.lastError)
  const healthy = watcherHealthy && freshness.status === 'fresh'

  return {
    status: healthy ? 'healthy' : 'degraded',
    checkedAt: new Date().toISOString(),
    watcher: {
      enabled: config.watchEnabled,
      isWatching: watcher.status.isWatching,
      lastScanAt: watcher.status.lastScanAt,
      lastError: watcher.status.lastError,
      rawStatusError,
    },
    data: {
      source: processed ? 'processed_data' : 'legacy_health_store',
      snapshotId: processed?.snapshotId ?? null,
      processedDataGeneratedAt: processed?.generatedAt ?? null,
      rawFileCount: raw.fileCount,
      latestRawFileName: raw.latestFileName,
      latestRawFileModifiedAt: raw.latestModifiedAt,
      processedDataFreshness: freshness.status,
      processedDataStaleReason: freshness.reason,
    },
  }
}
