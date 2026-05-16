import { readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import chokidar, { type FSWatcher } from 'chokidar'
import type { HealthImportConfig } from './config.ts'
import { toChokidarOptions } from './config.ts'
import { importHealthExportFile } from './importHealthExports.ts'
import {
  getFileFingerprint,
  hasProcessedFile,
  saveProcessedFile,
  type ProcessedFileEntry,
} from './processedFiles.ts'

export type ImportStatus = {
  isWatching: boolean
  watchDir: string
  startedAt: string | null
  lastScanAt: string | null
  lastImportedAt: string | null
  lastProcessedFileName: string | null
  lastError: string | null
  processedCount: number
  importedCount: number
  skippedCount: number
  failedCount: number
  latestStats: {
    readFileCount: number
    newRecordCount: number
    duplicateSkippedCount: number
    rejectedRows: number
    warningCount: number
  } | null
}

type ImportRunStats = NonNullable<ImportStatus['latestStats']>

export type HealthExportWatcher = {
  status: ImportStatus
  start: () => Promise<void>
  stop: () => Promise<void>
  rescan: () => Promise<ImportStatus>
}

export function createHealthExportWatcher(config: HealthImportConfig): HealthExportWatcher {
  const queue = new Set<string>()
  let watcher: FSWatcher | null = null
  let scanTimer: NodeJS.Timeout | null = null
  let isProcessing = false
  const status: ImportStatus = {
    isWatching: false,
    watchDir: config.watchDir,
    startedAt: null,
    lastScanAt: null,
    lastImportedAt: null,
    lastProcessedFileName: null,
    lastError: null,
    processedCount: 0,
    importedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    latestStats: null,
  }

  async function start() {
    if (watcher) {
      return
    }

    status.startedAt = new Date().toISOString()
    status.isWatching = true
    watcher = chokidar.watch(toGlob(config.watchDir), toChokidarOptions(config))
    watcher.on('add', (path: string) => enqueue(path))
    watcher.on('change', (path: string) => enqueue(path))
    watcher.on('error', (error: unknown) => {
      status.lastError = error instanceof Error ? error.message : String(error)
    })
    scanTimer = setInterval(() => {
      void scanDirectory()
    }, config.scanIntervalMs)
    await scanDirectory()
  }

  async function stop() {
    if (scanTimer) {
      clearInterval(scanTimer)
      scanTimer = null
    }

    if (watcher) {
      await watcher.close()
      watcher = null
    }

    status.isWatching = false
  }

  async function rescan() {
    await scanDirectory()
    return status
  }

  function enqueue(path: string) {
    if (!path.toLowerCase().endsWith('.json')) {
      return
    }

    queue.add(resolve(path))
    void drainQueue()
  }

  async function scanDirectory() {
    status.lastScanAt = new Date().toISOString()

    try {
      const jsonFiles = await findJsonFiles(config.watchDir)
      for (const path of jsonFiles) {
        queue.add(path)
      }
      await drainQueue()
    } catch (error) {
      status.lastError = error instanceof Error ? error.message : String(error)
    }
  }

  async function drainQueue() {
    if (isProcessing) {
      return
    }

    isProcessing = true
    const runStats = createEmptyRunStats()

    try {
      while (queue.size > 0) {
        const [path] = queue
        queue.delete(path)
        mergeRunStats(runStats, await processFile(path))
      }

      status.latestStats = runStats
    } finally {
      isProcessing = false
    }
  }

  async function processFile(path: string): Promise<ImportRunStats> {
    const fingerprint = await getFileFingerprint(path)

    if (await hasProcessedFile(config.dataDir, fingerprint)) {
      status.skippedCount += 1
      return {
        ...createEmptyRunStats(),
        readFileCount: 1,
      }
    }

    try {
      const result = await importHealthExportFile({
        dataDir: config.dataDir,
        filePath: path,
      })
      const entry: ProcessedFileEntry = {
        ...fingerprint,
        processedAt: result.importedAt,
        status: 'imported',
      }

      await saveProcessedFile(config.dataDir, entry)
      status.processedCount += 1
      status.importedCount += 1
      status.lastImportedAt = result.importedAt
      status.lastProcessedFileName = fingerprint.fileName
      status.lastError = null
      return result.state.latestImport
        ? toRunStats(result.state.latestImport)
        : createEmptyRunStats()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await saveProcessedFile(config.dataDir, {
        ...fingerprint,
        processedAt: new Date().toISOString(),
        status: 'failed',
        message,
      })
      status.processedCount += 1
      status.failedCount += 1
      status.lastProcessedFileName = fingerprint.fileName
      status.lastError = message
      return {
        ...createEmptyRunStats(),
        readFileCount: 1,
        warningCount: 1,
      }
    }
  }

  return {
    status,
    start,
    stop,
    rescan,
  }
}

function createEmptyRunStats(): ImportRunStats {
  return {
    readFileCount: 0,
    newRecordCount: 0,
    duplicateSkippedCount: 0,
    rejectedRows: 0,
    warningCount: 0,
  }
}

function mergeRunStats(target: ImportRunStats, source: ImportRunStats): void {
  target.readFileCount += source.readFileCount
  target.newRecordCount += source.newRecordCount
  target.duplicateSkippedCount += source.duplicateSkippedCount
  target.rejectedRows += source.rejectedRows
  target.warningCount += source.warningCount
}

function toRunStats(stats: {
  readFileCount: number
  newRecordCount: number
  duplicateSkippedCount: number
  rejectedRows: number
  warningCount: number
}): ImportRunStats {
  return {
    readFileCount: stats.readFileCount,
    newRecordCount: stats.newRecordCount,
    duplicateSkippedCount: stats.duplicateSkippedCount,
    rejectedRows: stats.rejectedRows,
    warningCount: stats.warningCount,
  }
}

async function findJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await findJsonFiles(path)))
      continue
    }

    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) {
      continue
    }

    const metadata = await stat(path)
    if (metadata.size > 0) {
      files.push(resolve(path))
    }
  }

  return files
}

function toGlob(dir: string): string {
  return `${dir.replace(/\\/g, '/')}/**/*.json`
}
