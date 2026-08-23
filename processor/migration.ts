import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import {
  publishProcessedSnapshot,
  stableStringify,
  validateCompletedSnapshot,
  type ProcessedSnapshotContent,
  type PublishedSnapshot,
} from './snapshot.ts'

export const MIGRATION_EVIDENCE_VERSION = '1'

export type MigrationClassification = 'rebuild' | 'migrate' | 'archive'
export type MigrationPresence = 'present' | 'absent'
export type MigrationParity = 'matched' | 'different' | 'not_compared' | 'not_applicable'

export type MigrationArchiveArtifact = {
  relativePath: string
  byteLength: number
  sha256: string
}

export type MigrationEvidenceSource = {
  sourceSystem: 'firestore' | 'legacy-local'
  dataset: string
  classification: MigrationClassification
  presence: MigrationPresence
  sourceCount: number
  semanticSha256?: string
  archiveArtifact?: MigrationArchiveArtifact
  targetDataset?: string
  targetCount?: number
  rejectedCount?: number
}

export type MigrationEvidenceV1 = {
  evidenceVersion: typeof MIGRATION_EVIDENCE_VERSION
  generatedAt: string
  sources: MigrationEvidenceSource[]
}

export type MigrationManifestSource = {
  sourceSystem: string
  dataset: string
  classification: MigrationClassification
  presence: MigrationPresence
  sourceCount: number
  targetDataset: string | null
  targetCount: number | null
  rejectedCount: number
  semanticSha256: string | null
  targetSemanticSha256: string | null
  parity: MigrationParity
  archiveArtifact: MigrationArchiveArtifact | null
}

export type MigrationManifestV1 = {
  migrationId: string
  generatedAt: string
  status: 'completed' | 'completed_with_warnings' | 'blocked'
  sourceSnapshotId: string
  sources: MigrationManifestSource[]
  unresolved: string[]
}

export type MigrationSnapshotResult = {
  published: PublishedSnapshot
  migrationManifest: MigrationManifestV1
}

const REQUIRED_EVIDENCE = [
  'legacy-local:health-store',
  'legacy-local:processed-files',
  'firestore:sleep_records',
  'firestore:health_metric_records',
  'firestore:processed_drive_files',
  'firestore:drive_sync_runs',
  'firestore:ingest_batches',
  'firestore:metric_audit_summaries',
] as const

const DEFAULT_TARGETS: Record<string, string | null> = {
  'firestore:sleep_records': 'sleep-records',
  'firestore:health_metric_records': 'health-metrics',
  'firestore:processed_drive_files': null,
  'firestore:drive_sync_runs': null,
  'firestore:ingest_batches': null,
  'firestore:metric_audit_summaries': null,
  'legacy-local:health-store': 'sleep-records',
  'legacy-local:processed-files': null,
}

export async function loadMigrationEvidence(path: string): Promise<MigrationEvidenceV1> {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown
  return validateMigrationEvidence(parsed)
}

export async function verifyMigrationEvidenceArtifacts({
  evidence,
  evidenceRoot,
}: {
  evidence: MigrationEvidenceV1
  evidenceRoot: string
}): Promise<void> {
  for (const source of evidence.sources) {
    const artifact = source.archiveArtifact
    if (!artifact) continue

    const path = resolve(evidenceRoot, artifact.relativePath)
    const root = resolve(evidenceRoot)
    if (path !== root && !path.startsWith(`${root}/`) && !path.startsWith(`${root}\\`)) {
      throw new Error(`Archive artifact escapes evidence root: ${artifact.relativePath}`)
    }

    const metadata = await stat(path)
    if (metadata.size !== artifact.byteLength) {
      throw new Error(`Archive artifact byte length mismatch: ${artifact.relativePath}`)
    }
    const bytes = await readFile(path)
    if (sha256(bytes) !== artifact.sha256) {
      throw new Error(`Archive artifact SHA-256 mismatch: ${artifact.relativePath}`)
    }
  }
}

export async function buildMigrationManifest({
  evidence,
  evidenceRoot,
  migrationId,
  sourceSnapshotDir,
}: {
  evidence: MigrationEvidenceV1
  evidenceRoot: string
  migrationId: string
  sourceSnapshotDir: string
}): Promise<MigrationManifestV1> {
  await verifyMigrationEvidenceArtifacts({ evidence, evidenceRoot })
  const snapshot = await readSnapshotDatasets(sourceSnapshotDir)
  const localSignatures = computeLocalSemanticSignatures(snapshot.content)
  const diagnostics = asRecord(snapshot.content.diagnostics)
  const rejectedCount = getNumber(diagnostics.rejectedRowCount) ?? 0
  const processedInputCount = snapshot.content.inputFiles.filter(
    (value) => asRecord(value).status === 'processed',
  ).length

  const sources: MigrationManifestSource[] = [
    {
      sourceSystem: 'health-auto-export',
      dataset: 'raw-json',
      classification: 'rebuild',
      presence: processedInputCount > 0 ? 'present' : 'absent',
      sourceCount: processedInputCount,
      targetDataset: 'sleep-records',
      targetCount: snapshot.content.sleepRecords.length,
      rejectedCount,
      semanticSha256: null,
      targetSemanticSha256: localSignatures['sleep-records'],
      parity: 'not_applicable',
      archiveArtifact: null,
    },
    {
      sourceSystem: 'health-auto-export',
      dataset: 'raw-health-metrics',
      classification: 'rebuild',
      presence: processedInputCount > 0 ? 'present' : 'absent',
      sourceCount: processedInputCount,
      targetDataset: 'health-metrics',
      targetCount: snapshot.content.healthMetrics.length,
      rejectedCount: 0,
      semanticSha256: null,
      targetSemanticSha256: localSignatures['health-metrics'],
      parity: 'not_applicable',
      archiveArtifact: null,
    },
  ]

  const evidenceByKey = new Map(
    evidence.sources.map((source) => [evidenceKey(source.sourceSystem, source.dataset), source]),
  )
  const unresolved: string[] = []

  for (const required of REQUIRED_EVIDENCE) {
    if (!evidenceByKey.has(required)) {
      unresolved.push(`MISSING_EVIDENCE:${required}`)
    }
  }

  for (const source of [...evidence.sources].sort(compareEvidenceSource)) {
    const key = evidenceKey(source.sourceSystem, source.dataset)
    const targetDataset = source.targetDataset ?? DEFAULT_TARGETS[key] ?? null
    const targetCount = targetDataset ? getDatasetCount(snapshot.content, targetDataset) : source.targetCount ?? null
    const targetSemanticSha256 = targetDataset ? localSignatures[targetDataset] ?? null : null
    const parity = determineParity({ source, targetCount, targetSemanticSha256 })

    if (source.classification === 'archive' && source.presence === 'present' && source.sourceCount > 0 && !source.archiveArtifact) {
      unresolved.push(`ARCHIVE_ARTIFACT_REQUIRED:${key}`)
    }
    if (source.classification === 'migrate' && source.presence === 'present' && targetCount === null) {
      unresolved.push(`MIGRATION_TARGET_REQUIRED:${key}`)
    }
    if (source.classification === 'rebuild' && parity === 'different') {
      unresolved.push(`REBUILD_PARITY_MISMATCH:${key}`)
    }
    if (source.classification === 'rebuild' && parity === 'not_compared' && source.presence === 'present') {
      unresolved.push(`REBUILD_PARITY_NOT_COMPARED:${key}`)
    }

    sources.push({
      sourceSystem: source.sourceSystem,
      dataset: source.dataset,
      classification: source.classification,
      presence: source.presence,
      sourceCount: source.sourceCount,
      targetDataset,
      targetCount,
      rejectedCount: source.rejectedCount ?? 0,
      semanticSha256: source.semanticSha256 ?? null,
      targetSemanticSha256,
      parity,
      archiveArtifact: source.archiveArtifact ?? null,
    })
  }

  const status = unresolved.length > 0
    ? 'blocked'
    : sources.some((source) => source.rejectedCount > 0 || source.parity === 'not_compared')
      ? 'completed_with_warnings'
      : 'completed'

  return {
    migrationId,
    generatedAt: new Date().toISOString(),
    status,
    sourceSnapshotId: snapshot.manifest.snapshotId,
    sources,
    unresolved: [...new Set(unresolved)].sort(),
  }
}

export async function createMigrationSnapshot({
  backupRoot = null,
  evidence,
  evidenceRoot,
  migrationId,
  processedDataRoot,
  snapshotId,
  sourceSnapshotDir,
}: {
  backupRoot?: string | null
  evidence: MigrationEvidenceV1
  evidenceRoot: string
  migrationId: string
  processedDataRoot: string
  snapshotId?: string
  sourceSnapshotDir: string
}): Promise<MigrationSnapshotResult> {
  const snapshot = await readSnapshotDatasets(sourceSnapshotDir)
  const migrationManifest = await buildMigrationManifest({
    evidence,
    evidenceRoot,
    migrationId,
    sourceSnapshotDir,
  })

  const published = await publishProcessedSnapshot({
    ...(snapshotId ? { snapshotId } : {}),
    backupRoot,
    processedDataRoot,
    processorVersion: snapshot.manifest.processorVersion,
    processorRevision: snapshot.manifest.processorRevision,
    processingConfig: snapshot.manifest.processingConfig,
    identityPolicyVersion: snapshot.manifest.identityPolicyVersion,
    content: {
      ...snapshot.content,
      migrationManifest,
    },
  })

  return { published, migrationManifest }
}

export function computeSleepRecordSemanticSha256(records: unknown[]): string {
  return hashProjectedRecords(
    records,
    (record) => {
      const value = asRecord(record)
      return {
        start: value.start ?? null,
        end: value.end ?? null,
        durationMinutes: value.durationMinutes ?? null,
        stage: value.stage ?? null,
        originalValue: value.originalValue ?? null,
        sourceKey: value.sourceKey ?? null,
        sourceFormat: value.sourceFormat ?? null,
      }
    },
  )
}

export function computeHealthMetricSemanticSha256(records: unknown[]): string {
  return hashProjectedRecords(
    records,
    (record) => {
      const value = asRecord(record)
      return {
        metricName: value.metricName ?? null,
        metricGroup: value.metricGroup ?? null,
        aggregation: value.aggregation ?? null,
        granularity: value.granularity ?? null,
        date: value.date ?? null,
        sleepDay: value.sleepDay ?? null,
        sleepDayBoundaryHour: value.sleepDayBoundaryHour ?? null,
        sleepBlockType: value.sleepBlockType ?? null,
        isMainSleep: value.isMainSleep ?? null,
        windowStart: value.windowStart ?? null,
        windowEnd: value.windowEnd ?? null,
        value: value.value ?? null,
        valueAvg: value.valueAvg ?? null,
        valueMin: value.valueMin ?? null,
        valueMax: value.valueMax ?? null,
        valueCount: value.valueCount ?? null,
        unit: value.unit ?? null,
        sourceKey: value.sourceKey ?? null,
      }
    },
  )
}

export function validateMigrationEvidence(value: unknown): MigrationEvidenceV1 {
  const root = asRecord(value)
  if (root.evidenceVersion !== MIGRATION_EVIDENCE_VERSION || typeof root.generatedAt !== 'string' || !Array.isArray(root.sources)) {
    throw new Error('Invalid O-12e migration evidence document')
  }

  const sources = root.sources.map((entry) => validateEvidenceSource(entry))
  const keys = sources.map((source) => evidenceKey(source.sourceSystem, source.dataset))
  if (new Set(keys).size !== keys.length) {
    throw new Error('Migration evidence contains duplicate source entries')
  }

  return {
    evidenceVersion: MIGRATION_EVIDENCE_VERSION,
    generatedAt: root.generatedAt,
    sources,
  }
}

async function readSnapshotDatasets(snapshotDir: string): Promise<{
  manifest: Awaited<ReturnType<typeof validateCompletedSnapshot>>['manifest']
  content: ProcessedSnapshotContent
}> {
  const validated = await validateCompletedSnapshot(snapshotDir)
  const byName = new Map(validated.manifest.datasets.map((dataset) => [dataset.name, dataset]))
  const readJsonl = async (name: string): Promise<unknown[]> => {
    const dataset = byName.get(name)
    if (!dataset) throw new Error(`Snapshot dataset is missing: ${name}`)
    const text = await readFile(join(snapshotDir, dataset.path), 'utf8')
    return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line) as unknown)
  }
  const readJson = async (name: string): Promise<unknown> => {
    const dataset = byName.get(name)
    if (!dataset) throw new Error(`Snapshot dataset is missing: ${name}`)
    return JSON.parse(await readFile(join(snapshotDir, dataset.path), 'utf8')) as unknown
  }

  return {
    manifest: validated.manifest,
    content: {
      inputFiles: await readJsonl('input-files'),
      sleepRecords: await readJsonl('sleep-records'),
      sleepBlocks: await readJsonl('sleep-blocks'),
      sleepDays: await readJsonl('sleep-days'),
      sourceSummaries: await readJsonl('source-summaries'),
      overlaps: await readJsonl('overlaps'),
      healthMetrics: await readJsonl('health-metrics'),
      diagnostics: await readJson('diagnostics'),
    },
  }
}

function computeLocalSemanticSignatures(content: ProcessedSnapshotContent): Record<string, string> {
  return {
    'sleep-records': computeSleepRecordSemanticSha256(content.sleepRecords),
    'health-metrics': computeHealthMetricSemanticSha256(content.healthMetrics),
  }
}

function determineParity({
  source,
  targetCount,
  targetSemanticSha256,
}: {
  source: MigrationEvidenceSource
  targetCount: number | null
  targetSemanticSha256: string | null
}): MigrationParity {
  if (source.classification !== 'rebuild') return 'not_applicable'
  if (targetCount === null) return 'not_compared'
  if (source.sourceCount !== targetCount) return 'different'
  if (source.sourceCount === 0 && targetCount === 0) return 'matched'
  if (!source.semanticSha256 || !targetSemanticSha256) return 'not_compared'
  return source.semanticSha256 === targetSemanticSha256 ? 'matched' : 'different'
}

function getDatasetCount(content: ProcessedSnapshotContent, name: string): number | null {
  if (name === 'sleep-records') return content.sleepRecords.length
  if (name === 'health-metrics') return content.healthMetrics.length
  if (name === 'sleep-blocks') return content.sleepBlocks.length
  if (name === 'sleep-days') return content.sleepDays.length
  if (name === 'input-files') return content.inputFiles.length
  return null
}

function validateEvidenceSource(value: unknown): MigrationEvidenceSource {
  const source = asRecord(value)
  const sourceSystem = source.sourceSystem
  const classification = source.classification
  const presence = source.presence

  if (!['firestore', 'legacy-local'].includes(String(sourceSystem))) {
    throw new Error('Unsupported migration evidence source system')
  }
  if (!['rebuild', 'migrate', 'archive'].includes(String(classification))) {
    throw new Error('Unsupported migration classification')
  }
  if (!['present', 'absent'].includes(String(presence))) {
    throw new Error('Unsupported migration presence')
  }
  if (typeof source.dataset !== 'string' || !source.dataset.trim()) {
    throw new Error('Migration evidence dataset is required')
  }
  if (!Number.isInteger(source.sourceCount) || Number(source.sourceCount) < 0) {
    throw new Error('Migration evidence sourceCount must be a non-negative integer')
  }
  if (presence === 'absent' && Number(source.sourceCount) !== 0) {
    throw new Error('Absent migration evidence source must have sourceCount 0')
  }

  const semanticSha256 = typeof source.semanticSha256 === 'string' ? source.semanticSha256 : undefined
  if (semanticSha256 && !/^[a-f0-9]{64}$/i.test(semanticSha256)) {
    throw new Error('Invalid migration semantic SHA-256')
  }

  const archiveArtifact = source.archiveArtifact === undefined
    ? undefined
    : validateArchiveArtifact(source.archiveArtifact)

  return {
    sourceSystem: sourceSystem as MigrationEvidenceSource['sourceSystem'],
    dataset: source.dataset.trim(),
    classification: classification as MigrationClassification,
    presence: presence as MigrationPresence,
    sourceCount: Number(source.sourceCount),
    ...(semanticSha256 ? { semanticSha256 } : {}),
    ...(archiveArtifact ? { archiveArtifact } : {}),
    ...(typeof source.targetDataset === 'string' ? { targetDataset: source.targetDataset } : {}),
    ...(Number.isInteger(source.targetCount) && Number(source.targetCount) >= 0 ? { targetCount: Number(source.targetCount) } : {}),
    ...(Number.isInteger(source.rejectedCount) && Number(source.rejectedCount) >= 0 ? { rejectedCount: Number(source.rejectedCount) } : {}),
  }
}

function validateArchiveArtifact(value: unknown): MigrationArchiveArtifact {
  const artifact = asRecord(value)
  if (typeof artifact.relativePath !== 'string' || !artifact.relativePath.trim()) {
    throw new Error('Migration archive artifact relativePath is required')
  }
  if (!Number.isInteger(artifact.byteLength) || Number(artifact.byteLength) < 0) {
    throw new Error('Migration archive artifact byteLength is invalid')
  }
  if (typeof artifact.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(artifact.sha256)) {
    throw new Error('Migration archive artifact SHA-256 is invalid')
  }
  return {
    relativePath: artifact.relativePath,
    byteLength: Number(artifact.byteLength),
    sha256: artifact.sha256,
  }
}

function hashProjectedRecords(records: unknown[], project: (value: unknown) => unknown): string {
  const lines = records.map((record) => stableStringify(project(record))).sort()
  return sha256(Buffer.from(lines.length === 0 ? '' : `${lines.join('\n')}\n`, 'utf8'))
}

function compareEvidenceSource(left: MigrationEvidenceSource, right: MigrationEvidenceSource): number {
  return evidenceKey(left.sourceSystem, left.dataset).localeCompare(evidenceKey(right.sourceSystem, right.dataset))
}

function evidenceKey(sourceSystem: string, dataset: string): string {
  return `${sourceSystem}:${dataset}`
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function asRecord(value: unknown): Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, any>
    : {}
}

function getNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function getMigrationEvidenceRoot(evidencePath: string): string {
  return dirname(resolve(evidencePath))
}
