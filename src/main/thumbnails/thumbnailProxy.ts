/**
 * Main-process thumbnail proxy.
 *
 * The Drive API states that thumbnailLink is short-lived, may require
 * credentialed fetches, and is not intended for direct web usage (CORS).
 * This module implements the recommended "main-process proxy" pattern:
 *
 *   1. Renderer asks:  getThumbnail(fileId, thumbnailVersion)
 *   2. Main checks in-memory LRU  (fast path)
 *   3. Main checks disk cache:    userData/thumbnails/{fileId}-{version}.webp
 *   4. If miss: fetch via Node with Authorization header (no CORS issues)
 *   5. Return base64-encoded bytes + MIME type to renderer
 *
 * Cache invalidation is keyed to (fileId, thumbnailVersion).
 */

import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'fs'
import { getDb } from '../db/database'
import { getValidAccessToken } from '../auth/googleOAuth'

// ── Types ──

interface MemCacheEntry {
  bytesBase64: string
  mimeType: string
  lastUsed: number
  sizeBytes: number
}

interface ThumbnailResult {
  mimeType: string
  bytesBase64: string
}

// ── Config ──

const MAX_MEMORY_ENTRIES = 200
const DISK_CACHE_MAX_MB = 500 // 500 MB disk cache cap

// ── State ──

const memCache = new Map<string, MemCacheEntry>()

function getCacheDir(): string {
  const dir = join(app.getPath('userData'), 'thumbnails')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function cacheKey(fileId: string, version: string | null): string {
  return `${fileId}-${version ?? 'none'}`
}

function diskPath(fileId: string, version: string | null): string {
  // Sanitize for filesystem safety
  const safe = cacheKey(fileId, version).replace(/[^a-zA-Z0-9_-]/g, '_')
  return join(getCacheDir(), `${safe}.thumb`)
}

// ── Memory LRU ──

function evictMemoryIfNeeded(): void {
  if (memCache.size <= MAX_MEMORY_ENTRIES) return
  const entries = [...memCache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)
  const toRemove = entries.slice(0, memCache.size - MAX_MEMORY_ENTRIES)
  for (const [key] of toRemove) {
    memCache.delete(key)
  }
}

// ── Disk LRU ──

function evictDiskIfNeeded(): void {
  try {
    const dir = getCacheDir()
    const files = readdirSync(dir).map((name) => {
      const full = join(dir, name)
      const stat = statSync(full)
      return { name, full, size: stat.size, mtimeMs: stat.mtimeMs }
    })

    const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
    const capBytes = DISK_CACHE_MAX_MB * 1024 * 1024

    if (totalBytes <= capBytes) return

    // Sort oldest first, delete until under cap
    files.sort((a, b) => a.mtimeMs - b.mtimeMs)
    let freed = 0
    const target = totalBytes - capBytes
    for (const f of files) {
      if (freed >= target) break
      try {
        unlinkSync(f.full)
        freed += f.size
      } catch {
        // ignore individual file errors
      }
    }
  } catch {
    // cache dir doesn't exist yet — nothing to evict
  }
}

// ── Fetch from Drive ──

async function fetchThumbnailBytes(
  thumbnailLink: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const token = await getValidAccessToken()
  if (!token) return null

  try {
    const res = await fetch(thumbnailLink, {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (!res.ok) {
      console.warn(`[thumb] Fetch failed: ${res.status} for ${thumbnailLink}`)
      return null
    }

    const contentType = res.headers.get('content-type') ?? 'image/png'
    const arrayBuf = await res.arrayBuffer()
    return { buffer: Buffer.from(arrayBuf), mimeType: contentType }
  } catch (err) {
    console.warn('[thumb] Fetch error:', err)
    return null
  }
}

// ── Refresh metadata to get a fresh thumbnailLink ──

async function refreshThumbnailLink(fileId: string): Promise<string | null> {
  const token = await getValidAccessToken()
  if (!token) return null

  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink,thumbnailVersion,hasThumbnail&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) return null

    const data = (await res.json()) as {
      thumbnailLink?: string
      thumbnailVersion?: string
      hasThumbnail?: boolean
    }

    // Update DB with fresh thumbnailVersion
    if (data.thumbnailVersion) {
      try {
        const db = getDb()
        db.prepare(
          'UPDATE drive_items SET has_thumbnail = ?, thumbnail_version = ? WHERE id = ?'
        ).run(data.hasThumbnail ? 1 : 0, data.thumbnailVersion, fileId)
      } catch {
        // DB may be closed during shutdown — non-critical
      }
    }

    return data.thumbnailLink ?? null
  } catch {
    return null
  }
}

// ── Public API ──

/**
 * Get thumbnail bytes for a file. Returns null if no thumbnail available.
 * Follows the spec's pipeline: memory → disk → fetch → refresh-and-retry.
 */
export async function getThumbnail(
  fileId: string,
  thumbnailVersion: string | null | undefined
): Promise<ThumbnailResult | null> {
  const version = thumbnailVersion ?? null
  const key = cacheKey(fileId, version)

  // 1. Memory cache hit
  const memHit = memCache.get(key)
  if (memHit) {
    memHit.lastUsed = Date.now()
    return { mimeType: memHit.mimeType, bytesBase64: memHit.bytesBase64 }
  }

  // 2. Disk cache hit
  const dp = diskPath(fileId, version)
  if (existsSync(dp)) {
    try {
      const raw = readFileSync(dp)
      // First line is mimeType, rest is binary
      const newlineIdx = raw.indexOf(0x0a) // \n
      const mimeType = raw.subarray(0, newlineIdx).toString('utf-8')
      const imageBytes = raw.subarray(newlineIdx + 1)
      const bytesBase64 = imageBytes.toString('base64')

      // Promote to memory
      memCache.set(key, {
        bytesBase64,
        mimeType,
        lastUsed: Date.now(),
        sizeBytes: imageBytes.length
      })
      evictMemoryIfNeeded()

      return { mimeType, bytesBase64 }
    } catch {
      // corrupt cache file — fall through to fetch
    }
  }

  // 3. Fetch from Drive
  // Look up the current thumbnailLink from DB
  let thumbnailLink: string | null = null
  try {
    const db = getDb()
    const row = db
      .prepare('SELECT id FROM drive_items WHERE id = ? AND has_thumbnail = 1')
      .get(fileId) as { id: string } | undefined
    if (!row) return null // No thumbnail for this file
  } catch {
    return null
  }

  // Get a fresh link by refreshing metadata
  thumbnailLink = await refreshThumbnailLink(fileId)
  if (!thumbnailLink) return null

  const result = await fetchThumbnailBytes(thumbnailLink)
  if (!result) {
    // Link may have expired between refresh and fetch — one more try
    const freshLink = await refreshThumbnailLink(fileId)
    if (!freshLink) return null
    const retryResult = await fetchThumbnailBytes(freshLink)
    if (!retryResult) return null
    return storeThumbnail(key, dp, retryResult.buffer, retryResult.mimeType)
  }

  return storeThumbnail(key, dp, result.buffer, result.mimeType)
}

function storeThumbnail(
  key: string,
  dp: string,
  buffer: Buffer,
  mimeType: string
): ThumbnailResult {
  const bytesBase64 = buffer.toString('base64')

  // Store to disk: mimeType\n<binary>
  try {
    const header = Buffer.from(mimeType + '\n', 'utf-8')
    writeFileSync(dp, Buffer.concat([header, buffer]))
    evictDiskIfNeeded()
  } catch (err) {
    console.warn('[thumb] Disk write failed:', err)
  }

  // Store to memory
  memCache.set(key, {
    bytesBase64,
    mimeType,
    lastUsed: Date.now(),
    sizeBytes: buffer.length
  })
  evictMemoryIfNeeded()

  return { mimeType, bytesBase64 }
}

/**
 * Clear all caches (useful for disconnect/logout).
 */
export function clearThumbnailCache(): void {
  memCache.clear()
}
