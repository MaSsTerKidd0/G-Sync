/**
 * Google Photos Library API client.
 *
 * Uses the same OAuth tokens as Drive (photoslibrary.readonly scope).
 * Rate-limited via the shared throttledDriveCall() bottleneck.
 */

import { getValidAccessToken } from '../auth/googleOAuth'
import { throttledDriveCall } from '../drive/rateLimiter'

const PHOTOS_BASE = 'https://photoslibrary.googleapis.com/v1'

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
  console.log("🔐 Verifying token scopes...")

  console.log("token head/tail:", token.slice(0, 12), token.slice(-12))
  const tokenInfoRes = await fetch(
  `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`
  )

  const tokenInfo = await tokenInfoRes.json()
  console.log("📜 Token scopes:", tokenInfo.scope)

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

console.log("Status:", res.status)
console.log("WWW-Authenticate:", res.headers.get("www-authenticate"))
console.log("Body:", bodyText)

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
