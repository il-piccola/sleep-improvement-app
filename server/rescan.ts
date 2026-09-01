import { loadHealthImportConfig } from './config.ts'
import { createHealthExportWatcher } from './watchHealthExports.ts'
import { publishLocalProcessedData } from './localProcessedData.ts'

const config = loadHealthImportConfig()
const watcher = createHealthExportWatcher(config, undefined, {
  onProcessedDataReady: async () => {
    await publishLocalProcessedData(config)
  },
})

try {
  const status = await watcher.rescan()
  const processedData = await publishLocalProcessedData(config)

  console.log('Standalone rescan completed')
  console.log(`Last scan: ${status.lastScanAt ?? 'unknown'}`)
  console.log(`Last file: ${status.lastProcessedFileName ?? 'none'}`)
  console.log(`Processed snapshot: ${processedData.snapshotId}`)
  console.log(`Processed records: ${processedData.sleepRecordCount}`)

  if (status.latestStats) {
    console.log(`Read files: ${status.latestStats.readFileCount}`)
    console.log(`New records: ${status.latestStats.newRecordCount}`)
    console.log(`Duplicate skipped: ${status.latestStats.duplicateSkippedCount}`)
    console.log(`Rejected rows: ${status.latestStats.rejectedRows}`)
    console.log(`Warnings: ${status.latestStats.warningCount}`)
  }

  if (status.lastError) {
    console.error(`Last error: ${status.lastError}`)
    process.exitCode = 1
  }
} catch (error) {
  console.error(`Rescan failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
