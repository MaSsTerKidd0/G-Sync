/**
 * Selection hook for the explorer.
 * Supports:
 * - Single click (select one)
 * - Ctrl/Cmd+click (toggle)
 * - Shift+click (range select)
 * - Arrow keys (move focus)
 * - Shift+Arrow (extend selection)
 * - Ctrl/Cmd+A (select all)
 * - Escape (clear selection)
 */

import { useCallback, useRef } from 'react'
import type { SelectionState, DriveItemDTO } from '../types/explorer'

interface UseSelectionArgs {
  items: DriveItemDTO[]
  selection: SelectionState
  onSelectionChange: (next: SelectionState) => void
  /** Number of columns (for grid arrow key navigation). 1 for list view. */
  columns?: number
}

export function useSelection({
  items,
  selection,
  onSelectionChange,
  columns = 1
}: UseSelectionArgs) {
  const itemsRef = useRef(items)
  itemsRef.current = items

  const findIndex = useCallback(
    (id: string | undefined): number => {
      if (!id) return -1
      return itemsRef.current.findIndex((item) => item.id === id)
    },
    []
  )

  /** Click handler — call from item onClick */
  const handleItemClick = useCallback(
    (itemId: string, event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
      const isCtrl = event.ctrlKey || event.metaKey
      const isShift = event.shiftKey

      if (isShift && selection.anchorId) {
        // Range select from anchor to clicked item
        const anchorIdx = findIndex(selection.anchorId)
        const clickIdx = findIndex(itemId)
        if (anchorIdx >= 0 && clickIdx >= 0) {
          const start = Math.min(anchorIdx, clickIdx)
          const end = Math.max(anchorIdx, clickIdx)
          const rangeIds = new Set<string>()
          for (let i = start; i <= end; i++) {
            rangeIds.add(itemsRef.current[i]!.id)
          }
          // If ctrl is also held, add to existing selection
          const merged = isCtrl
            ? new Set([...selection.selectedIds, ...rangeIds])
            : rangeIds
          onSelectionChange({
            anchorId: selection.anchorId,
            focusedId: itemId,
            selectedIds: merged
          })
        }
      } else if (isCtrl) {
        // Toggle individual item
        const next = new Set(selection.selectedIds)
        if (next.has(itemId)) {
          next.delete(itemId)
        } else {
          next.add(itemId)
        }
        onSelectionChange({
          anchorId: itemId,
          focusedId: itemId,
          selectedIds: next
        })
      } else {
        // Single select
        onSelectionChange({
          anchorId: itemId,
          focusedId: itemId,
          selectedIds: new Set([itemId])
        })
      }
    },
    [selection, findIndex, onSelectionChange]
  )

  /** Keyboard handler — call from container onKeyDown */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Don't handle if typing in an input
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      const currentIdx = findIndex(selection.focusedId)
      const itemCount = itemsRef.current.length

      let nextIdx: number | null = null

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          nextIdx = Math.min(currentIdx + columns, itemCount - 1)
          break
        case 'ArrowUp':
          event.preventDefault()
          nextIdx = Math.max(currentIdx - columns, 0)
          break
        case 'ArrowRight':
          if (columns > 1) {
            event.preventDefault()
            nextIdx = Math.min(currentIdx + 1, itemCount - 1)
          }
          break
        case 'ArrowLeft':
          if (columns > 1) {
            event.preventDefault()
            nextIdx = Math.max(currentIdx - 1, 0)
          }
          break
        case 'Escape':
          event.preventDefault()
          onSelectionChange({
            anchorId: undefined,
            focusedId: selection.focusedId,
            selectedIds: new Set()
          })
          return
        case ' ':
          // Space: toggle focused item in selection
          event.preventDefault()
          if (selection.focusedId) {
            const next = new Set(selection.selectedIds)
            if (next.has(selection.focusedId)) {
              next.delete(selection.focusedId)
            } else {
              next.add(selection.focusedId)
            }
            onSelectionChange({ ...selection, selectedIds: next })
          }
          return
        case 'a':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault()
            const all = new Set(itemsRef.current.map((i) => i.id))
            onSelectionChange({
              anchorId: itemsRef.current[0]?.id,
              focusedId: selection.focusedId,
              selectedIds: all
            })
          }
          return
        default:
          return
      }

      if (nextIdx !== null && nextIdx >= 0 && nextIdx < itemCount) {
        const nextItem = itemsRef.current[nextIdx]!
        if (event.shiftKey) {
          // Shift+Arrow: extend selection
          const anchor = selection.anchorId ?? selection.focusedId ?? nextItem.id
          const anchorIdx = findIndex(anchor)
          const start = Math.min(anchorIdx, nextIdx)
          const end = Math.max(anchorIdx, nextIdx)
          const rangeIds = new Set<string>()
          for (let i = start; i <= end; i++) {
            rangeIds.add(itemsRef.current[i]!.id)
          }
          onSelectionChange({
            anchorId: anchor,
            focusedId: nextItem.id,
            selectedIds: rangeIds
          })
        } else {
          onSelectionChange({
            anchorId: nextItem.id,
            focusedId: nextItem.id,
            selectedIds: new Set([nextItem.id])
          })
        }
      }
    },
    [selection, findIndex, onSelectionChange, columns]
  )

  return { handleItemClick, handleKeyDown }
}
