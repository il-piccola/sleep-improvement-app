import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const defaultHealthImportConfig = {
  watchDir: 'K:\\マイドライブ\\Health Auto Export\\Sleep',
  serverPort: 8787,
  scanIntervalMs: 300_000,
  usePolling: true,
  pollIntervalMs: 10_000,
  awaitWriteStabilityMs: 5_000,
}

const envKeys = {
  watchDir: 'HEALTH_EXPORT_WATCH_DIR',
  serverPort: 'HEALTH_IMPORT_SERVER_PORT',
  scanIntervalMs: 'HEALTH_IMPORT_SCAN_INTERVAL_MS',
  usePolling: 'HEALTH_IMPORT_USE_POLLING',
  pollIntervalMs: 'HEALTH_IMPORT_POLL_INTERVAL_MS',
  awaitWriteStabilityMs: 'HEALTH_IMPORT_AWAIT_WRITE_STABILITY_MS',
}

export function loadHealthImportConfig({
  cwd = process.cwd(),
  env = process.env,
  envFile = '.env.local',
} = {}) {
  const fileEnv = loadEnvFile(resolve(cwd, envFile))
  const mergedEnv = {
    ...fileEnv,
    ...env,
  }

  return {
    watchDir: getString(mergedEnv, envKeys.watchDir, defaultHealthImportConfig.watchDir),
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
  }
}

export function toChokidarOptions(config) {
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

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return {}
  }

  return parseEnv(readFileSync(path, 'utf8'))
}

export function parseEnv(text) {
  const values = {}

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

    if (!key) {
      continue
    }

    values[key] = stripQuotes(value)
  }

  return values
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

function getString(env, key, fallback) {
  const value = env[key]
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function getPositiveInteger(env, key, fallback) {
  const value = Number(env[key])
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function getBoolean(env, key, fallback) {
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
