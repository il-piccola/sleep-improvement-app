import { loadHealthImportConfig } from './config.ts'

const config = loadHealthImportConfig()
const url = `http://localhost:${config.serverPort}/api/rescan`

try {
  const response = await fetch(url, {
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const status = (await response.json()) as {
    lastScanAt?: string
    lastProcessedFileName?: string | null
    latestStats?: {
      readFileCount: number
      newRecordCount: number
      duplicateSkippedCount: number
      rejectedRows: number
      warningCount: number
    } | null
  }

  console.log('Rescan requested')
  console.log(`Last scan: ${status.lastScanAt ?? 'unknown'}`)
  console.log(`Last file: ${status.lastProcessedFileName ?? 'none'}`)

  if (status.latestStats) {
    console.log(`Read files: ${status.latestStats.readFileCount}`)
    console.log(`New records: ${status.latestStats.newRecordCount}`)
    console.log(`Duplicate skipped: ${status.latestStats.duplicateSkippedCount}`)
    console.log(`Rejected rows: ${status.latestStats.rejectedRows}`)
    console.log(`Warnings: ${status.latestStats.warningCount}`)
  }
} catch (error) {
  console.error(
    `Rescan failed. Start the local import server first with "npm run server". ${
      error instanceof Error ? error.message : String(error)
    }`,
  )
  process.exitCode = 1
}
