import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createLocalMigrationEvidence,
  mergeMigrationEvidence,
} from '../processor/localMigrationEvidence.ts'
import type { MigrationEvidenceV1 } from '../processor/migration.ts'

const root = await mkdtemp(join(tmpdir(), 'sleep-compass-o12e-local-'))

try {
  const absentDataDir = join(root, 'absent-state')
  const absentEvidenceRoot = join(root, 'absent-evidence')
  const absent = await createLocalMigrationEvidence({
    dataDir: absentDataDir,
    evidenceRoot: absentEvidenceRoot,
  })
  assert.equal(absent.sources.length, 2)
  assert.ok(absent.sources.every((source) => source.presence === 'absent'))

  const dataDir = join(root, 'state')
  const evidenceRoot = join(root, 'evidence')
  await mkdir(dataDir, { recursive: true })
  await writeFile(
    join(dataDir, 'health-store.json'),
    JSON.stringify({
      records: [
        {
          start: '2026-08-23T23:00:00+09:00',
          end: '2026-08-24T01:00:00+09:00',
          durationMinutes: 120,
          stage: 'asleep_core',
          originalValue: 'Core',
          sourceKey: 'synthetic_watch',
          sourceFormat: 'health_auto_export_json',
        },
      ],
    }),
    'utf8',
  )
  await writeFile(
    join(dataDir, 'processed-files.json'),
    JSON.stringify({ files: [{ relativePath: 'sleep.json' }] }),
    'utf8',
  )

  const present = await createLocalMigrationEvidence({ dataDir, evidenceRoot })
  const healthStore = present.sources.find((source) => source.dataset === 'health-store')
  const processedFiles = present.sources.find((source) => source.dataset === 'processed-files')
  assert.equal(healthStore?.presence, 'present')
  assert.equal(healthStore?.classification, 'rebuild')
  assert.equal(healthStore?.sourceCount, 1)
  assert.match(healthStore?.semanticSha256 ?? '', /^[a-f0-9]{64}$/)
  assert.equal(processedFiles?.presence, 'present')
  assert.equal(processedFiles?.classification, 'archive')
  assert.equal(processedFiles?.sourceCount, 1)
  assert.ok(healthStore?.archiveArtifact)
  assert.ok(processedFiles?.archiveArtifact)
  await readFile(join(evidenceRoot, healthStore!.archiveArtifact!.relativePath))
  await readFile(join(evidenceRoot, processedFiles!.archiveArtifact!.relativePath))

  const cloud: MigrationEvidenceV1 = {
    evidenceVersion: '1',
    generatedAt: '2026-08-24T00:00:00Z',
    sources: [
      {
        sourceSystem: 'firestore',
        dataset: 'sleep_records',
        classification: 'rebuild',
        presence: 'absent',
        sourceCount: 0,
      },
    ],
  }
  const merged = mergeMigrationEvidence(present, cloud)
  assert.equal(merged.sources.length, 3)
  assert.throws(() => mergeMigrationEvidence(present, present))

  console.log('processor local migration evidence tests passed')
} finally {
  await rm(root, { recursive: true, force: true })
}
