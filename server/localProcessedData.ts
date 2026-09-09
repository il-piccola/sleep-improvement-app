import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
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
  const tsxCli = resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs')
  const args = [
    tsxCli,
    'processor/runDirectory.ts',
    config.watchDir,
    config.processedDataDir,
    ...(config.processedDataBackupDir ? [config.processedDataBackupDir] : []),
  ]

  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk
  })

  const result = await new Promise<LocalProcessedDataPublication>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code !== 0) {
        const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n')
        reject(
          new Error(
            `Local processed-data worker failed (code=${code ?? 'null'}, signal=${signal ?? 'none'})${details ? `: ${details}` : ''}`,
          ),
        )
        return
      }

      try {
        resolve(parseWorkerPublication(stdout))
      } catch (error) {
        reject(error)
      }
    })
  })

  return result
}

function parseWorkerPublication(stdout: string): LocalProcessedDataPublication {
  const match = stdout.match(/(?:^|\r?\n)(\{[\s\S]*\})\s*$/)
  if (!match?.[1]) {
    throw new Error(`Local processed-data worker returned no publication summary: ${stdout.trim()}`)
  }

  return JSON.parse(match[1]) as LocalProcessedDataPublication
}
