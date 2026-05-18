import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export type ProcessedFileEntry = {
  importerVersion?: number
  path: string
  fileName: string
  mtimeMs: number
  size: number
  sha256: string
  processedAt: string
  status: 'imported' | 'skipped' | 'failed'
  message?: string
}

export type ProcessedFileFingerprint = Pick<
  ProcessedFileEntry,
  'path' | 'fileName' | 'mtimeMs' | 'size' | 'sha256'
>

export type ProcessedFilesState = {
  files: ProcessedFileEntry[]
}

const emptyState: ProcessedFilesState = {
  files: [],
}

export const currentImporterVersion = 2

export async function getFileFingerprint(path: string): Promise<ProcessedFileFingerprint> {
  const metadata = await stat(path)
  const bytes = await readFile(path)

  return {
    path: resolve(path),
    fileName: resolve(path).split(/[\\/]/).at(-1) ?? path,
    mtimeMs: metadata.mtimeMs,
    size: metadata.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

export async function loadProcessedFiles(dataDir: string): Promise<ProcessedFilesState> {
  const path = getProcessedFilesPath(dataDir)

  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<ProcessedFilesState>
    return {
      files: Array.isArray(parsed.files) ? parsed.files.filter(isProcessedFileEntry) : [],
    }
  } catch {
    return emptyState
  }
}

export async function saveProcessedFile(
  dataDir: string,
  entry: ProcessedFileEntry,
): Promise<ProcessedFilesState> {
  const state = await loadProcessedFiles(dataDir)
  const versionedEntry = {
    ...entry,
    importerVersion: currentImporterVersion,
  }
  const files = [
    versionedEntry,
    ...state.files.filter((file) => file.path !== entry.path || file.sha256 !== entry.sha256),
  ].slice(0, 500)
  const nextState = { files }
  const path = getProcessedFilesPath(dataDir)

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(nextState, null, 2), 'utf8')

  return nextState
}

export async function hasProcessedFile(
  dataDir: string,
  fingerprint: ProcessedFileFingerprint,
): Promise<boolean> {
  const state = await loadProcessedFiles(dataDir)

  return state.files.some(
    (file) =>
      file.path === fingerprint.path &&
      file.mtimeMs === fingerprint.mtimeMs &&
      file.size === fingerprint.size &&
      file.sha256 === fingerprint.sha256 &&
      (file.importerVersion ?? 1) === currentImporterVersion &&
      file.status === 'imported',
  )
}

function getProcessedFilesPath(dataDir: string): string {
  return resolve(dataDir, 'processed-files.json')
}

function isProcessedFileEntry(value: unknown): value is ProcessedFileEntry {
  if (!value || typeof value !== 'object') {
    return false
  }

  const entry = value as ProcessedFileEntry

  return (
    typeof entry.path === 'string' &&
    typeof entry.fileName === 'string' &&
    typeof entry.mtimeMs === 'number' &&
    typeof entry.size === 'number' &&
    typeof entry.sha256 === 'string' &&
    typeof entry.processedAt === 'string' &&
    ['imported', 'skipped', 'failed'].includes(entry.status)
  )
}
