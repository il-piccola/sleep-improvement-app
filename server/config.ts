import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'

export type HealthImportConfig = {
  watchDir: string
  watchEnabled: boolean
  serverPort: number
  scanIntervalMs: number
  usePolling: boolean
  pollIntervalMs: number
  awaitWriteStabilityMs: number
  dataDir: string
  processedDataDir: string
  processedDataBackupDir: string | null
}

export const defaultHealthImportConfig: HealthImportConfig = {
  watchDir: resolve(process.cwd(), 'health-auto-export', 'Sleep'),
  watchEnabled: true,
  serverPort: 8787,
  scanIntervalMs: 300_000,
  usePolling: true,
  pollIntervalMs: 10_000,
  awaitWriteStabilityMs: 5_000,
  dataDir: resolve(process.cwd(), 'server-data'),
  processedDataDir: resolve(process.cwd(), 'processed-data'),
  processedDataBackupDir: null,
}

const envKeys = {
  watchDir: 'HEALTH_EXPORT_WATCH_DIR',
  watchEnabled: 'HEALTH_IMPORT_WATCH_ENABLED',
  serverPort: 'HEALTH_IMPORT_SERVER_PORT',
  scanIntervalMs: 'HEALTH_IMPORT_SCAN_INTERVAL_MS',
  usePolling: 'HEALTH_IMPORT_USE_POLLING',
  pollIntervalMs: 'HEALTH_IMPORT_POLL_INTERVAL_MS',
  awaitWriteStabilityMs: 'HEALTH_IMPORT_AWAIT_WRITE_STABILITY_MS',
  dataDir: 'HEALTH_IMPORT_DATA_DIR',
  processedDataDir: 'PROCESSED_DATA_DIR',
  processedDataBackupDir: 'PROCESSED_DATA_BACKUP_DIR',
}

export function loadHealthImportConfig(
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): HealthImportConfig {
  const fileEnv = loadEnvFile(resolve(cwd, '.env.local'))
  const mergedEnv = {
    ...fileEnv,
    ...env,
  }
  const watchDir = resolve(
    getString(
      mergedEnv,
      envKeys.watchDir,
      resolve(cwd, 'health-auto-export', 'Sleep'),
    ),
  )
  const dataDir = resolve(
    getString(mergedEnv, envKeys.dataDir, resolve(cwd, 'server-data')),
  )
  const processedDataDir = resolve(
    getString(mergedEnv, envKeys.processedDataDir, resolve(cwd, 'processed-data')),
  )
  const backupValue = getOptionalString(mergedEnv, envKeys.processedDataBackupDir)
  const processedDataBackupDir = backupValue ? resolve(backupValue) : null

  assertOutsideRawRoot(watchDir, dataDir, 'HEALTH_IMPORT_DATA_DIR')
  assertOutsideRawRoot(watchDir, processedDataDir, 'PROCESSED_DATA_DIR')
  if (processedDataBackupDir) {
    assertOutsideRawRoot(watchDir, processedDataBackupDir, 'PROCESSED_DATA_BACKUP_DIR')
  }

  return {
    watchDir,
    watchEnabled: getBoolean(
      mergedEnv,
      envKeys.watchEnabled,
      defaultHealthImportConfig.watchEnabled,
    ),
    serverPort: getPositiveInteger(
      mergedEnv,
      envKeys.serverPort,
      defaultHealthImportConfig.serverPort,
    ),
    scanIntervalMs: getPositiveInteger(
      mergedEnv,
      envKeys.scanIntervalMs,
      defaultHealthImportConfig.scanIntervalMs,
    ),
    usePolling: getBoolean(mergedEnv, envKeys.usePolling, defaultHealthImportConfig.usePolling),
    pollIntervalMs: getPositiveInteger(
      mergedEnv,
      envKeys.pollIntervalMs,
      defaultHealthImportConfig.pollIntervalMs,
    ),
    awaitWriteStabilityMs: getPositiveInteger(
      mergedEnv,
      envKeys.awaitWriteStabilityMs,
      defaultHealthImportConfig.awaitWriteStabilityMs,
    ),
    dataDir,
    processedDataDir,
    processedDataBackupDir,
  }
}

export function toChokidarOptions(config: HealthImportConfig) {
  return {
    ignoreInitial: false,
    usePolling: config.usePolling,
    interval: config.pollIntervalMs,
    awaitWriteFinish: {
      stabilityThreshold: config.awaitWriteStabilityMs,
      pollInterval: Math.min(config.pollIntervalMs, config.awaitWriteStabilityMs),
    },
  }
}

function assertOutsideRawRoot(rawRoot: string, candidate: string, envKey: string): void {
  const relativePath = relative(resolve(rawRoot), resolve(candidate))

  if (!relativePath || relativePath === '.') {
    throw new Error(`${envKey} must not be the raw Health Auto Export watch directory`)
  }

  if (!relativePath.startsWith('..') && !isAbsolute(relativePath)) {
    throw new Error(`${envKey} must be outside HEALTH_EXPORT_WATCH_DIR`)
  }
}

function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    return {}
  }

  return parseEnv(readFileSync(path, 'utf8'))
}

export function parseEnv(text: string): Record<string, string> {
  const values: Record<string, string> = {}

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()

    if (!line || line.startsWith('#')) {
      continue
    }

    const separatorIndex = line.indexOf('=')

    if (separatorIndex === -1) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()

    if (key) {
      values[key] = stripQuotes(value)
    }
  }

  return values
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

function getString(env: Record<string, string | undefined>, key: string, fallback: string): string {
  const value = env[key]
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function getOptionalString(
  env: Record<string, string | undefined>,
  key: string,
): string | null {
  const value = env[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getPositiveInteger(
  env: Record<string, string | undefined>,
  key: string,
  fallback: number,
): number {
  const value = Number(env[key])
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function getBoolean(
  env: Record<string, string | undefined>,
  key: string,
  fallback: boolean,
): boolean {
  const value = env[key]

  if (typeof value !== 'string') {
    return fallback
  }

  if (['true', '1', 'yes', 'on'].includes(value.toLowerCase())) {
    return true
  }

  if (['false', '0', 'no', 'off'].includes(value.toLowerCase())) {
    return false
  }

  return fallback
}
