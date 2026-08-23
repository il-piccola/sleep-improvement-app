import { resolve } from 'node:path'
import {
  createMigrationSnapshot,
  getMigrationEvidenceRoot,
  loadMigrationEvidence,
} from './migration.ts'

const args = process.argv.slice(2)
const values = new Map<string, string>()

for (let index = 0; index < args.length; index += 1) {
  const key = args[index]
  const value = args[index + 1]
  if (key?.startsWith('--') && value && !value.startsWith('--')) {
    values.set(key, value)
    index += 1
  }
}

const sourceSnapshotDir = values.get('--source-snapshot')
const processedDataRoot = values.get('--processed-data-root')
const evidencePath = values.get('--evidence')

if (!sourceSnapshotDir || !processedDataRoot || !evidencePath) {
  console.error(
    'Usage: npm run migration:finalize -- --source-snapshot <dir> --processed-data-root <dir> --evidence <json> [--backup-root <dir>] [--snapshot-id <id>] [--migration-id <id>]',
  )
  process.exitCode = 2
} else {
  try {
    const evidenceFile = resolve(evidencePath)
    const evidence = await loadMigrationEvidence(evidenceFile)
    const result = await createMigrationSnapshot({
      sourceSnapshotDir: resolve(sourceSnapshotDir),
      processedDataRoot: resolve(processedDataRoot),
      evidence,
      evidenceRoot: getMigrationEvidenceRoot(evidenceFile),
      migrationId: values.get('--migration-id') ?? `mig-${new Date().toISOString().replace(/[-:.]/g, '')}`,
      ...(values.get('--backup-root') ? { backupRoot: resolve(values.get('--backup-root')!) } : {}),
      ...(values.get('--snapshot-id') ? { snapshotId: values.get('--snapshot-id')! } : {}),
    })

    console.log(
      JSON.stringify(
        {
          snapshotId: result.published.snapshotId,
          migrationStatus: result.migrationManifest.status,
          unresolvedCount: result.migrationManifest.unresolved.length,
          sourceEvidenceCount: result.migrationManifest.sources.length,
          backupCreated: Boolean(result.published.backupDir),
        },
        null,
        2,
      ),
    )

    if (result.migrationManifest.status === 'blocked') {
      process.exitCode = 3
    }
  } catch (error) {
    console.error(`Migration finalize failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
