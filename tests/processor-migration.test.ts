import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { processHealthExportDirectory } from '../processor/processDirectory.ts'
import {
  buildMigrationManifest,
  computeHealthMetricSemanticSha256,
  computeSleepRecordSemanticSha256,
  createMigrationSnapshot,
  validateMigrationEvidence,
  type MigrationEvidenceV1,
} from '../processor/migration.ts'
import { validateCompletedSnapshot } from '../processor/snapshot.ts'

const root = await mkdtemp(join(tmpdir(), 'sleep-compass-o12e-'))

try {
  const rawRoot = join(root, 'raw')
  const processedDataRoot = join(root, 'processed')
  const migrationProcessedRoot = join(root, 'migration-processed')
  const evidenceRoot = join(root, 'evidence')
  const backupRoot = join(root, 'backup')
  await mkdir(rawRoot, { recursive: true })
  await mkdir(evidenceRoot, { recursive: true })
  await writeFile(join(rawRoot, 'sleep.json'), JSON.stringify(createSyntheticInput()), 'utf8')

  const source = await processHealthExportDirectory({
    rawRoot,
    processedDataRoot,
    snapshotId: '20260824T010000Z-o12e-source',
    processorRevision: 'synthetic',
  })
  await validateCompletedSnapshot(source.published.snapshotDir)

  const sleepRecords = await readJsonl(join(source.published.snapshotDir, 'sleep-records.jsonl'))
  const healthMetrics = await readJsonl(join(source.published.snapshotDir, 'health-metrics.jsonl'))
  const evidence = await createCompleteEvidence({ evidenceRoot, sleepRecords, healthMetrics })

  const manifest = await buildMigrationManifest({
    evidence,
    evidenceRoot,
    migrationId: 'mig-synthetic-complete',
    sourceSnapshotDir: source.published.snapshotDir,
  })
  assert.equal(manifest.status, 'completed')
  assert.deepEqual(manifest.unresolved, [])
  assert.equal(
    manifest.sources.find((item) => item.dataset === 'sleep_records')?.parity,
    'matched',
  )
  assert.equal(
    manifest.sources.find((item) => item.dataset === 'health_metric_records')?.parity,
    'matched',
  )

  const migrated = await createMigrationSnapshot({
    sourceSnapshotDir: source.published.snapshotDir,
    processedDataRoot: migrationProcessedRoot,
    backupRoot,
    evidence,
    evidenceRoot,
    migrationId: 'mig-synthetic-complete',
    snapshotId: '20260824T010100Z-o12e-final',
  })
  assert.equal(migrated.migrationManifest.status, 'completed')
  await validateCompletedSnapshot(migrated.published.snapshotDir)
  assert.ok(migrated.published.backupDir)
  await validateCompletedSnapshot(migrated.published.backupDir!)
  const migrationManifest = JSON.parse(
    await readFile(join(migrated.published.snapshotDir, 'migration-manifest.json'), 'utf8'),
  ) as { status?: string; unresolved?: unknown[] }
  assert.equal(migrationManifest.status, 'completed')
  assert.deepEqual(migrationManifest.unresolved, [])

  const missingEvidence: MigrationEvidenceV1 = {
    ...evidence,
    sources: evidence.sources.filter((source) => source.dataset !== 'drive_sync_runs'),
  }
  const missingManifest = await buildMigrationManifest({
    evidence: missingEvidence,
    evidenceRoot,
    migrationId: 'mig-missing-evidence',
    sourceSnapshotDir: source.published.snapshotDir,
  })
  assert.equal(missingManifest.status, 'blocked')
  assert.ok(missingManifest.unresolved.some((item) => item.includes('firestore:drive_sync_runs')))

  const mismatchEvidence: MigrationEvidenceV1 = {
    ...evidence,
    sources: evidence.sources.map((source) =>
      source.dataset === 'sleep_records'
        ? { ...source, semanticSha256: '0'.repeat(64) }
        : source,
    ),
  }
  const mismatchManifest = await buildMigrationManifest({
    evidence: mismatchEvidence,
    evidenceRoot,
    migrationId: 'mig-mismatch',
    sourceSnapshotDir: source.published.snapshotDir,
  })
  assert.equal(mismatchManifest.status, 'blocked')
  assert.ok(mismatchManifest.unresolved.some((item) => item.includes('REBUILD_PARITY_MISMATCH')))

  assert.throws(
    () => validateMigrationEvidence({ evidenceVersion: '1', generatedAt: 'x', sources: [{ dataset: 'x' }] }),
  )

  console.log('processor migration tests passed')
} finally {
  await rm(root, { recursive: true, force: true })
}

async function createCompleteEvidence({
  evidenceRoot,
  sleepRecords,
  healthMetrics,
}: {
  evidenceRoot: string
  sleepRecords: unknown[]
  healthMetrics: unknown[]
}): Promise<MigrationEvidenceV1> {
  const archiveDatasets = [
    'processed_drive_files',
    'drive_sync_runs',
    'ingest_batches',
    'metric_audit_summaries',
  ]
  const archiveEntries = []

  for (const dataset of archiveDatasets) {
    const relativePath = `firestore-archive/${dataset}.jsonl`
    const path = join(evidenceRoot, relativePath)
    await mkdir(join(evidenceRoot, 'firestore-archive'), { recursive: true })
    const body = `${JSON.stringify({ dataset, synthetic: true })}\n`
    await writeFile(path, body, 'utf8')
    archiveEntries.push({
      sourceSystem: 'firestore' as const,
      dataset,
      classification: 'archive' as const,
      presence: 'present' as const,
      sourceCount: 1,
      archiveArtifact: {
        relativePath,
        byteLength: Buffer.byteLength(body),
        sha256: createHash('sha256').update(body).digest('hex'),
      },
    })
  }

  return {
    evidenceVersion: '1',
    generatedAt: '2026-08-24T01:00:00.000Z',
    sources: [
      {
        sourceSystem: 'legacy-local',
        dataset: 'health-store',
        classification: 'migrate',
        presence: 'absent',
        sourceCount: 0,
      },
      {
        sourceSystem: 'legacy-local',
        dataset: 'processed-files',
        classification: 'archive',
        presence: 'absent',
        sourceCount: 0,
      },
      {
        sourceSystem: 'firestore',
        dataset: 'sleep_records',
        classification: 'rebuild',
        presence: sleepRecords.length > 0 ? 'present' : 'absent',
        sourceCount: sleepRecords.length,
        semanticSha256: computeSleepRecordSemanticSha256(sleepRecords),
      },
      {
        sourceSystem: 'firestore',
        dataset: 'health_metric_records',
        classification: 'rebuild',
        presence: healthMetrics.length > 0 ? 'present' : 'absent',
        sourceCount: healthMetrics.length,
        semanticSha256: computeHealthMetricSemanticSha256(healthMetrics),
      },
      ...archiveEntries,
    ],
  }
}

async function readJsonl(path: string): Promise<unknown[]> {
  const text = await readFile(path, 'utf8')
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line) as unknown)
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
