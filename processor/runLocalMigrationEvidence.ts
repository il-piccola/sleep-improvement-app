import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  createLocalMigrationEvidence,
  mergeMigrationEvidence,
} from './localMigrationEvidence.ts'
import { loadMigrationEvidence } from './migration.ts'

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

const dataDir = values.get('--data-dir')
const evidenceRoot = values.get('--evidence-root')
const output = values.get('--output')

if (!dataDir || !evidenceRoot || !output) {
  console.error(
    'Usage: npm run migration:local-evidence -- --data-dir <dir> --evidence-root <dir> --output <json> [--cloud-evidence <json>]',
  )
  process.exitCode = 2
} else {
  try {
    const root = resolve(evidenceRoot)
    const local = await createLocalMigrationEvidence({
      dataDir: resolve(dataDir),
      evidenceRoot: root,
    })
    const cloudEvidencePath = values.get('--cloud-evidence')
    const merged = cloudEvidencePath
      ? mergeMigrationEvidence(local, await loadMigrationEvidence(resolve(cloudEvidencePath)))
      : local
    const outputPath = resolve(output)
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8')

    const copy = JSON.parse(await readFile(outputPath, 'utf8')) as { sources?: unknown[] }
    console.log(
      JSON.stringify(
        {
          outputCreated: true,
          sourceEvidenceCount: Array.isArray(copy.sources) ? copy.sources.length : 0,
          cloudEvidenceMerged: Boolean(cloudEvidencePath),
        },
        null,
        2,
      ),
    )
  } catch (error) {
    console.error(`Local migration evidence failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
