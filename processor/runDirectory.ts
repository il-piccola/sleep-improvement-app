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
    const cacheValidation = process.env.PROCESSOR_CACHE_VALIDATION?.trim() || 'metadata'
    if (cacheValidation !== 'metadata' && cacheValidation !== 'sha256') {
      throw new Error('PROCESSOR_CACHE_VALIDATION must be metadata or sha256')
    }
    const cacheDirectory = process.env.PROCESSOR_CACHE_DIR?.trim()
    const cacheEnabled = parseCacheEnabled(process.env.PROCESSOR_CACHE_ENABLED)
    const result = await processHealthExportDirectory({
      rawRoot: resolve(rawRoot),
      processedDataRoot: resolve(processedDataRoot),
      backupRoot: backupRoot ? resolve(backupRoot) : null,
      processorRevision: process.env.PROCESSOR_REVISION?.trim() || null,
      ...(cacheDirectory ? { cacheRoot: resolve(cacheDirectory) } : {}),
      cacheValidation,
      cacheEnabled,
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
          cacheHitCount: result.cacheHitCount,
          cacheMissCount: result.cacheMissCount,
          cacheCorruptionCount: result.cacheCorruptionCount,
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

function parseCacheEnabled(value: string | undefined): boolean {
  if (value === undefined || value.trim() === '') return true
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false
  throw new Error('PROCESSOR_CACHE_ENABLED must be true or false')
}
