import { resolve } from 'node:path'
import { processHealthExportDirectory } from './processDirectory.ts'

const rawRoot = process.argv[2]
const processedDataRoot = process.argv[3]
const backupRoot = process.argv[4] ?? null

if (!rawRoot || !processedDataRoot) {
  console.error(
    'Usage: npm run processor:snapshot -- <raw-health-export-root> <processed-data-root> [backup-root]',
  )
  process.exitCode = 2
} else {
  try {
    const result = await processHealthExportDirectory({
      rawRoot: resolve(rawRoot),
      processedDataRoot: resolve(processedDataRoot),
      backupRoot: backupRoot ? resolve(backupRoot) : null,
      processorRevision: process.env.PROCESSOR_REVISION?.trim() || null,
    })

    console.log(
      JSON.stringify(
        {
          snapshotId: result.published.snapshotId,
          backupCreated: Boolean(result.published.backupDir),
          inputFileCount: result.inputFileCount,
          processedFileCount: result.processedFileCount,
          failedFileCount: result.failedFileCount,
          sleepRecordCount: result.sleepRecordCount,
          healthMetricCount: result.healthMetricCount,
        },
        null,
        2,
      ),
    )
  } catch (error) {
    console.error(`Processor snapshot failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
