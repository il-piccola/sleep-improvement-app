import { createHash, randomBytes } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import type { ProcessorConfig } from './types.ts'

export const PROCESSED_DATA_SCHEMA_ID = 'sleep-compass.processed-data'
export const PROCESSED_DATA_SCHEMA_VERSION = '1.0.0'

export type ProcessedSnapshotContent = {
  inputFiles: unknown[]
  sleepRecords: unknown[]
  sleepBlocks: unknown[]
  sleepDays: unknown[]
  sourceSummaries: unknown[]
  overlaps: unknown[]
  healthMetrics: unknown[]
  diagnostics: unknown
  migrationManifest?: unknown
}

export type SnapshotDatasetDescriptor = {
  name: string
  path: string
  mediaType: string
  recordType: string
  recordCount: number
  byteLength: number
  sha256: string
}

export type ProcessedSnapshotManifest = {
  schemaId: typeof PROCESSED_DATA_SCHEMA_ID
  schemaVersion: typeof PROCESSED_DATA_SCHEMA_VERSION
  snapshotId: string
  processorVersion: string
  processorRevision: string | null
  generatedAt: string
  processingConfig: ProcessorConfig
  identityPolicyVersion: string
  datasets: SnapshotDatasetDescriptor[]
}

export type ProcessedSnapshotComplete = {
  snapshotId: string
  schemaVersion: string
  manifestSha256: string
  completedAt: string
}

export type PublishedSnapshot = {
  snapshotId: string
  snapshotDir: string
  backupDir: string | null
  manifest: ProcessedSnapshotManifest
  complete: ProcessedSnapshotComplete
}

type DatasetSpec = {
  name: string
  fileName: string
  mediaType: 'application/json' | 'application/x-ndjson'
  recordType: string
  value: unknown | unknown[]
  jsonl: boolean
}

export async function publishProcessedSnapshot({
  backupRoot = null,
  content,
  identityPolicyVersion,
  processedDataRoot,
  processingConfig,
  processorRevision = null,
  processorVersion,
  snapshotId = createSnapshotId(),
}: {
  backupRoot?: string | null
  content: ProcessedSnapshotContent
  identityPolicyVersion: string
  processedDataRoot: string
  processingConfig: ProcessorConfig
  processorRevision?: string | null
  processorVersion: string
  snapshotId?: string
}): Promise<PublishedSnapshot> {
  validateSnapshotId(snapshotId)

  const root = resolve(processedDataRoot)
  const snapshotsRoot = join(root, 'snapshots')
  const workingRoot = join(root, '.working')
  const finalDir = join(snapshotsRoot, snapshotId)
  const stagingDir = join(workingRoot, `${snapshotId}-${randomBytes(4).toString('hex')}`)

  await assertPathMissing(finalDir, 'Snapshot already exists')
  await mkdir(stagingDir, { recursive: true })

  try {
    const datasets = await writeDatasets(stagingDir, content)
    const generatedAt = new Date().toISOString()
    const manifest: ProcessedSnapshotManifest = {
      schemaId: PROCESSED_DATA_SCHEMA_ID,
      schemaVersion: PROCESSED_DATA_SCHEMA_VERSION,
      snapshotId,
      processorVersion,
      processorRevision,
      generatedAt,
      processingConfig: { ...processingConfig },
      identityPolicyVersion,
      datasets,
    }
    const manifestBytes = encodeJson(manifest)
    const manifestPath = join(stagingDir, 'manifest.json')
    await writeFile(manifestPath, manifestBytes)
    await verifyManifestDatasets(stagingDir, manifest)

    const complete: ProcessedSnapshotComplete = {
      snapshotId,
      schemaVersion: PROCESSED_DATA_SCHEMA_VERSION,
      manifestSha256: sha256(manifestBytes),
      completedAt: new Date().toISOString(),
    }

    await writeFile(join(stagingDir, 'complete.json'), encodeJson(complete))
    await validateCompletedSnapshot(stagingDir)

    await mkdir(snapshotsRoot, { recursive: true })
    await rename(stagingDir, finalDir)

    let backupDir: string | null = null
    if (backupRoot) {
      backupDir = await copyCompletedSnapshotToBackup(finalDir, backupRoot)
    }

    return {
      snapshotId,
      snapshotDir: finalDir,
      backupDir,
      manifest,
      complete,
    }
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true })
    throw error
  }
}

export async function validateCompletedSnapshot(
  snapshotDir: string,
): Promise<{ manifest: ProcessedSnapshotManifest; complete: ProcessedSnapshotComplete }> {
  const manifestPath = join(snapshotDir, 'manifest.json')
  const completePath = join(snapshotDir, 'complete.json')
  const manifestBytes = await readFile(manifestPath)
  const completeBytes = await readFile(completePath)
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as ProcessedSnapshotManifest
  const complete = JSON.parse(completeBytes.toString('utf8')) as ProcessedSnapshotComplete

  validateManifest(manifest)
  validateComplete(complete)

  if (complete.snapshotId !== manifest.snapshotId) {
    throw new Error('Snapshot complete marker ID does not match manifest')
  }
  if (complete.schemaVersion !== manifest.schemaVersion) {
    throw new Error('Snapshot complete marker schema version does not match manifest')
  }
  if (complete.manifestSha256 !== sha256(manifestBytes)) {
    throw new Error('Snapshot manifest SHA-256 does not match complete marker')
  }

  await verifyManifestDatasets(snapshotDir, manifest)

  return { manifest, complete }
}

export async function copyCompletedSnapshotToBackup(
  snapshotDir: string,
  backupRoot: string,
): Promise<string> {
  const validated = await validateCompletedSnapshot(snapshotDir)
  const snapshotId = validated.manifest.snapshotId
  const destinationRoot = resolve(backupRoot)
  const destination = join(destinationRoot, 'snapshots', snapshotId)

  await assertPathMissing(destination, 'Backup snapshot already exists')
  await mkdir(destination, { recursive: true })

  const fileNames = [
    'manifest.json',
    ...validated.manifest.datasets.map((dataset) => dataset.path),
  ]
  const uniqueFileNames = Array.from(new Set(fileNames)).filter((name) => name !== 'complete.json')

  try {
    for (const fileName of uniqueFileNames) {
      await copyFile(join(snapshotDir, fileName), join(destination, fileName))
    }

    await verifyManifestDatasets(destination, validated.manifest)
    const copiedManifest = await readFile(join(destination, 'manifest.json'))
    if (sha256(copiedManifest) !== validated.complete.manifestSha256) {
      throw new Error('Backup manifest SHA-256 does not match completed local snapshot')
    }

    // Completion marker is intentionally copied last. Consumers must ignore the directory until it exists.
    await copyFile(join(snapshotDir, 'complete.json'), join(destination, 'complete.json'))
    await validateCompletedSnapshot(destination)
    return destination
  } catch (error) {
    // Keep an incomplete backup without complete.json only if removal itself fails.
    await rm(join(destination, 'complete.json'), { force: true })
    throw error
  }
}

export function createSnapshotId(now = new Date()): string {
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace('.000Z', 'Z').replace(/\.\d{3}Z$/, 'Z')
  return `${timestamp}-${randomBytes(4).toString('hex')}`
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value))
}

async function writeDatasets(
  stagingDir: string,
  content: ProcessedSnapshotContent,
): Promise<SnapshotDatasetDescriptor[]> {
  const specs: DatasetSpec[] = [
    spec('input-files', 'input-files.jsonl', 'InputFileV1', content.inputFiles),
    spec('sleep-records', 'sleep-records.jsonl', 'SleepRecordV1', content.sleepRecords),
    spec('sleep-blocks', 'sleep-blocks.jsonl', 'SleepBlockV1', content.sleepBlocks),
    spec('sleep-days', 'sleep-days.jsonl', 'SleepDayV1', content.sleepDays),
    spec('source-summaries', 'source-summaries.jsonl', 'SourceSummaryV1', content.sourceSummaries),
    spec('overlaps', 'overlaps.jsonl', 'OverlapV1', content.overlaps),
    spec('health-metrics', 'health-metrics.jsonl', 'HealthMetricRecordV1', content.healthMetrics),
    jsonSpec('diagnostics', 'diagnostics.json', 'DiagnosticsV1', content.diagnostics),
  ]

  if (content.migrationManifest !== undefined) {
    specs.push(
      jsonSpec(
        'migration-manifest',
        'migration-manifest.json',
        'MigrationManifestV1',
        content.migrationManifest,
      ),
    )
  }

  const descriptors: SnapshotDatasetDescriptor[] = []

  for (const dataset of specs) {
    const bytes = dataset.jsonl
      ? encodeJsonLines(dataset.value as unknown[])
      : encodeJson(dataset.value)
    await writeFile(join(stagingDir, dataset.fileName), bytes)
    descriptors.push({
      name: dataset.name,
      path: dataset.fileName,
      mediaType: dataset.mediaType,
      recordType: dataset.recordType,
      recordCount: dataset.jsonl ? (dataset.value as unknown[]).length : 1,
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
    })
  }

  return descriptors.sort((left, right) => left.name.localeCompare(right.name))
}

async function verifyManifestDatasets(
  snapshotDir: string,
  manifest: ProcessedSnapshotManifest,
): Promise<void> {
  for (const dataset of manifest.datasets) {
    const path = join(snapshotDir, dataset.path)
    const bytes = await readFile(path)
    if (bytes.byteLength !== dataset.byteLength) {
      throw new Error(`Dataset byte length mismatch: ${dataset.path}`)
    }
    if (sha256(bytes) !== dataset.sha256) {
      throw new Error(`Dataset SHA-256 mismatch: ${dataset.path}`)
    }

    const recordCount = dataset.mediaType === 'application/x-ndjson'
      ? countJsonLines(bytes.toString('utf8'))
      : 1
    if (recordCount !== dataset.recordCount) {
      throw new Error(`Dataset record count mismatch: ${dataset.path}`)
    }
  }
}

function validateManifest(value: ProcessedSnapshotManifest): void {
  if (!value || value.schemaId !== PROCESSED_DATA_SCHEMA_ID) {
    throw new Error('Unsupported or invalid processed data manifest schema ID')
  }
  if (value.schemaVersion !== PROCESSED_DATA_SCHEMA_VERSION) {
    throw new Error(`Unsupported processed data schema version: ${String(value.schemaVersion)}`)
  }
  if (!value.snapshotId || !value.processorVersion || !value.identityPolicyVersion) {
    throw new Error('Processed data manifest is missing required identity fields')
  }
  if (!value.processingConfig || !Array.isArray(value.datasets) || value.datasets.length === 0) {
    throw new Error('Processed data manifest is missing config or datasets')
  }
}

function validateComplete(value: ProcessedSnapshotComplete): void {
  if (
    !value ||
    typeof value.snapshotId !== 'string' ||
    typeof value.schemaVersion !== 'string' ||
    typeof value.manifestSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(value.manifestSha256) ||
    typeof value.completedAt !== 'string'
  ) {
    throw new Error('Invalid snapshot complete marker')
  }
}

function spec(
  name: string,
  fileName: string,
  recordType: string,
  value: unknown[],
): DatasetSpec {
  return {
    name,
    fileName,
    mediaType: 'application/x-ndjson',
    recordType,
    value,
    jsonl: true,
  }
}

function jsonSpec(
  name: string,
  fileName: string,
  recordType: string,
  value: unknown,
): DatasetSpec {
  return {
    name,
    fileName,
    mediaType: 'application/json',
    recordType,
    value,
    jsonl: false,
  }
}

function encodeJson(value: unknown): Buffer {
  return Buffer.from(`${stableStringify(value)}\n`, 'utf8')
}

function encodeJsonLines(values: unknown[]): Buffer {
  if (values.length === 0) return Buffer.alloc(0)
  return Buffer.from(`${values.map((value) => stableStringify(value)).join('\n')}\n`, 'utf8')
}

function countJsonLines(text: string): number {
  if (!text) return 0
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).length
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue)
  }
  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJsonValue(nested)]),
  )
}

async function assertPathMissing(path: string, message: string): Promise<void> {
  try {
    await stat(path)
    throw new Error(`${message}: ${basename(path)}`)
  } catch (error) {
    if (isMissing(error)) return
    throw error
  }
}

function validateSnapshotId(snapshotId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(snapshotId)) {
    throw new Error('Invalid snapshot ID')
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    String((error as { code?: unknown }).code) === 'ENOENT'
}
