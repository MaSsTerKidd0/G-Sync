/**
 * SWR-style data hook for the explorer.
 * Cache keyed by { parentId, viewMode, sortBy, sortDir, q, showTrashed }.
 * Invalidated when the main process emits 'explorer:dbChanged'.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  type DriveItemDTO,
  type ExplorerQuery,
  type DriveItemRow,
  rowToDTO
} from '../types/explorer'

const PAGE_SIZE = 200

interface CacheEntry {
  items: DriveItemDTO[]
  totalCount: number
  lastUpdatedAt: number
  nextCursor?: { sortValue: string | number; id: string }
}

function cacheKeyFor(query: ExplorerQuery): string {
  return `${query.parentId}|${query.sortBy}|${query.sortDir}|${query.q ?? ''}|${query.showTrashed ?? false}|${query.showShared ?? false}`
}

// Module-level cache (survives re-renders, cleared on parentId change)
const pageCache = new Map<string, CacheEntry>()

export interface UseExplorerDataResult {
  items: DriveItemDTO[]
  totalCount: number
  loading: boolean
  loadMore: () => void
  hasMore: boolean
  refresh: () => void
  getItemAtIndex: (index: number) => DriveItemDTO | null
}

export function useExplorerData(query: ExplorerQuery): UseExplorerDataResult {
  const [items, setItems] = useState<DriveItemDTO[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState<{ sortValue: string | number; id: string } | undefined>()
  const [hasMore, setHasMore] = useState(true)

  const queryRef = useRef(query)
  queryRef.current = query

  const cacheKey = cacheKeyFor(query)
  const loadingRef = useRef(false)

  const fetchPage = useCallback(
    async (cursorArg?: { sortValue: string | number; id: string }, append = false) => {
      if (loadingRef.current) return
      loadingRef.current = true
      setLoading(true)

      try {
        const result = await window.gsync.explorer.listFolderPage({
          parentId: queryRef.current.parentId,
          sortBy: queryRef.current.sortBy,
          sortDir: queryRef.current.sortDir,
          limit: PAGE_SIZE,
          cursor: cursorArg,
          q: queryRef.current.q,
          showTrashed: queryRef.current.showTrashed,
          showShared: queryRef.current.showShared
        })

        const dtos = (result.items as DriveItemRow[]).map(rowToDTO)

        if (append) {
          setItems((prev) => {
            // Deduplicate by ID
            const existingIds = new Set(prev.map((i) => i.id))
            const newItems = dtos.filter((d) => !existingIds.has(d.id))
            return [...prev, ...newItems]
          })
        } else {
          setItems(dtos)
        }

        setTotalCount(result.totalCount)
        setCursor(result.nextCursor)
        setHasMore(!!result.nextCursor)

        // Update cache
        const cached = pageCache.get(cacheKey)
        const allItems = append ? [...(cached?.items ?? []), ...dtos] : dtos
        pageCache.set(cacheKey, {
          items: allItems,
          totalCount: result.totalCount,
          lastUpdatedAt: Date.now(),
          nextCursor: result.nextCursor
        })
      } catch (err) {
        console.error('[useExplorerData] fetch error:', err)
      } finally {
        loadingRef.current = false
        setLoading(false)
      }
    },
    [cacheKey]
  )

  // Initial fetch or cache restore when query changes
  useEffect(() => {
    const cached = pageCache.get(cacheKey)
    if (cached && Date.now() - cached.lastUpdatedAt < 5000) {
      // SWR: show stale data immediately
      setItems(cached.items)
      setTotalCount(cached.totalCount)
      setCursor(cached.nextCursor)
      setHasMore(!!cached.nextCursor)
      // Background revalidate
      fetchPage()
    } else {
      setItems([])
      setTotalCount(0)
      setCursor(undefined)
      setHasMore(true)
      fetchPage()
    }
  }, [cacheKey, fetchPage])

  // Subscribe to DB changes from sync
  useEffect(() => {
    const unsub = window.gsync.explorer.onDbChanged(() => {
      // Invalidate cache and refetch
      pageCache.delete(cacheKey)
      fetchPage()
    })
    return unsub
  }, [cacheKey, fetchPage])

  const loadMore = useCallback(() => {
    if (hasMore && cursor) {
      fetchPage(cursor, true)
    }
  }, [hasMore, cursor, fetchPage])

  const refresh = useCallback(() => {
    pageCache.delete(cacheKey)
    setItems([])
    setCursor(undefined)
    fetchPage()
  }, [cacheKey, fetchPage])

  const getItemAtIndex = useCallback(
    (index: number): DriveItemDTO | null => {
      return items[index] ?? null
    },
    [items]
  )

  return { items, totalCount, loading, loadMore, hasMore, refresh, getItemAtIndex }
}
