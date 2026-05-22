import { createHash } from 'node:crypto'
import { GoogleAuth } from 'google-auth-library'

export type DriveJsonFile = {
  fileId: string
  fileName: string
  mimeType?: string
  modifiedTime?: string
  size?: string
  md5Checksum?: string
}

export type DownloadedDriveJsonFile = DriveJsonFile & {
  byteLength: number
  sha256: string
  value: unknown
}

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3'
const MAX_DRIVE_JSON_BYTES = 32 * 1024 * 1024

export function getDriveFolderId(): string | null {
  return process.env.HEALTH_EXPORT_DRIVE_FOLDER_ID?.trim() || null
}

export function getDriveSyncMaxFiles(): number | null {
  const value = Number(process.env.DRIVE_SYNC_MAX_FILES)

  if (!Number.isInteger(value) || value <= 0) {
    return null
  }

  return value
}

export async function listHealthAutoExportJsonFiles(folderId: string): Promise<DriveJsonFile[]> {
  const token = await getAccessToken()
  const files: DriveJsonFile[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(`${DRIVE_API_BASE}/files`)
    url.searchParams.set(
      'q',
      `'${escapeDriveQueryValue(folderId)}' in parents and trashed = false and (mimeType = 'application/json' or name contains '.json')`,
    )
    url.searchParams.set('fields', 'nextPageToken, files(id,name,mimeType,modifiedTime,size,md5Checksum)')
    url.searchParams.set('orderBy', 'modifiedTime desc')
    url.searchParams.set('pageSize', '100')

    if (pageToken) {
      url.searchParams.set('pageToken', pageToken)
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error('Google Driveのファイル一覧を取得できませんでした。フォルダ共有とDrive API権限を確認してください。')
    }

    const body = (await response.json()) as {
      nextPageToken?: string
      files?: Array<{
        id?: string
        name?: string
        mimeType?: string
        modifiedTime?: string
        size?: string
        md5Checksum?: string
      }>
    }

    for (const file of body.files ?? []) {
      if (!file.id || !file.name || !file.name.toLowerCase().endsWith('.json')) {
        continue
      }

      files.push({
        fileId: file.id,
        fileName: file.name,
        ...(file.mimeType ? { mimeType: file.mimeType } : {}),
        ...(file.modifiedTime ? { modifiedTime: file.modifiedTime } : {}),
        ...(file.size ? { size: file.size } : {}),
        ...(file.md5Checksum ? { md5Checksum: file.md5Checksum } : {}),
      })
    }

    pageToken = body.nextPageToken
  } while (pageToken)

  return files
}

export async function downloadDriveJsonFile(file: DriveJsonFile): Promise<DownloadedDriveJsonFile> {
  const token = await getAccessToken()
  const response = await fetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(file.fileId)}?alt=media`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    throw new Error('Google DriveのJSONファイルを取得できませんでした。')
  }

  const bytes = Buffer.from(await response.arrayBuffer())

  if (bytes.byteLength > MAX_DRIVE_JSON_BYTES) {
    throw new Error('Google DriveのJSONファイルが大きすぎます。')
  }

  try {
    return {
      ...file,
      byteLength: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      value: JSON.parse(bytes.toString('utf8')) as unknown,
    }
  } catch {
    throw new Error('Google DriveのファイルはJSONとして読めませんでした。')
  }
}

async function getAccessToken(): Promise<string> {
  const auth = new GoogleAuth({
    scopes: [DRIVE_SCOPE],
    ...(process.env.GOOGLE_CLOUD_PROJECT ? { projectId: process.env.GOOGLE_CLOUD_PROJECT } : {}),
  })
  const client = await auth.getClient()
  const token = await client.getAccessToken()

  if (!token.token) {
    throw new Error('Google Drive APIのアクセストークンを取得できませんでした。')
  }

  return token.token
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}
