import { getValidAccessToken } from '../auth/googleOAuth'

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3'

// Fields we request for every file — matches the Phase 2+3 schema
const FILE_FIELDS = [
  'id', 'name', 'mimeType', 'parents', 'driveId', 'resourceKey',
  'starred',
  'trashed', 'explicitlyTrashed',
  'createdTime', 'modifiedTime', 'viewedByMeTime', 'sharedWithMeTime',
  'size',
  'md5Checksum', 'sha256Checksum', 'sha1Checksum',
  'iconLink', 'hasThumbnail', 'thumbnailLink', 'thumbnailVersion',
  'shortcutDetails/targetId', 'shortcutDetails/targetResourceKey',
  'capabilities/canMoveItemWithinDrive', 'capabilities/canDelete', 'capabilities/canTrash'
].join(',')

const FILES_LIST_FIELDS = `nextPageToken,incompleteSearch,files(${FILE_FIELDS})`
const CHANGES_LIST_FIELDS = `nextPageToken,newStartPageToken,changes(changeType,fileId,removed,time,driveId,file(${FILE_FIELDS}))`

// ── Types ──

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  parents?: string[]
  driveId?: string
  resourceKey?: string
  starred?: boolean
  trashed?: boolean
  explicitlyTrashed?: boolean
  createdTime?: string
  modifiedTime?: string
  viewedByMeTime?: string
  sharedWithMeTime?: string
  size?: string // int64 string from Drive
  md5Checksum?: string
  sha256Checksum?: string
  sha1Checksum?: string
  iconLink?: string
  hasThumbnail?: boolean
  thumbnailLink?: string   // short-lived URL — do NOT persist; use main-process proxy
  thumbnailVersion?: string // cache invalidation key
  shortcutDetails?: {
    targetId?: string
    targetResourceKey?: string
  }
  capabilities?: {
    canMoveItemWithinDrive?: boolean
    canDelete?: boolean
    canTrash?: boolean
  }
}

export interface FilesListPage {
  files: DriveFile[]
  nextPageToken?: string
  incompleteSearch?: boolean
}

export interface DriveChange {
  changeType: string // "file" | "drive"
  fileId?: string
  removed?: boolean
  time?: string
  driveId?: string
  file?: DriveFile
}

export interface ChangesListPage {
  changes: DriveChange[]
  nextPageToken?: string
  newStartPageToken?: string
}

// ── Helpers ──

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getValidAccessToken()
  if (!token) throw new Error('Not authenticated — no valid access token')
  return { Authorization: `Bearer ${token}` }
}

async function driveGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const headers = await getAuthHeaders()
  const qs = new URLSearchParams(params).toString()
  const url = `${DRIVE_BASE}${path}?${qs}`

  const res = await fetch(url, { headers })

  if (!res.ok) {
    const body = await res.text()
    const err = new Error(`Drive API ${res.status}: ${body}`) as Error & { status: number }
    err.status = res.status
    throw err
  }
  return res.json() as Promise<T>
}

// ── Public API ──

/**
 * Paginated files.list — returns one page at a time.
 * Caller is responsible for iterating via nextPageToken.
 */
export async function listFilesPage(opts: {
  pageSize?: number
  pageToken?: string
  corpora?: string
  driveId?: string
}): Promise<FilesListPage> {
  const params: Record<string, string> = {
    pageSize: String(opts.pageSize ?? 1000),
    fields: FILES_LIST_FIELDS,
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true'
  }
  if (opts.pageToken) params.pageToken = opts.pageToken
  if (opts.corpora) params.corpora = opts.corpora
  if (opts.driveId) params.driveId = opts.driveId

  const data = await driveGet<{
    files?: DriveFile[]
    nextPageToken?: string
    incompleteSearch?: boolean
  }>('/files', params)

  return {
    files: data.files ?? [],
    nextPageToken: data.nextPageToken,
    incompleteSearch: data.incompleteSearch
  }
}

/**
 * Get the initial start page token for the changes feed.
 */
export async function getStartPageToken(): Promise<string> {
  const data = await driveGet<{ startPageToken: string }>(
    '/changes/startPageToken',
    { supportsAllDrives: 'true' }
  )
  return data.startPageToken
}

/**
 * Paginated changes.list — returns one page at a time.
 * Caller handles nextPageToken / newStartPageToken semantics.
 */
export async function listChangesPage(opts: {
  pageToken: string
  pageSize?: number
}): Promise<ChangesListPage> {
  const params: Record<string, string> = {
    pageToken: opts.pageToken,
    pageSize: String(opts.pageSize ?? 1000),
    fields: CHANGES_LIST_FIELDS,
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    includeRemoved: 'true'
  }

  const data = await driveGet<{
    changes?: DriveChange[]
    nextPageToken?: string
    newStartPageToken?: string
  }>('/changes', params)

  return {
    changes: data.changes ?? [],
    nextPageToken: data.nextPageToken,
    newStartPageToken: data.newStartPageToken
  }
}

/**
 * Legacy convenience wrapper used by Phase 1 UI.
 * Kept for backward compatibility — the sync engine uses listFilesPage directly.
 */
export async function listFiles(pageSize = 20): Promise<{ files: DriveFile[] }> {
  const page = await listFilesPage({ pageSize })
  return { files: page.files }
}

// ── Phase 4: Drive Write Operations ──

export interface DriveApiError extends Error {
  status: number
  reason?: string
  body?: string
}

function makeDriveError(status: number, body: string): DriveApiError {
  let reason: string | undefined
  try {
    const parsed = JSON.parse(body)
    reason = parsed?.error?.errors?.[0]?.reason
  } catch {
    // ignore parse errors
  }
  const err = new Error(`Drive API ${status}: ${body}`) as DriveApiError
  err.status = status
  err.reason = reason
  err.body = body
  return err
}

/**
 * Classify a Drive API error into transient (retryable) vs permanent.
 */
export function classifyDriveError(err: DriveApiError): {
  retryable: boolean
  code: string
} {
  const s = err.status
  const reason = err.reason ?? ''

  // 429 — always retryable
  if (s === 429) return { retryable: true, code: 'DRIVE_RATE_LIMITED' }

  // 5xx — transient server errors
  if (s >= 500) return { retryable: true, code: 'DRIVE_BACKEND_ERROR' }

  // 403 — inspect reason: quota-like are retryable, privilege are permanent
  if (s === 403) {
    const quotaReasons = ['userRateLimitExceeded', 'rateLimitExceeded', 'dailyLimitExceeded', 'sharingRateLimitExceeded']
    if (quotaReasons.includes(reason)) {
      return { retryable: true, code: 'DRIVE_QUOTA_EXCEEDED' }
    }
    return { retryable: false, code: 'DRIVE_PERMISSION_DENIED' }
  }

  // 404 — file not found, permanent
  if (s === 404) return { retryable: false, code: 'DRIVE_NOT_FOUND' }

  // Everything else — permanent
  return { retryable: false, code: `DRIVE_ERROR_${s}` }
}

/**
 * PATCH files.update — used for move (addParents/removeParents), rename, trash/untrash.
 */
export async function updateFile(opts: {
  fileId: string
  body?: Record<string, unknown>
  addParents?: string
  removeParents?: string
}): Promise<DriveFile> {
  const headers = await getAuthHeaders()
  headers['Content-Type'] = 'application/json'

  const params: Record<string, string> = {
    supportsAllDrives: 'true',
    fields: FILE_FIELDS
  }
  if (opts.addParents) params.addParents = opts.addParents
  if (opts.removeParents) params.removeParents = opts.removeParents

  const qs = new URLSearchParams(params).toString()
  const url = `${DRIVE_BASE}/files/${encodeURIComponent(opts.fileId)}?${qs}`

  const res = await fetch(url, {
    method: 'PATCH',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  })

  if (!res.ok) {
    const body = await res.text()
    throw makeDriveError(res.status, body)
  }

  return res.json() as Promise<DriveFile>
}

// ── Phase 10: Download Operations ──

/** Mime types that are Google Workspace docs (cannot be downloaded directly — must be exported). */
const WORKSPACE_EXPORT_MAP: Record<string, string> = {
  'application/vnd.google-apps.document': 'application/pdf',
  'application/vnd.google-apps.spreadsheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.google-apps.presentation': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.google-apps.drawing': 'image/png',
  'application/vnd.google-apps.jam': 'application/pdf'
}

/** Extension map for exported Workspace files. */
const EXPORT_EXTENSION_MAP: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'image/png': '.png'
}

/**
 * Check if a MIME type is a Google Workspace type that requires export.
 */
export function isWorkspaceMime(mimeType: string): boolean {
  return mimeType in WORKSPACE_EXPORT_MAP
}

/**
 * Get the file extension to append for exported Workspace files.
 */
export function getExportExtension(mimeType: string): string {
  const exportMime = WORKSPACE_EXPORT_MAP[mimeType]
  if (!exportMime) return ''
  return EXPORT_EXTENSION_MAP[exportMime] ?? ''
}

/**
 * Download raw file content as a Buffer.
 * For Google Workspace files (Docs/Sheets/Slides), exports to a standard format.
 */
export async function downloadFileBuffer(fileId: string, mimeType: string): Promise<Buffer> {
  const headers = await getAuthHeaders()

  let url: string
  if (isWorkspaceMime(mimeType)) {
    const exportMime = WORKSPACE_EXPORT_MAP[mimeType]!
    const params = new URLSearchParams({ mimeType: exportMime })
    url = `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}/export?${params}`
  } else {
    const params = new URLSearchParams({ alt: 'media', supportsAllDrives: 'true' })
    url = `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?${params}`
  }

  const res = await fetch(url, { headers })

  if (!res.ok) {
    const body = await res.text()
    throw makeDriveError(res.status, body)
  }

  const arrayBuf = await res.arrayBuffer()
  return Buffer.from(arrayBuf)
}

/**
 * DELETE files.delete — permanent deletion.
 */
export async function deleteFile(fileId: string): Promise<void> {
  const headers = await getAuthHeaders()
  const params: Record<string, string> = { supportsAllDrives: 'true' }
  const qs = new URLSearchParams(params).toString()
  const url = `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?${qs}`

  const res = await fetch(url, { method: 'DELETE', headers })

  if (!res.ok) {
    // 404 on delete = already deleted, treat as success
    if (res.status === 404) return
    const body = await res.text()
    throw makeDriveError(res.status, body)
  }
}

/**
 * DELETE files/trash — permanently delete ALL trashed files.
 * Equivalent to "Empty Trash" in Google Drive.
 */
export async function emptyTrash(): Promise<void> {
  const headers = await getAuthHeaders()
  const url = `${DRIVE_BASE}/files/trash`

  const res = await fetch(url, { method: 'DELETE', headers })

  if (!res.ok) {
    const body = await res.text()
    throw makeDriveError(res.status, body)
  }
}

// ── Phase 11: Folder Sync Upload Operations ──

const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3'

/**
 * Create a folder on Google Drive.
 */
export async function createDriveFolder(name: string, parentId?: string): Promise<DriveFile> {
  const headers = await getAuthHeaders()
  headers['Content-Type'] = 'application/json'

  const body: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder'
  }
  if (parentId) body.parents = [parentId]

  const qs = new URLSearchParams({
    fields: FILE_FIELDS,
    supportsAllDrives: 'true'
  }).toString()

  const res = await fetch(`${DRIVE_BASE}/files?${qs}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw makeDriveError(res.status, errBody)
  }

  return res.json() as Promise<DriveFile>
}

/**
 * Upload a new file to Google Drive using multipart upload.
 */
export async function uploadFile(opts: {
  name: string
  parentId: string
  mimeType: string
  buffer: Buffer
}): Promise<DriveFile> {
  const headers = await getAuthHeaders()

  const boundary = `----gsync_boundary_${Date.now()}`
  const metadata = JSON.stringify({
    name: opts.name,
    parents: [opts.parentId]
  })

  // Build multipart body
  const parts: Buffer[] = [
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${opts.mimeType}\r\n\r\n`),
    opts.buffer,
    Buffer.from(`\r\n--${boundary}--`)
  ]
  const body = Buffer.concat(parts)

  headers['Content-Type'] = `multipart/related; boundary=${boundary}`

  const qs = new URLSearchParams({
    uploadType: 'multipart',
    fields: FILE_FIELDS,
    supportsAllDrives: 'true'
  }).toString()

  const res = await fetch(`${DRIVE_UPLOAD_BASE}/files?${qs}`, {
    method: 'POST',
    headers,
    body
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw makeDriveError(res.status, errBody)
  }

  return res.json() as Promise<DriveFile>
}

/**
 * Update an existing file's content on Google Drive using multipart upload.
 */
export async function updateFileContent(opts: {
  fileId: string
  mimeType: string
  buffer: Buffer
}): Promise<DriveFile> {
  const headers = await getAuthHeaders()

  const boundary = `----gsync_boundary_${Date.now()}`
  const metadata = JSON.stringify({})

  // Build multipart body
  const parts: Buffer[] = [
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${opts.mimeType}\r\n\r\n`),
    opts.buffer,
    Buffer.from(`\r\n--${boundary}--`)
  ]
  const body = Buffer.concat(parts)

  headers['Content-Type'] = `multipart/related; boundary=${boundary}`

  const qs = new URLSearchParams({
    uploadType: 'multipart',
    fields: FILE_FIELDS,
    supportsAllDrives: 'true'
  }).toString()

  const res = await fetch(`${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(opts.fileId)}?${qs}`, {
    method: 'PATCH',
    headers,
    body
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw makeDriveError(res.status, errBody)
  }

  return res.json() as Promise<DriveFile>
}

/**
 * Get metadata for a single file on Google Drive (used for conflict detection).
 */
export async function getFileMetadata(fileId: string): Promise<DriveFile> {
  return driveGet<DriveFile>(`/files/${encodeURIComponent(fileId)}`, {
    fields: FILE_FIELDS,
    supportsAllDrives: 'true'
  })
}
