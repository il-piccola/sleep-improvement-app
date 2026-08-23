import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve } from 'node:path'
import { loadJsonState, writeJsonStateAtomic } from './safeJsonFile.ts'

export type ProcessedFileEntry = {
  importerVersion: number
  relativePath: string
  fileName: string
  mtimeMs: number
  size: number
  sha256?: string
  processedAt: string
  status: 'imported' | 'skipped' | 'failed'
  message?: string
}

type LegacyProcessedFileEntry = Partial<ProcessedFileEntry> & {
  path?: string
}

export type ProcessedFileMetadata = Pick<
  ProcessedFileEntry,
  'relativePath' | 'fileName' | 'mtimeMs' | 'size'
>

export type ProcessedFileFingerprint = ProcessedFileMetadata & {
  sha256: string
}

export type ProcessedFilesState = {
  files: ProcessedFileEntry[]
}

const emptyState: ProcessedFilesState = {
  files: [],
}

export const currentImporterVersion = 3

export async function getFileMetadata(
  path: string,
  rawRoot: string,
): Promise<ProcessedFileMetadata> {
  const metadata = await stat(path)
  const relativePath = toPortableRelativePath(rawRoot, path)

  return {
    relativePath,
    fileName: basename(path),
    mtimeMs: metadata.mtimeMs,
    size: metadata.size,
  }
}

export async function addContentHash(
  path: string,
  metadata: ProcessedFileMetadata,
): Promise<ProcessedFileFingerprint> {
  return {
    ...metadata,
    sha256: await sha256File(path),
  }
}

export async function getFileFingerprint(
  path: string,
  rawRoot = resolve(path, '..'),
): Promise<ProcessedFileFingerprint> {
  const metadata = await getFileMetadata(path, rawRoot)
  return addContentHash(path, metadata)
}

export async function loadProcessedFiles(
  dataDir: string,
  rawRoot?: string,
): Promise<ProcessedFilesState> {
  const result = await loadJsonState({
    path: getProcessedFilesPath(dataDir),
    defaultValue: emptyState,
    validate: (value) => validateProcessedFilesState(value, rawRoot),
  })

  return result.value
}

export async function saveProcessedFile(
  dataDir: string,
  entry: ProcessedFileEntry,
  rawRoot?: string,
): Promise<ProcessedFilesState> {
  const state = await loadProcessedFiles(dataDir, rawRoot)
  const versionedEntry: ProcessedFileEntry = {
    ...entry,
    importerVersion: currentImporterVersion,
    relativePath: normalizeRelativePath(entry.relativePath),
  }
  const files = [
    versionedEntry,
    ...state.files.filter(
      (file) =>
        file.relativePath !== versionedEntry.relativePath ||
        file.sha256 !== versionedEntry.sha256 ||
        file.mtimeMs !== versionedEntry.mtimeMs ||
        file.size !== versionedEntry.size,
    ),
  ]
  const nextState = { files }

  await writeJsonStateAtomic(getProcessedFilesPath(dataDir), nextState)

  return nextState
}

export async function hasProcessedFileMetadata(
  dataDir: string,
  metadata: ProcessedFileMetadata,
  rawRoot?: string,
): Promise<boolean> {
  const state = await loadProcessedFiles(dataDir, rawRoot)

  return state.files.some(
    (file) =>
      file.relativePath === metadata.relativePath &&
      file.mtimeMs === metadata.mtimeMs &&
      file.size === metadata.size &&
      file.importerVersion === currentImporterVersion &&
      file.status === 'imported',
  )
}

export async function hasProcessedFile(
  dataDir: string,
  fingerprint: ProcessedFileFingerprint,
  rawRoot?: string,
): Promise<boolean> {
  const state = await loadProcessedFiles(dataDir, rawRoot)

  return state.files.some(
    (file) =>
      file.relativePath === fingerprint.relativePath &&
      file.sha256 === fingerprint.sha256 &&
      file.importerVersion === currentImporterVersion &&
      file.status === 'imported',
  )
}

export function toPortableRelativePath(rawRoot: string, path: string): string {
  const root = resolve(rawRoot)
  const absolutePath = resolve(path)
  const relativePath = relative(root, absolutePath)

  if (!relativePath || relativePath === '.') {
    throw new Error('Processed file path must be a file below the configured raw root')
  }

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error('Processed file path is outside the configured raw root')
  }

  return normalizeRelativePath(relativePath)
}

function getProcessedFilesPath(dataDir: string): string {
  return resolve(dataDir, 'processed-files.json')
}

function validateProcessedFilesState(
  value: unknown,
  rawRoot?: string,
): ProcessedFilesState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const files = (value as { files?: unknown }).files
  if (files === undefined) return emptyState
  if (!Array.isArray(files)) return null

  const normalized: ProcessedFileEntry[] = []

  for (const valueEntry of files) {
    const entry = normalizeProcessedFileEntry(valueEntry, rawRoot)
    if (entry) normalized.push(entry)
  }

  return { files: normalized }
}

function normalizeProcessedFileEntry(
  value: unknown,
  rawRoot?: string,
): ProcessedFileEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const entry = value as LegacyProcessedFileEntry
  let relativePath = typeof entry.relativePath === 'string' ? entry.relativePath : undefined

  if (!relativePath && typeof entry.path === 'string' && rawRoot) {
    try {
      relativePath = toPortableRelativePath(rawRoot, entry.path)
    } catch {
      return null
    }
  }

  if (
    !relativePath ||
    typeof entry.fileName !== 'string' ||
    typeof entry.mtimeMs !== 'number' ||
    typeof entry.size !== 'number' ||
    typeof entry.processedAt !== 'string' ||
    !entry.status ||
    !['imported', 'skipped', 'failed'].includes(entry.status)
  ) {
    return null
  }

  let normalizedRelativePath: string
  try {
    normalizedRelativePath = normalizeRelativePath(relativePath)
  } catch {
    return null
  }

  return {
    importerVersion: typeof entry.importerVersion === 'number' ? entry.importerVersion : 1,
    relativePath: normalizedRelativePath,
    fileName: entry.fileName,
    mtimeMs: entry.mtimeMs,
    size: entry.size,
    ...(typeof entry.sha256 === 'string' && entry.sha256 ? { sha256: entry.sha256 } : {}),
    processedAt: entry.processedAt,
    status: entry.status,
    ...(typeof entry.message === 'string' && entry.message ? { message: entry.message } : {}),
  }
}

function normalizeRelativePath(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '')

  if (
    !normalized ||
    normalized.startsWith('/') ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    /^[A-Za-z]:\//.test(normalized)
  ) {
    throw new Error('Processed file identity must use a relative path below the raw root')
  }

  return normalized
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  const stream = createReadStream(path)

  for await (const chunk of stream) {
    hash.update(chunk as Buffer)
  }

  return hash.digest('hex')
}
