import { readdir, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import type { ProcessedDataRuntime } from './processedData.ts'

export type RawJsonFilesStatus = {
  fileCount: number
  latestFileName: string | null
  latestModifiedAt: string | null
}

export type ProcessedDataFreshness = {
  status: 'fresh' | 'stale' | 'no_snapshot' | 'no_raw_data'
  reason: string | null
  rawFileCount: number
  processedFileCount: number
  rawLatestModifiedAt: string | null
  processedLatestModifiedAt: string | null
}

export async function inspectRawJsonFiles(dir: string): Promise<RawJsonFilesStatus> {
  const files: string[] = []
  await collectJsonFiles(resolve(dir), files)
  let latestFileName: string | null = null
  let latestModifiedAtMs = Number.NEGATIVE_INFINITY

  for (const file of files) {
    const metadata = await stat(file)
    if (metadata.mtimeMs > latestModifiedAtMs) {
      latestModifiedAtMs = metadata.mtimeMs
      latestFileName = basename(file)
    }
  }

  return {
    fileCount: files.length,
    latestFileName,
    latestModifiedAt: Number.isFinite(latestModifiedAtMs)
      ? new Date(latestModifiedAtMs).toISOString()
      : null,
  }
}

export function assessProcessedDataFreshness(
  raw: RawJsonFilesStatus,
  processed: ProcessedDataRuntime | null,
): ProcessedDataFreshness {
  const processedLatestModifiedAt = getLatestProcessedInputModifiedAt(processed)

  if (raw.fileCount === 0) {
    return {
      status: 'no_raw_data',
      reason: 'raw_json_files_not_found',
      rawFileCount: 0,
      processedFileCount: processed?.inputFiles.length ?? 0,
      rawLatestModifiedAt: null,
      processedLatestModifiedAt,
    }
  }

  if (!processed) {
    return {
      status: 'no_snapshot',
      reason: 'processed_data_snapshot_not_found',
      rawFileCount: raw.fileCount,
      processedFileCount: 0,
      rawLatestModifiedAt: raw.latestModifiedAt,
      processedLatestModifiedAt: null,
    }
  }

  const rawLatestMs = Date.parse(raw.latestModifiedAt ?? '')
  const processedLatestMs = Date.parse(processedLatestModifiedAt ?? '')
  const fileCountChanged = raw.fileCount !== processed.inputFiles.length
  const rawIsNewer = Number.isFinite(rawLatestMs) && (!Number.isFinite(processedLatestMs) || rawLatestMs > processedLatestMs)

  return {
    status: fileCountChanged || rawIsNewer ? 'stale' : 'fresh',
    reason: fileCountChanged
      ? 'raw_file_count_differs'
      : rawIsNewer
        ? 'raw_file_newer_than_processed_snapshot'
        : null,
    rawFileCount: raw.fileCount,
    processedFileCount: processed.inputFiles.length,
    rawLatestModifiedAt: raw.latestModifiedAt,
    processedLatestModifiedAt,
  }
}

async function collectJsonFiles(dir: string, files: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const file = join(dir, entry.name)
    if (entry.isDirectory()) {
      await collectJsonFiles(file, files)
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
      files.push(file)
    }
  }
}

function getLatestProcessedInputModifiedAt(processed: ProcessedDataRuntime | null): string | null {
  if (!processed) return null

  const latestMs = Math.max(
    ...processed.inputFiles
      .map((file) => Date.parse(typeof file.modifiedAt === 'string' ? file.modifiedAt : ''))
      .filter(Number.isFinite),
    Number.NEGATIVE_INFINITY,
  )

  return Number.isFinite(latestMs) ? new Date(latestMs).toISOString() : null
}
