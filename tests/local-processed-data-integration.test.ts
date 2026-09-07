import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publishLocalProcessedData } from '../server/localProcessedData.ts'
import { loadLatestProcessedData, buildProcessedSleepHealthContext } from '../server/processedData.ts'
import type { HealthImportConfig } from '../server/config.ts'
import { createHealthExportWatcher } from '../server/watchHealthExports.ts'
import { validateCompletedSnapshot } from '../processor/snapshot.ts'

const root = await mkdtemp(join(tmpdir(), 'sleep-compass-local-processed-data-'))

try {
  const rawRoot = join(root, 'raw')
  const processedDataDir = join(root, 'processed')
  const config: HealthImportConfig = {
    watchDir: rawRoot,
    watchEnabled: false,
    startupScanEnabled: false,
    serverHost: '127.0.0.1',
    serverPort: 0,
    scanIntervalMs: 60_000,
    usePolling: false,
    pollIntervalMs: 1_000,
    awaitWriteStabilityMs: 1_000,
    dataDir: join(root, 'legacy-data'),
    processedDataDir,
    processedDataBackupDir: null,
  }

  await mkdir(rawRoot, { recursive: true })
  await writeFile(join(rawRoot, 'sleep.json'), JSON.stringify(createSyntheticInput()), 'utf8')

  const publication = await publishLocalProcessedData(config)
  assert.equal(publication.inputFileCount, 1)
  assert.equal(publication.processedFileCount, 1)
  assert.equal(publication.failedFileCount, 0)
  assert.equal(publication.sleepRecordCount, 2)
  assert.equal(publication.healthMetricCount, 2)

  const runtime = await loadLatestProcessedData(processedDataDir)
  assert.ok(runtime)
  assert.equal(runtime.snapshotId, publication.snapshotId)
  assert.equal(runtime.records.length, 2)
  assert.equal(runtime.latestImport?.importedFileName, 'sleep.json')
  assert.equal(runtime.inputFiles[0]?.status, 'processed')
  assert.ok(runtime.healthMetrics.some((metric) => metric.metricName === 'step_count'))
  assert.ok(runtime.healthMetrics.some((metric) => metric.metricName === 'heart_rate'))

  const snapshotDir = join(processedDataDir, 'snapshots', publication.snapshotId)
  await validateCompletedSnapshot(snapshotDir)
  const context = buildProcessedSleepHealthContext(runtime)
  assert.equal(context.length, 1)
  assert.equal(context[0]?.sleepDay, '2026-08-23')
  assert.equal(context[0]?.dataAvailability.hasDailyActivityMetrics, true)
  assert.equal(context[0]?.dataAvailability.hasSleepWindowMetrics, true)

  let watcherPublicationCount = 0
  const watcherConfig: HealthImportConfig = {
    ...config,
    watchEnabled: true,
    startupScanEnabled: true,
    dataDir: join(root, 'watcher-data'),
    processedDataDir: join(root, 'watcher-processed'),
  }
  const watcher = createHealthExportWatcher(
    watcherConfig,
    async () => ({
      importedAt: '2026-08-26T00:00:00.000Z',
      state: {
        latestImport: {
          readFileCount: 1,
          normalizedCount: 2,
          newRecordCount: 2,
          duplicateSkippedCount: 0,
          rejectedRows: 0,
          warningCount: 0,
        },
      },
    }),
    {
      onProcessedDataReady: async () => {
        watcherPublicationCount += 1
        await publishLocalProcessedData(watcherConfig)
      },
    },
  )
  try {
    await watcher.start()
    assert.ok(watcherPublicationCount >= 1)
    const watcherRuntime = await loadLatestProcessedData(watcherConfig.processedDataDir)
    assert.ok(watcherRuntime)
    assert.equal(watcherRuntime.records.length, 2)
  } finally {
    await watcher.stop()
  }

  console.log('local processed-data integration tests passed')
} finally {
  await rm(root, { recursive: true, force: true })
}

function createSyntheticInput(): unknown {
  return {
    metrics: [
      {
        name: 'sleep_analysis',
        data: [
          {
            startDate: '2026-08-23T23:00:00+09:00',
            endDate: '2026-08-24T01:00:00+09:00',
            value: 'Core',
            sourceName: 'Synthetic Watch',
          },
          {
            startDate: '2026-08-24T01:00:00+09:00',
            endDate: '2026-08-24T02:00:00+09:00',
            value: 'REM',
            sourceName: 'Synthetic Watch',
          },
        ],
      },
      {
        name: 'step_count',
        data: [{ date: '2026-08-23T12:00:00+09:00', qty: 100, source: 'Synthetic Watch' }],
      },
      {
        name: 'heart_rate',
        data: [
          {
            start: '2026-08-24T00:30:00+09:00',
            end: '2026-08-24T00:35:00+09:00',
            Avg: 60,
            Min: 55,
            Max: 70,
            source: 'Synthetic Watch',
          },
        ],
      },
    ],
  }
}
