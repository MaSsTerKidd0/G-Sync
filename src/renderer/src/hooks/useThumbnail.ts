/**
 * Thumbnail loader hook with in-memory LRU cache + object URL lifecycle.
 *
 * Per the spec:
 * - thumbnailLink is short-lived, so we fetch via main-process proxy
 * - Cache keyed by (fileId, thumbnailVersion)
 * - Memory cap of MAX_IN_MEM entries, LRU eviction
 * - Revoke object URLs on eviction to prevent memory leaks
 */

import { useState, useEffect } from 'react'

type ThumbKey = string // `${fileId}:${thumbnailVersion ?? 'none'}`
interface ThumbCacheEntry {
  url: string
  lastUsed: number
}

const memCache = new Map<ThumbKey, ThumbCacheEntry>()
const MAX_IN_MEM = 200

function evictIfNeeded(): void {
  if (memCache.size <= MAX_IN_MEM) return
  const entries = [...memCache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)
  const toRemove = entries.slice(0, memCache.size - MAX_IN_MEM)
  for (const [key, entry] of toRemove) {
    URL.revokeObjectURL(entry.url)
    memCache.delete(key)
  }
}

export function useThumbnail(args: {
  fileId: string
  hasThumbnail?: boolean | null
  thumbnailVersion?: string | null
}): string | null {
  const { fileId, hasThumbnail, thumbnailVersion } = args
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!hasThumbnail) {
      setUrl(null)
      return
    }

    const key: ThumbKey = `${fileId}:${thumbnailVersion ?? 'none'}`
    const cached = memCache.get(key)
    if (cached) {
      cached.lastUsed = Date.now()
      setUrl(cached.url)
      return
    }

    let cancelled = false

    ;(async () => {
      try {
        const res = await window.gsync.explorer.getThumbnail({
          fileId,
          thumbnailVersion
        })
        if (!res || cancelled) return

        const bytes = Uint8Array.from(atob(res.bytesBase64), (c) => c.charCodeAt(0))
        const blob = new Blob([bytes], { type: res.mimeType })
        const blobUrl = URL.createObjectURL(blob)

        memCache.set(key, { url: blobUrl, lastUsed: Date.now() })
        evictIfNeeded()
        if (!cancelled) setUrl(blobUrl)
      } catch {
        // Thumbnail fetch failed — will show fallback icon
      }
    })()

    return () => {
      cancelled = true
    }
  }, [fileId, hasThumbnail, thumbnailVersion])

  return url
}
