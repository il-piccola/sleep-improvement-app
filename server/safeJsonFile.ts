import { copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'

export type JsonStateLoadStatus = 'ok' | 'missing' | 'recovered_from_backup'

export type JsonStateLoadResult<T> = {
  value: T
  status: JsonStateLoadStatus
}

export class JsonStateCorruptionError extends Error {
  readonly path: string

  constructor(path: string, message: string) {
    super(message)
    this.name = 'JsonStateCorruptionError'
    this.path = path
  }
}

export async function loadJsonState<T>({
  defaultValue,
  path,
  validate,
}: {
  defaultValue: T
  path: string
  validate: (value: unknown) => T | null
}): Promise<JsonStateLoadResult<T>> {
  const primary = await readValidated(path, validate)

  if (primary.kind === 'ok') {
    return { value: primary.value, status: 'ok' }
  }

  const backupPath = getBackupPath(path)
  const backup = await readValidated(backupPath, validate)

  if (backup.kind === 'ok') {
    return { value: backup.value, status: 'recovered_from_backup' }
  }

  if (primary.kind === 'missing' && backup.kind === 'missing') {
    return { value: structuredClone(defaultValue), status: 'missing' }
  }

  throw new JsonStateCorruptionError(
    path,
    `State file is unreadable or invalid and no valid backup is available: ${basename(path)}`,
  )
}

export async function writeJsonStateAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })

  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const tempPath = `${path}.${suffix}.tmp`
  const backupPath = getBackupPath(path)
  const backupTempPath = `${backupPath}.${suffix}.tmp`
  const body = `${JSON.stringify(value, null, 2)}\n`

  await writeFile(tempPath, body, 'utf8')

  let primaryExisted = false

  try {
    await copyFile(path, backupTempPath)
    primaryExisted = true
    await replaceFile(backupTempPath, backupPath)
  } catch (error) {
    if (!isMissing(error)) {
      await removeIfExists(tempPath)
      await removeIfExists(backupTempPath)
      throw error
    }
  }

  try {
    await replaceFile(tempPath, path)
  } catch (error) {
    await removeIfExists(tempPath)

    if (primaryExisted && (await isPathMissing(path))) {
      try {
        await copyFile(backupPath, path)
      } catch {
        // Preserve the original write error. The backup remains available to the loader.
      }
    }

    throw error
  } finally {
    await removeIfExists(backupTempPath)
  }
}

export function getBackupPath(path: string): string {
  return `${path}.bak`
}

async function readValidated<T>(
  path: string,
  validate: (value: unknown) => T | null,
): Promise<{ kind: 'ok'; value: T } | { kind: 'missing' } | { kind: 'invalid' }> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown
    const validated = validate(parsed)
    return validated === null ? { kind: 'invalid' } : { kind: 'ok', value: validated }
  } catch (error) {
    if (isMissing(error)) {
      return { kind: 'missing' }
    }

    if (error instanceof SyntaxError) {
      return { kind: 'invalid' }
    }

    throw error
  }
}

async function replaceFile(source: string, destination: string): Promise<void> {
  try {
    await rename(source, destination)
    return
  } catch (error) {
    if (!isDestinationExists(error)) {
      throw error
    }
  }

  await unlink(destination)
  await rename(source, destination)
}

async function removeIfExists(path: string): Promise<void> {
  try {
    await unlink(path)
  } catch (error) {
    if (!isMissing(error)) {
      throw error
    }
  }
}

async function isPathMissing(path: string): Promise<boolean> {
  try {
    await readFile(path)
    return false
  } catch (error) {
    if (isMissing(error)) return true
    throw error
  }
}

function isMissing(error: unknown): boolean {
  return getErrorCode(error) === 'ENOENT'
}

function isDestinationExists(error: unknown): boolean {
  return ['EEXIST', 'EPERM', 'ENOTEMPTY'].includes(getErrorCode(error) ?? '')
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined
}
