import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadHealthImportConfig } from '../server/config.ts'
import { createHealthExportWatcher } from '../server/watchHealthExports.ts'
import {
  JsonStateCorruptionError,
  getBackupPath,
  loadJsonState,
  writeJsonStateAtomic,
} from '../server/safeJsonFile.ts'
import {
  addContentHash,
  currentImporterVersion,
  getFileMetadata,
  hasProcessedFile,
  hasProcessedFileMetadata,
  loadProcessedFiles,
  saveProcessedFile,
} from '../server/processedFiles.ts'
import { processHealthExportDirectory } from '../processor/processDirectory.ts'
import {
  publishProcessedSnapshot,
  validateCompletedSnapshot,
} from '../processor/snapshot.ts'
import {
  DEFAULT_PROCESSOR_CONFIG,
  PROCESSOR_IDENTITY_POLICY_VERSION,
} from '../processor/types.ts'

const root = await mkdtemp(join(tmpdir(), 'sleep-compass-o12d-'))

try {
  await testRecoverableJsonState()
  await testPortableMetadataFirstLedger()
  testPortableConfig()
  await testStandaloneWatcherRescan()
  await testImmutableSnapshotPublication()
  await testDirectoryProcessorEndToEnd()
  await testIncrementalProcessorCache()
  console.log('processor hardening tests passed')
} finally {
  await rm(root, { recursive: true, force: true })
}

async function testRecoverableJsonState(): Promise<void> {
  const path = join(root, 'state', 'health-store.json')
  const validate = (value: unknown): { version: number } | null =>
    value && typeof value === 'object' && !Array.isArray(value) &&
    typeof (value as { version?: unknown }).version === 'number'
      ? (value as { version: number })
      : null

  await writeJsonStateAtomic(path, { version: 1 })
  await writeJsonStateAtomic(path, { version: 2 })
  await writeFile(path, '{broken', 'utf8')

  const recovered = await loadJsonState({ path, defaultValue: { version: 0 }, validate })
  assert.equal(recovered.status, 'recovered_from_backup')
  assert.equal(recovered.value.version, 1)
  assert.equal(JSON.parse(await readFile(path, 'utf8')).version, 1)

  await writeFile(path, '{broken-again', 'utf8')
  await writeFile(getBackupPath(path), '{also-broken', 'utf8')
  await assert.rejects(
    () => loadJsonState({ path, defaultValue: { version: 0 }, validate }),
    JsonStateCorruptionError,
  )
}

async function testPortableMetadataFirstLedger(): Promise<void> {
  const rawRoot = join(root, 'raw-ledger')
  const dataDir = join(root, 'ledger-state')
  const filePath = join(rawRoot, 'nested', 'sample.json')
  await mkdir(join(rawRoot, 'nested'), { recursive: true })
  await writeFile(filePath, '{"ok":true}\n', 'utf8')

  const metadata = await getFileMetadata(filePath, rawRoot)
  assert.equal(metadata.relativePath, 'nested/sample.json')
  assert.equal(await hasProcessedFileMetadata(dataDir, metadata, rawRoot), false)

  const fingerprint = await addContentHash(filePath, metadata)
  await saveProcessedFile(
    dataDir,
    {
      ...fingerprint,
      importerVersion: currentImporterVersion,
      processedAt: '2026-08-24T00:00:00.000Z',
      status: 'imported',
    },
    rawRoot,
  )
  assert.equal(await hasProcessedFileMetadata(dataDir, metadata, rawRoot), true)

  const later = new Date(Date.now() + 60_000)
  await utimes(filePath, later, later)
  const changedMetadata = await getFileMetadata(filePath, rawRoot)
  assert.equal(await hasProcessedFileMetadata(dataDir, changedMetadata, rawRoot), false)
  const sameContentFingerprint = await addContentHash(filePath, changedMetadata)
  assert.equal(await hasProcessedFile(dataDir, sameContentFingerprint, rawRoot), true)

  const persisted = await readFile(join(dataDir, 'processed-files.json'), 'utf8')
  assert.equal(persisted.includes(rawRoot), false)
  const loaded = await loadProcessedFiles(dataDir, rawRoot)
  assert.equal(loaded.files.length, 1)
  assert.equal(loaded.files[0]?.relativePath, 'nested/sample.json')
}

function testPortableConfig(): void {
  const cwd = join(root, 'config')
  const watchDir = join(root, 'drive', 'Health Auto Export', 'Sleep')
  const dataDir = join(root, 'local-state')
  const processedDataDir = join(root, 'processed-data')
  const backupDir = join(root, 'drive', 'Processed Data Backup')
  const config = loadHealthImportConfig(cwd, {
    HEALTH_EXPORT_WATCH_DIR: watchDir,
    HEALTH_IMPORT_DATA_DIR: dataDir,
    PROCESSED_DATA_DIR: processedDataDir,
    PROCESSED_DATA_BACKUP_DIR: backupDir,
  })

  assert.equal(config.watchDir, watchDir)
  assert.equal(config.dataDir, dataDir)
  assert.equal(config.processedDataDir, processedDataDir)
  assert.equal(config.processedDataBackupDir, backupDir)
  assert.throws(() =>
    loadHealthImportConfig(cwd, {
      HEALTH_EXPORT_WATCH_DIR: watchDir,
      HEALTH_IMPORT_DATA_DIR: join(watchDir, 'state'),
    }),
  )
}

async function testStandaloneWatcherRescan(): Promise<void> {
  const rawRoot = join(root, 'watcher-raw')
  const dataDir = join(root, 'watcher-state')
  await mkdir(rawRoot, { recursive: true })
  await writeFile(join(rawRoot, 'sleep.json'), JSON.stringify(createSyntheticInput()), 'utf8')

  const config = loadHealthImportConfig(join(root, 'watcher-cwd'), {
    HEALTH_EXPORT_WATCH_DIR: rawRoot,
    HEALTH_IMPORT_WATCH_ENABLED: 'false',
    HEALTH_IMPORT_DATA_DIR: dataDir,
    PROCESSED_DATA_DIR: join(root, 'watcher-processed'),
  })
  let importCalls = 0
  const watcher = createHealthExportWatcher(config, async () => {
    importCalls += 1
    return {
      importedAt: '2026-08-24T00:00:00.000Z',
      state: {
        latestImport: {
          readFileCount: 1,
          newRecordCount: 2,
          duplicateSkippedCount: 0,
          rejectedRows: 0,
          warningCount: 0,
        },
      },
    }
  })
  const first = await watcher.rescan()
  assert.equal(first.isWatching, false)
  assert.equal(first.importedCount, 1)
  assert.equal(first.failedCount, 0)
  assert.equal(first.latestStats?.readFileCount, 1)
  assert.equal(importCalls, 1)

  const second = await watcher.rescan()
  assert.equal(second.skippedCount, 1)
  assert.equal(second.latestStats?.readFileCount, 0)
  assert.equal(importCalls, 1)

  const ledger = await loadProcessedFiles(dataDir, rawRoot)
  assert.equal(ledger.files[0]?.relativePath, 'sleep.json')
  assert.equal(JSON.stringify(ledger).includes(rawRoot), false)
}

async function testImmutableSnapshotPublication(): Promise<void> {
  const processedDataRoot = join(root, 'snapshot-local')
  const backupRoot = join(root, 'snapshot-backup')
  const published = await publishProcessedSnapshot({
    snapshotId: '20260824T000000Z-test0001',
    processedDataRoot,
    backupRoot,
    processorVersion: 'test',
    processorRevision: 'synthetic',
    processingConfig: DEFAULT_PROCESSOR_CONFIG,
    identityPolicyVersion: PROCESSOR_IDENTITY_POLICY_VERSION,
    content: {
      inputFiles: [],
      sleepRecords: [],
      sleepBlocks: [],
      sleepDays: [],
      sourceSummaries: [],
      overlaps: [],
      healthMetrics: [],
      diagnostics: {
        status: 'completed',
        inputFileCount: 0,
        processedFileCount: 0,
        failedFileCount: 0,
        sleepRecordCount: 0,
        rejectedRowCount: 0,
        warningCount: 0,
        warnings: [],
      },
    },
  })

  await validateCompletedSnapshot(published.snapshotDir)
  assert.ok(published.backupDir)
  await validateCompletedSnapshot(published.backupDir!)
  await assert.rejects(() =>
    publishProcessedSnapshot({
      snapshotId: '20260824T000000Z-test0001',
      processedDataRoot,
      processorVersion: 'test',
      processingConfig: DEFAULT_PROCESSOR_CONFIG,
      identityPolicyVersion: PROCESSOR_IDENTITY_POLICY_VERSION,
      content: {
        inputFiles: [], sleepRecords: [], sleepBlocks: [], sleepDays: [],
        sourceSummaries: [], overlaps: [], healthMetrics: [], diagnostics: {},
      },
    }),
  )

  await writeFile(join(published.snapshotDir, 'health-metrics.jsonl'), '{"tampered":true}\n', 'utf8')
  await assert.rejects(() => validateCompletedSnapshot(published.snapshotDir))
}

async function testDirectoryProcessorEndToEnd(): Promise<void> {
  const rawRoot = join(root, 'raw-e2e')
  const processedDataRoot = join(root, 'processed-e2e')
  const backupRoot = join(root, 'backup-e2e')
  await mkdir(rawRoot, { recursive: true })
  await writeFile(join(rawRoot, 'sleep.json'), JSON.stringify(createSyntheticInput()), 'utf8')

  const result = await processHealthExportDirectory({
    rawRoot,
    processedDataRoot,
    backupRoot,
    snapshotId: '20260824T000000Z-e2etest1',
    processorRevision: 'synthetic',
  })

  assert.equal(result.inputFileCount, 1)
  assert.equal(result.processedFileCount, 1)
  assert.equal(result.failedFileCount, 0)
  assert.equal(result.sleepRecordCount, 2)
  assert.ok(result.healthMetricCount >= 2)
  await validateCompletedSnapshot(result.published.snapshotDir)
  assert.ok(result.published.backupDir)
  await validateCompletedSnapshot(result.published.backupDir!)

  const snapshotText = await readSnapshotText(result.published.snapshotDir)
  assert.equal(snapshotText.includes(rawRoot), false)
  assert.equal(snapshotText.includes('Health Auto Export\\'), false)
  assert.equal(snapshotText.includes('Health Auto Export/'), false)
}

async function testIncrementalProcessorCache(): Promise<void> {
  const rawRoot = join(root, 'raw-incremental-cache')
  const processedDataRoot = join(root, 'processed-incremental-cache')
  const cacheRoot = join(root, 'processor-cache')
  const firstPath = join(rawRoot, 'sleep.json')
  const secondPath = join(rawRoot, 'nested', 'sleep-corrected.json')
  await mkdir(join(rawRoot, 'nested'), { recursive: true })
  await writeFile(firstPath, JSON.stringify(createSyntheticInput()), 'utf8')

  const first = await processHealthExportDirectory({
    rawRoot,
    processedDataRoot,
    cacheRoot,
    snapshotId: '20260824T000000Z-cache0001',
  })
  assert.equal(first.cacheHitCount, 0)
  assert.equal(first.cacheMissCount, 1)
  assert.equal(first.cacheCorruptionCount, 0)

  const second = await processHealthExportDirectory({
    rawRoot,
    processedDataRoot,
    cacheRoot,
    snapshotId: '20260824T000000Z-cache0002',
  })
  assert.equal(second.cacheHitCount, 1)
  assert.equal(second.cacheMissCount, 0)
  assert.equal(await readSnapshotDatasets(first.published.snapshotDir), await readSnapshotDatasets(second.published.snapshotDir))

  await writeFile(secondPath, JSON.stringify(createSyntheticInput()), 'utf8')
  const added = await processHealthExportDirectory({
    rawRoot,
    processedDataRoot,
    cacheRoot,
    snapshotId: '20260824T000000Z-cache0003',
  })
  assert.equal(added.cacheHitCount, 1)
  assert.equal(added.cacheMissCount, 1)
  assert.equal(added.inputFileCount, 2)

  await rm(firstPath)
  const deleted = await processHealthExportDirectory({
    rawRoot,
    processedDataRoot,
    cacheRoot,
    snapshotId: '20260824T000000Z-cache0004',
  })
  assert.equal(deleted.cacheHitCount, 1)
  assert.equal(deleted.cacheMissCount, 0)
  assert.equal(deleted.inputFileCount, 1)
  assert.equal((await readdir(join(cacheRoot, 'entries'))).filter((file) => file.endsWith('.json')).length, 1)

  const correctedInput = createSyntheticInput() as {
    metrics: Array<{ data: Array<Record<string, unknown>> }>
  }
  correctedInput.metrics[0].data[0].startDate = '2026-08-23T22:30:00+09:00'
  await writeFile(secondPath, JSON.stringify(correctedInput), 'utf8')
  const corrected = await processHealthExportDirectory({
    rawRoot,
    processedDataRoot,
    cacheRoot,
    snapshotId: '20260824T000000Z-cache0005',
  })
  assert.equal(corrected.cacheHitCount, 0)
  assert.equal(corrected.cacheMissCount, 1)
  assert.equal(corrected.sleepRecordCount, 2)
  assert.match(
    await readSnapshotDatasets(corrected.published.snapshotDir),
    /2026-08-23T22:30:00\+09:00/,
  )

  const correctedAgain = await processHealthExportDirectory({
    rawRoot,
    processedDataRoot,
    cacheRoot,
    snapshotId: '20260824T000000Z-cache0005b',
  })
  assert.equal(correctedAgain.cacheHitCount, 1)
  assert.equal(correctedAgain.cacheMissCount, 0)

  const sameMetadata = await stat(secondPath)
  const sameSizeCorrection = createSyntheticInput() as {
    metrics: Array<{ data: Array<Record<string, unknown>> }>
  }
  sameSizeCorrection.metrics[0].data[0].value = 'Deep'
  await writeFile(secondPath, JSON.stringify(sameSizeCorrection), 'utf8')
  await utimes(secondPath, sameMetadata.atime, sameMetadata.mtime)
  const metadataValidated = await processHealthExportDirectory({
    rawRoot,
    processedDataRoot,
    cacheRoot,
    snapshotId: '20260824T000000Z-cache0005c',
  })
  assert.equal(metadataValidated.cacheHitCount, 0)
  assert.equal(metadataValidated.cacheMissCount, 1)

  const shaValidated = await processHealthExportDirectory({
    rawRoot,
    processedDataRoot,
    cacheRoot,
    cacheValidation: 'sha256',
    snapshotId: '20260824T000000Z-cache0005d',
  })
  assert.equal(shaValidated.cacheHitCount, 1)
  assert.equal(shaValidated.cacheMissCount, 0)

  const cacheEntries = await readdir(join(cacheRoot, 'entries'))
  const correctedKey = createHash('sha256').update('nested/sleep-corrected.json').digest('hex')
  const cacheEntry = cacheEntries.find((file) => file === `entry-${correctedKey}.json`)
  assert.ok(cacheEntry)
  await writeFile(join(cacheRoot, 'entries', cacheEntry!), '{broken', 'utf8')
  const recovered = await processHealthExportDirectory({
    rawRoot,
    processedDataRoot,
    cacheRoot,
    snapshotId: '20260824T000000Z-cache0006',
  })
  assert.equal(recovered.cacheHitCount, 0)
  assert.equal(recovered.cacheMissCount, 1)
  assert.equal(recovered.cacheCorruptionCount, 1)
  await validateCompletedSnapshot(recovered.published.snapshotDir)

  const disabledCacheRoot = join(root, 'processor-cache-disabled')
  const disabledFirst = await processHealthExportDirectory({
    rawRoot,
    processedDataRoot: join(root, 'processed-cache-disabled'),
    cacheRoot: disabledCacheRoot,
    cacheEnabled: false,
    snapshotId: '20260824T000000Z-cache0007',
  })
  const disabledSecond = await processHealthExportDirectory({
    rawRoot,
    processedDataRoot: join(root, 'processed-cache-disabled'),
    cacheRoot: disabledCacheRoot,
    cacheEnabled: false,
    snapshotId: '20260824T000000Z-cache0008',
  })
  assert.equal(disabledFirst.cacheMissCount, 1)
  assert.equal(disabledSecond.cacheMissCount, 1)
  await assert.rejects(() => stat(disabledCacheRoot), /ENOENT/)

  const lockedProcessedRoot = join(root, 'processed-cache-lock')
  const concurrent = await Promise.allSettled([
    processHealthExportDirectory({
      rawRoot,
      processedDataRoot: lockedProcessedRoot,
      cacheEnabled: false,
      snapshotId: '20260824T000000Z-cache-lock-a',
    }),
    processHealthExportDirectory({
      rawRoot,
      processedDataRoot: lockedProcessedRoot,
      cacheEnabled: false,
      snapshotId: '20260824T000000Z-cache-lock-b',
    }),
  ])
  assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 1)
  const rejected = concurrent.find((result) => result.status === 'rejected')
  assert.ok(rejected && rejected.status === 'rejected')
  assert.match(String(rejected.reason), /already running/)

  const afterLockRelease = await processHealthExportDirectory({
    rawRoot,
    processedDataRoot: lockedProcessedRoot,
    cacheEnabled: false,
    snapshotId: '20260824T000000Z-cache-lock-c',
  })
  assert.equal(afterLockRelease.inputFileCount, 1)
}

async function readSnapshotDatasets(snapshotDir: string): Promise<string> {
  const files = [
    'input-files.jsonl',
    'sleep-records.jsonl',
    'sleep-blocks.jsonl',
    'sleep-days.jsonl',
    'source-summaries.jsonl',
    'overlaps.jsonl',
    'health-metrics.jsonl',
    'diagnostics.json',
  ]
  return (await Promise.all(files.map((file) => readFile(join(snapshotDir, file), 'utf8')))).join('\n')
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
        data: [{ date: '2026-08-24T12:00:00+09:00', qty: 100, source: 'Synthetic Watch' }],
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

async function readSnapshotText(snapshotDir: string): Promise<string> {
  const files = [
    'manifest.json', 'input-files.jsonl', 'sleep-records.jsonl', 'sleep-blocks.jsonl',
    'sleep-days.jsonl', 'source-summaries.jsonl', 'overlaps.jsonl', 'health-metrics.jsonl',
    'diagnostics.json', 'complete.json',
  ]
  return (
    await Promise.all(files.map((file) => readFile(join(snapshotDir, file), 'utf8')))
  ).join('\n')
}
