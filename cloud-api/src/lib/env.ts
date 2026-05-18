import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import dotenv from 'dotenv'

export function loadLocalEnv(cwd = process.cwd()): void {
  const localEnvPath = resolve(cwd, '.env.local')
  const envPath = resolve(cwd, '.env')
  const selectedPath = existsSync(localEnvPath)
    ? localEnvPath
    : existsSync(envPath)
      ? envPath
      : null

  if (!selectedPath) {
    return
  }

  dotenv.config({
    path: selectedPath,
    override: false,
  })
}
