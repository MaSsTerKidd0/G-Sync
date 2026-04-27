/**
 * Google Photos Library API client.
 *
 * Uses the same OAuth tokens as Drive (photoslibrary.readonly scope).
 * Rate-limited via the shared throttledDriveCall() bottleneck.
 *
 * NOTE: As of Google's March 2025 policy change, mediaItems.list only returns
 * items uploaded by the calling app. This client is being deprecated; the
 * Photos tab is scheduled for removal in v1.1.0.
 */

import { getValidAccessToken } from '../auth/googleOAuth'
import { throttledDriveCall } from '../drive/rateLimiter'

const PHOTOS_BASE = 'https://photoslibrary.googleapis.com/v1'

// Toggle verbose Photos-API debug logs via `GSYNC_DEBUG=1` in the environment.
// Bug #10 fix: previously logged partial bearer tokens unconditionally — never
// log token material in production.
const DEBUG = process.env.GSYNC_DEBUG === '1'

// ── Types ──

export interface PhotoMediaMetadata {
  creationTime?: string
  width?: string
  height?: string
  photo?: {
    cameraMake?: string
    cameraModel?: string
  }
  video?: {
    cameraMake?: string
    cameraModel?: string
    fps?: number
    status?: string
  }
}

export interface PhotoMediaItem {
  id: string
  productUrl: string
  baseUrl: string
  mimeType: string
  filename: string
  mediaMetadata: PhotoMediaMetadata
}

export interface ListMediaItemsResult {
  mediaItems: PhotoMediaItem[]
  nextPageToken?: string
}

// ── API ──

async function getPhotosAuthHeaders(): Promise<Record<string, string>> {
  const token = await getValidAccessToken()
  if (!token) throw new Error('Not authenticated — no valid access token')

  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
}

/**
 * List media items from Google Photos.
 * Returns paginated results with baseUrl (valid for ~60 min, no auth needed).
 */
export async function listMediaItems(opts?: {
  pageToken?: string
  pageSize?: number
}): Promise<ListMediaItemsResult> {
  const headers = await getPhotosAuthHeaders()
  const params = new URLSearchParams()
  params.set('pageSize', String(opts?.pageSize ?? 50))
  if (opts?.pageToken) params.set('pageToken', opts.pageToken)

  const url = `${PHOTOS_BASE}/mediaItems?${params.toString()}`

  const res = await fetch(url, { method: 'GET', headers })
  const bodyText = await res.text()

  if (DEBUG) {
    console.log('[photos] status=%d www-auth=%s', res.status, res.headers.get('www-authenticate'))
  }

  if (!res.ok) {
    throw Object.assign(
      new Error(`Photos API error (${res.status}): ${bodyText}`),
      { status: res.status }
    )
  }

  const data = JSON.parse(bodyText)
  return {
    mediaItems: data.mediaItems ?? [],
    nextPageToken: data.nextPageToken
  }
}

/**
 * Rate-limited wrapper for listMediaItems.
 */
export async function listMediaItemsThrottled(opts?: {
  pageToken?: string
  pageSize?: number
}): Promise<ListMediaItemsResult> {
  return throttledDriveCall(() => listMediaItems(opts))
}
