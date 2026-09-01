import {
  processHealthExportDirectory,
  type ProcessDirectoryResult,
} from '../processor/processDirectory.ts'
import type { HealthImportConfig } from './config.ts'

export type LocalProcessedDataPublication = {
  snapshotId: string
  generatedAt: string
  inputFileCount: number
  processedFileCount: number
  failedFileCount: number
  sleepRecordCount: number
  healthMetricCount: number
}

export async function publishLocalProcessedData(
  config: HealthImportConfig,
): Promise<LocalProcessedDataPublication> {
  const result = await processHealthExportDirectory({
    rawRoot: config.watchDir,
    processedDataRoot: config.processedDataDir,
    backupRoot: config.processedDataBackupDir,
    processorRevision: process.env.PROCESSOR_REVISION?.trim() || null,
  })

  return toPublication(result)
}

function toPublication(result: ProcessDirectoryResult): LocalProcessedDataPublication {
  return {
    snapshotId: result.published.snapshotId,
    generatedAt: result.published.manifest.generatedAt,
    inputFileCount: result.inputFileCount,
    processedFileCount: result.processedFileCount,
    failedFileCount: result.failedFileCount,
    sleepRecordCount: result.sleepRecordCount,
    healthMetricCount: result.healthMetricCount,
  }
}
