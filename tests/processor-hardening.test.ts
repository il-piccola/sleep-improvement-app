import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadHealthImportConfig } from '../server/config.ts'
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
  await testImmutableSnapshotPublication()
  await testDirectoryProcessorEndToEnd()
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

  const input = {
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
  await writeFile(join(rawRoot, 'sleep.json'), JSON.stringify(input), 'utf8')

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
