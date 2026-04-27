/**
 * PhotosGrid — displays Google Photos media items in a responsive grid.
 *
 * Fetches paginated data from the Photos Library API via window.gsync.photos.list().
 * Infinite scroll via IntersectionObserver. Thumbnails use baseUrl (no auth needed).
 * Clicking an item opens it in Google Photos via productUrl.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Image, Film, AlertCircle, RefreshCw, Loader2 } from 'lucide-react'

interface PhotoMediaItem {
  id: string
  productUrl: string
  baseUrl: string
  mimeType: string
  filename: string
  mediaMetadata: {
    creationTime?: string
    width?: string
    height?: string
    photo?: { cameraMake?: string; cameraModel?: string }
    video?: { cameraMake?: string; cameraModel?: string; fps?: number; status?: string }
  }
}

export default function PhotosGrid() {
  const [items, setItems] = useState<PhotoMediaItem[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)

  const loadingRef = useRef(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const fetchPage = useCallback(async (pageToken?: string, append = false) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setError(null)

    try {
      const result = await window.gsync.photos.list({
        pageToken,
        pageSize: 50
      })

      if (!result.success) {
        setError(result.error ?? 'Failed to load photos')
        return
      }

      if (append) {
        setItems((prev) => {
          const existingIds = new Set(prev.map((i) => i.id))
          const newItems = result.mediaItems.filter((i) => !existingIds.has(i.id))
          return [...prev, ...newItems]
        })
      } else {
        setItems(result.mediaItems)
      }

      setNextPageToken(result.nextPageToken)
      setHasMore(!!result.nextPageToken)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      loadingRef.current = false
      setLoading(false)
      setInitialLoading(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchPage()
  }, [fetchPage])

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingRef.current) {
          fetchPage(nextPageToken, true)
        }
      },
      { rootMargin: '400px' }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, nextPageToken, fetchPage])

  const handleOpenInPhotos = useCallback((productUrl: string) => {
    window.open(productUrl, '_blank')
  }, [])

  const handleRetry = useCallback(() => {
    setItems([])
    setNextPageToken(undefined)
    setHasMore(true)
    setInitialLoading(true)
    fetchPage()
  }, [fetchPage])

  const isVideo = useCallback((mimeType: string) => mimeType.startsWith('video/'), [])

  const formatDate = useCallback((isoDate?: string) => {
    if (!isoDate) return ''
    try {
      return new Date(isoDate).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch {
      return ''
    }
  }, [])

  // ── Initial loading skeleton ──
  if (initialLoading) {
    return (
      <div className="h-full p-4 overflow-auto custom-scrollbar">
        <div className="flex items-center gap-2 mb-4">
          <Image size={16} className="text-g-primary dark:text-g-primary-dark" />
          <span className="text-sm font-medium text-g-text dark:text-g-text-dark">Photos</span>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-square rounded-xl bg-g-border dark:bg-g-border-dark" />
              <div className="mt-2 h-3 w-3/4 rounded bg-g-border dark:bg-g-border-dark" />
              <div className="mt-1 h-2.5 w-1/2 rounded bg-g-border/60 dark:bg-g-border-dark/60" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Error state ──
  if (error && items.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="w-16 h-16 text-g-secondary dark:text-g-secondary-dark mb-4" />
        <p className="text-sm font-medium text-g-text dark:text-g-text-dark mb-1">
          Failed to load photos
        </p>
        <p className="text-xs text-g-text-secondary dark:text-g-text-secondary-dark mb-4 max-w-md">
          {error}
        </p>
        <button
          onClick={handleRetry}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-g-primary dark:text-g-primary-dark bg-g-primary/10 dark:bg-g-primary-dark/10 hover:bg-g-primary/15 dark:hover:bg-g-primary-dark/15 rounded-lg transition-colors"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    )
  }

  // ── Empty state ──
  if (items.length === 0 && !hasMore) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <Image className="w-16 h-16 text-g-border dark:text-g-border-dark mb-4" />
        <p className="text-sm font-medium text-g-text-secondary dark:text-g-text-secondary-dark">
          No photos or videos
        </p>
        <p className="text-xs text-g-text-disabled dark:text-g-text-disabled-dark mt-1">
          Your Google Photos library is empty
        </p>
      </div>
    )
  }

  // ── Grid ──
  return (
    <div className="h-full p-4 overflow-auto custom-scrollbar">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 flex-shrink-0">
        <Image size={16} className="text-g-primary dark:text-g-primary-dark" />
        <span className="text-sm font-medium text-g-text dark:text-g-text-dark">Photos</span>
        <span className="text-xs text-g-text-disabled dark:text-g-text-disabled-dark">
          {items.length.toLocaleString()} loaded{hasMore ? '+' : ''}
        </span>
      </div>

      {/* Grid */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
      >
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => handleOpenInPhotos(item.productUrl)}
            className="group text-left rounded-xl overflow-hidden bg-g-surface dark:bg-g-btn-secondary-dark border border-g-border dark:border-g-border-dark hover:border-g-primary/40 dark:hover:border-g-primary-dark/40 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-g-primary/30 dark:focus:ring-g-primary-dark/30"
            title={item.filename}
          >
            {/* Thumbnail */}
            <div className="relative aspect-square overflow-hidden bg-g-border/30 dark:bg-g-border-dark/30">
              <img
                src={`${item.baseUrl}=w300-h300-c`}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                referrerPolicy="no-referrer"
              />
              {/* Video badge */}
              {isVideo(item.mimeType) && (
                <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-medium">
                  <Film size={10} />
                  Video
                </div>
              )}
            </div>
            {/* Info */}
            <div className="px-2.5 py-2">
              <p className="text-xs font-medium text-g-text dark:text-g-text-dark truncate">
                {item.filename}
              </p>
              <p className="text-[10px] text-g-text-disabled dark:text-g-text-disabled-dark mt-0.5">
                {formatDate(item.mediaMetadata.creationTime)}
                {item.mediaMetadata.photo?.cameraModel && (
                  <> &middot; {item.mediaMetadata.photo.cameraModel}</>
                )}
                {item.mediaMetadata.video?.cameraModel && (
                  <> &middot; {item.mediaMetadata.video.cameraModel}</>
                )}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-px" />

      {/* Loading more indicator */}
      {loading && items.length > 0 && (
        <div className="flex items-center justify-center gap-2 py-6 text-g-text-disabled dark:text-g-text-disabled-dark">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-xs">Loading more photos...</span>
        </div>
      )}

      {/* Inline error for subsequent pages */}
      {error && items.length > 0 && (
        <div className="flex items-center justify-center gap-2 py-4">
          <span className="text-xs text-g-secondary dark:text-g-secondary-dark">{error}</span>
          <button
            onClick={() => fetchPage(nextPageToken, true)}
            className="text-xs text-g-primary dark:text-g-primary-dark hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* End of list */}
      {!hasMore && items.length > 0 && (
        <div className="flex items-center justify-center py-6">
          <span className="text-xs text-g-text-disabled dark:text-g-text-disabled-dark">
            All photos loaded
          </span>
        </div>
      )}
    </div>
  )
}
