import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import {
  MIGRATION_EVIDENCE_VERSION,
  computeSleepRecordSemanticSha256,
  validateMigrationEvidence,
  type MigrationArchiveArtifact,
  type MigrationEvidenceSource,
  type MigrationEvidenceV1,
} from './migration.ts'

export async function createLocalMigrationEvidence({
  dataDir,
  evidenceRoot,
}: {
  dataDir: string
  evidenceRoot: string
}): Promise<MigrationEvidenceV1> {
  const healthStore = await inspectLocalJsonState({
    dataDir,
    evidenceRoot,
    fileName: 'health-store.json',
    dataset: 'health-store',
    countField: 'records',
    classification: 'rebuild',
    semanticHash: (value) => computeSleepRecordSemanticSha256(getArrayField(value, 'records')),
  })
  const processedFiles = await inspectLocalJsonState({
    dataDir,
    evidenceRoot,
    fileName: 'processed-files.json',
    dataset: 'processed-files',
    countField: 'files',
    classification: 'archive',
  })

  return {
    evidenceVersion: MIGRATION_EVIDENCE_VERSION,
    generatedAt: new Date().toISOString(),
    sources: [healthStore, processedFiles],
  }
}

export function mergeMigrationEvidence(
  ...documents: MigrationEvidenceV1[]
): MigrationEvidenceV1 {
  const sources = new Map<string, MigrationEvidenceSource>()

  for (const document of documents) {
    for (const source of document.sources) {
      const key = `${source.sourceSystem}:${source.dataset}`
      if (sources.has(key)) {
        throw new Error(`Duplicate migration evidence source: ${key}`)
      }
      sources.set(key, source)
    }
  }

  return validateMigrationEvidence({
    evidenceVersion: MIGRATION_EVIDENCE_VERSION,
    generatedAt: new Date().toISOString(),
    sources: Array.from(sources.values()).sort((left, right) =>
      `${left.sourceSystem}:${left.dataset}`.localeCompare(`${right.sourceSystem}:${right.dataset}`),
    ),
  })
}

async function inspectLocalJsonState({
  classification,
  countField,
  dataDir,
  dataset,
  evidenceRoot,
  fileName,
  semanticHash,
}: {
  classification: 'rebuild' | 'archive'
  countField: string
  dataDir: string
  dataset: string
  evidenceRoot: string
  fileName: string
  semanticHash?: (value: unknown) => string
}): Promise<MigrationEvidenceSource> {
  const primary = resolve(dataDir, fileName)
  const backup = `${primary}.bak`
  const selected = await selectReadableJson(primary, backup)

  if (!selected) {
    return {
      sourceSystem: 'legacy-local',
      dataset,
      classification,
      presence: 'absent',
      sourceCount: 0,
    }
  }

  const parsed = JSON.parse(await readFile(selected, 'utf8')) as unknown
  const sourceCount = getArrayField(parsed, countField).length
  const artifact = await archiveLocalStateFile({
    sourcePath: selected,
    evidenceRoot,
    targetName: basename(selected),
  })

  return {
    sourceSystem: 'legacy-local',
    dataset,
    classification,
    presence: 'present',
    sourceCount,
    ...(semanticHash ? { semanticSha256: semanticHash(parsed) } : {}),
    archiveArtifact: artifact,
  }
}

async function selectReadableJson(primary: string, backup: string): Promise<string | null> {
  const primaryState = await inspectJson(primary)
  if (primaryState === 'valid') return primary
  const backupState = await inspectJson(backup)
  if (backupState === 'valid') return backup

  if (primaryState === 'missing' && backupState === 'missing') return null
  throw new Error(`Local migration state is present but unreadable: ${basename(primary)}`)
}

async function inspectJson(path: string): Promise<'valid' | 'invalid' | 'missing'> {
  try {
    JSON.parse(await readFile(path, 'utf8'))
    return 'valid'
  } catch (error) {
    if (isMissing(error)) return 'missing'
    if (error instanceof SyntaxError) return 'invalid'
    throw error
  }
}

async function archiveLocalStateFile({
  evidenceRoot,
  sourcePath,
  targetName,
}: {
  evidenceRoot: string
  sourcePath: string
  targetName: string
}): Promise<MigrationArchiveArtifact> {
  const relativePath = `legacy-local/${targetName}`
  const targetPath = join(resolve(evidenceRoot), relativePath)
  await mkdir(join(resolve(evidenceRoot), 'legacy-local'), { recursive: true })
  await copyFile(sourcePath, targetPath)
  const bytes = await readFile(targetPath)
  const metadata = await stat(targetPath)
  return {
    relativePath,
    byteLength: metadata.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

function getArrayField(value: unknown, field: string): unknown[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const candidate = (value as Record<string, unknown>)[field]
  return Array.isArray(candidate) ? candidate : []
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    String((error as { code?: unknown }).code) === 'ENOENT'
}
