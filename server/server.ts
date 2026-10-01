import { createServer, type ServerResponse } from 'node:http'
import { loadHealthImportConfig } from './config.ts'
import { loadHealthStore, loadHealthStoreWithStatus } from './healthStore.ts'
import { createHealthExportWatcher } from './watchHealthExports.ts'
import { loadProcessedFiles } from './processedFiles.ts'
import {
  filterProcessedRecords,
  filterProcessedSleepHealthContext,
  getSleepDayKeyForRecord,
  loadLatestProcessedData,
  parseProcessedDataQuery,
  type ProcessedDataQuery,
  type ProcessedDataRange,
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
      const queryResult = parseProcessedDataQuery(
        url.searchParams,
        processed?.processingConfig.sleepDayBoundaryHour ?? 18,
      )
      if (queryResult.query === null) {
        sendJson(response, { error: queryResult.error }, 400)
        return
      }
      if (processed) {
        const filtered = filterProcessedRecords(processed, queryResult.query)
        sendJson(response, {
          generatedAt: processed.generatedAt,
          records: filtered.records,
          warnings: processed.warnings,
          latestImport: processed.latestImport,
          dataSource: 'processed_data',
          snapshotId: processed.snapshotId,
          dataVersion: processed.snapshotId,
          range: filtered.range,
        })
        return
      }

      const store = await loadHealthStore(config.dataDir)
      const legacyQuery = queryResult.query
      const legacyRecords = legacyQuery.month === null && legacyQuery.days === null
        ? store.records
        : filterLegacyRecords(store.records, legacyQuery)
      const legacySleepDays = selectLegacySleepDays(store.records, legacyQuery)
      sendJson(response, {
        generatedAt: store.generatedAt,
        records: legacyRecords,
        warnings: store.warnings,
        latestImport: store.latestImport,
        dataSource: 'legacy_health_store',
        snapshotId: null,
        dataVersion: store.generatedAt ?? null,
        range: {
          type: legacyQuery.month !== null ? 'month' : legacyQuery.days !== null ? 'days' : 'all',
          month: legacyQuery.month,
          days: legacyQuery.days,
          boundaryHour: legacyQuery.boundaryHour,
          sleepDayCount: legacySleepDays.length,
          firstSleepDay: legacySleepDays.at(-1) ?? null,
          lastSleepDay: legacySleepDays[0] ?? null,
          recordCount: legacyRecords.length,
        },
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
      const compact = url.searchParams.get('compact') === '1'
      // The compact polling path only needs legacy state when no completed
      // processed snapshot is available. Avoid rereading the large legacy
      // store on every status poll once processed data is active.
      const store = processed && compact
        ? null
        : await loadHealthStoreWithStatus(config.dataDir)
      const raw = await getRawStatus()
      const freshness = assessProcessedDataFreshness(raw, processed, rawStatusError)

      if (compact) {
        sendJson(response, {
          ...watcher.status,
          watchEnabled: config.watchEnabled,
          startupScanEnabled: config.startupScanEnabled,
          latestImport: processed?.latestImport ?? store?.state.latestImport ?? null,
          dataSource: processed ? 'processed_data' : 'legacy_health_store',
          snapshotId: processed?.snapshotId ?? null,
          dataVersion: processed?.snapshotId ?? store?.state.generatedAt ?? null,
          processedDataSnapshotId: processed?.snapshotId ?? null,
          generatedAt: processed?.generatedAt ?? store?.state.generatedAt ?? null,
          processedDataGeneratedAt: processed?.generatedAt ?? null,
          latestSleepDay: getLatestSleepDay(processed),
          latestAvailableMonth: getLatestSleepDay(processed)?.slice(0, 7) ?? null,
          rawFileCount: raw.fileCount,
          latestRawFileName: raw.latestFileName,
          latestRawFileModifiedAt: raw.latestModifiedAt,
          rawStatusError,
          processedDataFreshness: freshness.status,
          processedDataStaleReason: freshness.reason,
        })
        return
      }

      const processedFiles = await loadProcessedFiles(config.dataDir, config.watchDir)
      const fullStore = store!
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
        healthStoreLoadStatus: fullStore.status,
        latestImport: processed?.latestImport ?? fullStore.state.latestImport,
        importHistory: fullStore.state.importHistory,
        processedFiles: processedFiles.files.slice(0, 20),
        processedFileCount: processedFiles.files.length,
        dataSource: processed ? 'processed_data' : 'legacy_health_store',
        snapshotId: processed?.snapshotId ?? null,
        dataVersion: processed?.snapshotId ?? fullStore.state.generatedAt ?? null,
        processedDataSnapshotId: processed?.snapshotId ?? null,
        processedDataGeneratedAt: processed?.generatedAt ?? null,
        latestSleepDay: getLatestSleepDay(processed),
        latestAvailableMonth: getLatestSleepDay(processed)?.slice(0, 7) ?? null,
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
      const queryResult = parseProcessedDataQuery(
        url.searchParams,
        processed?.processingConfig.sleepDayBoundaryHour ?? 18,
      )
      if (queryResult.query === null) {
        sendJson(response, { error: queryResult.error }, 400)
        return
      }
      const filtered = processed
        ? filterProcessedSleepHealthContext(processed, {
            ...queryResult.query,
            boundaryHour: processed.processingConfig.sleepDayBoundaryHour,
          })
        : { days: [], range: emptyRange(queryResult.query) }
      sendJson(response, {
        boundaryHour: processed?.processingConfig.sleepDayBoundaryHour ?? queryResult.query.boundaryHour,
        requestedBoundaryHour: queryResult.query.boundaryHour,
        contextBoundaryHour: processed?.processingConfig.sleepDayBoundaryHour ?? null,
        boundaryMismatch: processed
          ? queryResult.query.boundaryHour !== processed.processingConfig.sleepDayBoundaryHour
          : false,
        days: filtered.days,
        dataSource: processed ? 'processed_data' : 'legacy_health_store',
        snapshotId: processed?.snapshotId ?? null,
        dataVersion: processed?.snapshotId ?? null,
        range: filtered.range,
      })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/drive-sync-status') {
      const processed = await loadLatestProcessedData(config.processedDataDir)
      const raw = await getRawStatus()
      const freshness = assessProcessedDataFreshness(raw, processed, rawStatusError)
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

function filterLegacyRecords(
  records: Awaited<ReturnType<typeof loadHealthStore>>['records'],
  query: ProcessedDataQuery,
) {
  const sleepDays = Array.from(new Set(records
    .map((record) => getSleepDayKeyForRecord(record, 'Asia/Tokyo', query.boundaryHour))
    .filter((value): value is string => Boolean(value))))
    .sort((left, right) => right.localeCompare(left))
  const selected = query.month !== null
    ? new Set(sleepDays.filter((sleepDay) => sleepDay.startsWith(`${query.month}-`)))
    : new Set(sleepDays.slice(0, query.days ?? sleepDays.length))

  return records.filter((record) => {
    const sleepDay = getSleepDayKeyForRecord(record, 'Asia/Tokyo', query.boundaryHour)
    return sleepDay !== null && selected.has(sleepDay)
  })
}

function selectLegacySleepDays(
  records: Awaited<ReturnType<typeof loadHealthStore>>['records'],
  query: ProcessedDataQuery,
): string[] {
  const sleepDays = Array.from(new Set(records
    .map((record) => getSleepDayKeyForRecord(record, 'Asia/Tokyo', query.boundaryHour))
    .filter((value): value is string => Boolean(value))))
    .sort((left, right) => right.localeCompare(left))
  if (query.month !== null) return sleepDays.filter((sleepDay) => sleepDay.startsWith(`${query.month}-`))
  return query.days === null ? sleepDays : sleepDays.slice(0, query.days)
}

function emptyRange(query: ProcessedDataQuery): ProcessedDataRange {
  return {
    type: query.month !== null ? 'month' : query.days !== null ? 'days' : 'all',
    month: query.month,
    days: query.days,
    boundaryHour: query.boundaryHour,
    sleepDayCount: 0,
    firstSleepDay: null,
    lastSleepDay: null,
    contextCount: 0,
  }
}

function getLatestSleepDay(processed: Awaited<ReturnType<typeof loadLatestProcessedData>>): string | null {
  if (!processed) return null
  return processed.sleepDays
    .map((day) => typeof day.sleepDay === 'string' ? day.sleepDay : null)
    .filter((day): day is string => day !== null)
    .sort((left, right) => right.localeCompare(left))[0] ?? null
}

async function reconcileProcessedData(): Promise<void> {
  const processed = await loadLatestProcessedData(config.processedDataDir).catch(() => null)
  const raw = await refreshRawStatus()

  if (!processed || raw.fileCount !== processed.inputFiles.length) {
    await publishProcessedData()
    return
  }

  const freshness = assessProcessedDataFreshness(raw, processed, rawStatusError)
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
  const freshness = assessProcessedDataFreshness(raw, processed, rawStatusError)
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
