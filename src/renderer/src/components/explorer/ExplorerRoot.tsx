/**
 * ExplorerRoot — the main explorer component (Phase 3 + Phase 4 + Phase 10 + Phase 12).
 *
 * Orchestrates:
 * - Breadcrumb navigation (droppable in list/grid modes)
 * - Data fetching via useExplorerData (SWR)
 * - Selection via useSelection
 * - Keyboard shortcuts (Backspace, Enter, Escape, Delete, F2)
 * - Phase 4: DndContext for drag-and-drop (list/grid), context menu, inline rename,
 *   ops status bar, ops panel, confirm dialog
 * - Phase 10: star toggle, download, selection action bar
 * - Phase 12: Trash view (showTrashed), capability guards, empty trash, restore
 *
 * Search, sort, and view mode are now controlled by the parent (App -> TopBar).
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent
} from '@dnd-kit/core'
import { Search, Folder, Download, X, Trash2, Users, Image } from 'lucide-react'
import type {
  ViewMode,
  SortBy,
  SortDir,
  ExplorerQuery,
  SelectionState,
  DriveItemDTO
} from '../../types/explorer'
import { useExplorerData } from '../../hooks/useExplorerData'
import { useSelection } from '../../hooks/useSelection'
import { useOpsStatus } from '../../hooks/useOpsStatus'
import ListView from './ListView'
import GridView, { CARD_W, GAP } from './GridView'
import { DragOverlayContent } from './DragOverlayContent'
import { DroppableBreadcrumb } from './DroppableBreadcrumb'
import { ContextMenu } from './ContextMenu'
import { ConfirmDialog } from './ConfirmDialog'
import { OpsStatusBar } from './OpsStatusBar'
import { OpsPanel } from './OpsPanel'

interface BreadcrumbEntry {
  id: string
  name: string
}

interface ExplorerRootProps {
  connected: boolean
  searchQuery: string
  debouncedQuery: string
  viewMode: ViewMode
  sortBy: SortBy
  sortDir: SortDir
  onSelectedItemChange?: (item: DriveItemDTO | null) => void
  onShareItem?: (item: DriveItemDTO) => void
  showTrashed?: boolean
  showShared?: boolean
  showMedia?: boolean
}

export default function ExplorerRoot({
  connected,
  searchQuery,
  debouncedQuery,
  viewMode,
  sortBy,
  sortDir,
  onSelectedItemChange,
  onShareItem,
  showTrashed = false,
  showShared = false,
  showMedia = false
}: ExplorerRootProps) {
  // -- Navigation state --
  const [folderStack, setFolderStack] = useState<BreadcrumbEntry[]>([])
  const isSpecialView = showTrashed || showShared || showMedia
  const currentFolderId = isSpecialView
    ? 'root'
    : folderStack.length > 0 ? folderStack[folderStack.length - 1]!.id : 'root'

  // -- Query --
  const query: ExplorerQuery = {
    parentId: currentFolderId,
    viewMode,
    sortBy,
    sortDir,
    q: debouncedQuery || undefined,
    showTrashed,
    showShared,
    showMedia
  }

  const { items, totalCount, loading, loadMore, hasMore } = useExplorerData(query)

  // -- Selection --
  const [selection, setSelection] = useState<SelectionState>({
    selectedIds: new Set()
  })

  // Notify parent when focused item changes (for details panel)
  useEffect(() => {
    if (!onSelectedItemChange) return
    if (selection.focusedId) {
      const item = items.find((i) => i.id === selection.focusedId)
      onSelectedItemChange(item ?? null)
    } else {
      onSelectedItemChange(null)
    }
  }, [selection.focusedId, items, onSelectedItemChange])

  // Compute columns for grid keyboard nav
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [gridColumns, setGridColumns] = useState(1)

  useEffect(() => {
    if (viewMode !== 'grid') {
      setGridColumns(1)
      return
    }
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      setGridColumns(Math.max(1, Math.floor((w + GAP) / (CARD_W + GAP))))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [viewMode])

  const { handleItemClick, handleKeyDown } = useSelection({
    items,
    selection,
    onSelectionChange: setSelection,
    columns: viewMode === 'grid' ? gridColumns : 1
  })

  // -- Phase 4: Ops status --
  const { counts, recentOps, pendingFileIds, needsUserFileIds, retry, rollback, cancel, clearCompleted } = useOpsStatus()
  const [opsPanelOpen, setOpsPanelOpen] = useState(false)

  // -- Phase 4: Drag-and-drop state --
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  )
  const [activeItem, setActiveItem] = useState<DriveItemDTO | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  function handleDragStart(event: DragStartEvent) {
    if (isSpecialView) return // no drag-and-drop in trash/shared view
    const item = event.active.data.current?.item as DriveItemDTO | undefined
    if (!item) return
    setActiveItem(item)
    setIsDragging(true)

    if (!selection.selectedIds.has(item.id)) {
      setSelection({ anchorId: item.id, focusedId: item.id, selectedIds: new Set([item.id]) })
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveItem(null)
    setIsDragging(false)

    if (!event.over) return

    const overData = event.over.data.current
    let targetFolderId: string | undefined

    if (overData?.type === 'folder') {
      targetFolderId = overData.folderId as string
    } else if (overData?.type === 'breadcrumb') {
      targetFolderId = overData.folderId as string
    }

    if (!targetFolderId) return
    if (targetFolderId === currentFolderId) return

    const draggedId = event.active.id as string
    const idsToMove = selection.selectedIds.has(draggedId)
      ? [...selection.selectedIds]
      : [draggedId]

    if (idsToMove.includes(targetFolderId)) return

    window.gsync.ops.enqueueMove({
      fileIds: idsToMove,
      fromParentId: currentFolderId,
      toParentId: targetFolderId
    })
  }

  function handleDragCancel() {
    setActiveItem(null)
    setIsDragging(false)
  }

  const dragCount = activeItem && selection.selectedIds.has(activeItem.id)
    ? selection.selectedIds.size
    : 1

  // -- Phase 4: Context menu state --
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId: string } | null>(null)

  const handleContextMenu = useCallback(
    (itemId: string, x: number, y: number) => {
      if (!selection.selectedIds.has(itemId)) {
        setSelection({ anchorId: itemId, focusedId: itemId, selectedIds: new Set([itemId]) })
      }
      setContextMenu({ x, y, itemId })
    },
    [selection.selectedIds]
  )

  // -- Phase 4: Inline rename state --
  const [renamingId, setRenamingId] = useState<string | null>(null)

  const handleRenameSubmit = useCallback((fileId: string, newName: string) => {
    setRenamingId(null)
    if (!newName.trim()) return
    window.gsync.ops.enqueueRename({ fileId, newName: newName.trim() })
  }, [])

  const handleRenameCancel = useCallback(() => {
    setRenamingId(null)
  }, [])

  // -- Phase 4 / Phase 12: Delete confirmation state --
  const [deleteConfirmIds, setDeleteConfirmIds] = useState<string[] | null>(null)
  const [emptyTrashConfirm, setEmptyTrashConfirm] = useState(false)
  const [removeAccessConfirmIds, setRemoveAccessConfirmIds] = useState<string[] | null>(null)

  const handleTrash = useCallback(() => {
    if (selection.selectedIds.size === 0) return
    const selectedItems = items.filter((i) => selection.selectedIds.has(i.id))
    const hasSharedItems = selectedItems.some((i) => !i.ownedByMe)

    if (hasSharedItems) {
      // Show "remove access" confirmation for shared files
      setRemoveAccessConfirmIds([...selection.selectedIds])
    } else {
      // Owned files: trash directly
      window.gsync.ops.enqueueTrash({
        fileIds: [...selection.selectedIds],
        trashed: true
      })
    }
  }, [selection.selectedIds, items])

  const handleRestore = useCallback(() => {
    if (selection.selectedIds.size === 0) return
    window.gsync.ops.enqueueTrash({
      fileIds: [...selection.selectedIds],
      trashed: false
    })
  }, [selection.selectedIds])

  const handleDeletePermanently = useCallback(() => {
    if (!deleteConfirmIds || deleteConfirmIds.length === 0) return
    window.gsync.ops.enqueueDelete({ fileIds: deleteConfirmIds })
    setDeleteConfirmIds(null)
  }, [deleteConfirmIds])

  const handleEmptyTrash = useCallback(async () => {
    setEmptyTrashConfirm(false)
    try {
      await window.gsync.ops.emptyTrash()
    } catch (err) {
      console.error('[ExplorerRoot] emptyTrash failed:', err)
    }
  }, [])

  const handleRemoveAccessConfirm = useCallback(() => {
    if (!removeAccessConfirmIds || removeAccessConfirmIds.length === 0) return
    window.gsync.ops.enqueueTrash({
      fileIds: removeAccessConfirmIds,
      trashed: true
    })
    setRemoveAccessConfirmIds(null)
  }, [removeAccessConfirmIds])

  // -- Phase 10: Star toggle --
  const handleToggleStar = useCallback((itemId: string, starred: boolean) => {
    window.gsync.db.updateStarred(itemId, starred)
  }, [])

  // -- Make a copy (shared view) --
  const handleMakeCopy = useCallback(async () => {
    if (selection.selectedIds.size !== 1) return
    const focusedId = selection.focusedId ?? [...selection.selectedIds][0]
    if (!focusedId) return
    const item = items.find((i) => i.id === focusedId)
    if (!item) return

    try {
      await window.gsync.drive.copyFile({
        fileId: item.id,
        name: `Copy of ${item.name}`
      })
    } catch (err) {
      console.error('[ExplorerRoot] copyFile failed:', err)
    }
  }, [selection.selectedIds, selection.focusedId, items])

  // -- Share --
  const handleShare = useCallback(() => {
    if (selection.selectedIds.size !== 1) return
    const focusedId = selection.focusedId ?? [...selection.selectedIds][0]
    if (!focusedId) return
    const found = items.find((i) => i.id === focusedId)
    if (found && onShareItem) onShareItem(found)
  }, [selection.selectedIds, selection.focusedId, items, onShareItem])

  // -- Phase 10: Download --
  const handleDownload = useCallback(() => {
    if (selection.selectedIds.size === 0) return

    const selectedItems = items.filter((i) => selection.selectedIds.has(i.id))
    // Filter out folders for now — Drive API doesn't support direct folder download
    const downloadableItems = selectedItems.filter((i) => i.type !== 'folder')

    if (downloadableItems.length === 0) return

    if (downloadableItems.length === 1) {
      const item = downloadableItems[0]!
      window.gsync.ops.downloadFile({
        fileId: item.id,
        fileName: item.name,
        mimeType: item.mimeType
      })
    } else {
      window.gsync.ops.downloadZip({
        items: downloadableItems.map((i) => ({
          fileId: i.id,
          fileName: i.name,
          mimeType: i.mimeType
        }))
      })
    }
  }, [selection.selectedIds, items])

  // -- Navigation --
  const handleOpenItem = useCallback(
    (id: string) => {
      if (isSpecialView) return // no folder navigation in trash/shared view
      const item = items.find((i) => i.id === id)
      if (!item) return
      if (item.type === 'folder') {
        setFolderStack((prev) => [...prev, { id: item.id, name: item.name }])
        setSelection({ selectedIds: new Set() })
        setRenamingId(null)
        setContextMenu(null)
      }
    },
    [items, isSpecialView]
  )

  const navigateUp = useCallback(() => {
    setFolderStack((prev) => prev.slice(0, -1))
    setSelection({ selectedIds: new Set() })
    setRenamingId(null)
    setContextMenu(null)
  }, [])

  const navigateToBreadcrumb = useCallback((index: number) => {
    setFolderStack((prev) => prev.slice(0, index + 1))
    setSelection({ selectedIds: new Set() })
    setRenamingId(null)
    setContextMenu(null)
  }, [])

  const navigateToRoot = useCallback(() => {
    setFolderStack([])
    setSelection({ selectedIds: new Set() })
    setRenamingId(null)
    setContextMenu(null)
  }, [])

  // -- Range-based data loading for virtualization --
  const onRangeNeeded = useCallback(
    (_start: number, end: number) => {
      if (end >= items.length - 50 && hasMore) {
        loadMore()
      }
    },
    [items.length, hasMore, loadMore]
  )

  // -- Keyboard shortcuts --
  const handleContainerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (renamingId) return

      // Backspace / Alt+Left: go up (not in special views)
      if (
        !isSpecialView &&
        (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft')) &&
        folderStack.length > 0
      ) {
        const target = e.target as HTMLElement
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault()
          navigateUp()
          return
        }
      }

      if (e.key === 'Enter' && selection.focusedId) {
        e.preventDefault()
        handleOpenItem(selection.focusedId)
        return
      }

      // F2: Rename (only in normal view, not trash/shared, and only if canEdit)
      if (!isSpecialView && e.key === 'F2' && selection.focusedId && selection.selectedIds.size === 1) {
        const focusedForRename = items.find((i) => i.id === selection.focusedId)
        if (focusedForRename?.canEdit) {
          e.preventDefault()
          setRenamingId(selection.focusedId)
        }
        return
      }

      if (e.key === 'Delete' && selection.selectedIds.size > 0) {
        const target = e.target as HTMLElement
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault()
          if (showTrashed) {
            // In trash view: Shift+Del = permanent delete with confirmation
            if (e.shiftKey) {
              setDeleteConfirmIds([...selection.selectedIds])
            }
            // Plain Del does nothing in trash (already trashed)
          } else {
            // Normal view: Del = move to trash (no permanent delete)
            handleTrash()
          }
          return
        }
      }

      handleKeyDown(e)
    },
    [
      renamingId,
      isSpecialView,
      showTrashed,
      folderStack.length,
      navigateUp,
      selection.focusedId,
      selection.selectedIds,
      handleOpenItem,
      handleTrash,
      handleKeyDown
    ]
  )

  // Suppress lint
  void searchQuery

  const focusedItem = selection.focusedId
    ? items.find((i) => i.id === selection.focusedId)
    : undefined

  // Compute capability flags for the selection (all selected items must have the capability)
  const canTrashSelection = selection.selectedIds.size > 0 &&
    [...selection.selectedIds].every((id) => {
      const item = items.find((i) => i.id === id)
      return item ? item.canTrash : false
    })

  // Permanent delete: trust Drive API canDelete capability
  const canDeleteSelection = selection.selectedIds.size > 0 &&
    [...selection.selectedIds].every((id) => {
      const item = items.find((i) => i.id === id)
      return item ? item.canDelete : false
    })

  const canEditSelection = selection.selectedIds.size > 0 &&
    [...selection.selectedIds].every((id) => {
      const item = items.find((i) => i.id === id)
      return item ? item.canEdit : false
    })

  const canShareSelection = selection.selectedIds.size > 0 &&
    [...selection.selectedIds].every((id) => {
      const item = items.find((i) => i.id === id)
      return item ? (item.canShare || item.shared) : false
    })

  if (!connected) return null

  // -- View content (list / grid) --
  const viewContent = viewMode === 'list' ? (
    <ListView
      items={items}
      totalCount={totalCount}
      onRangeNeeded={onRangeNeeded}
      selection={selection}
      onItemClick={handleItemClick}
      onOpenItem={handleOpenItem}
      isDragging={isDragging}
      pendingFileIds={pendingFileIds}
      needsUserFileIds={needsUserFileIds}
      renamingId={renamingId}
      onRenameSubmit={handleRenameSubmit}
      onRenameCancel={handleRenameCancel}
      onContextMenu={handleContextMenu}
      onToggleStar={handleToggleStar}
    />
  ) : (
    <GridView
      items={items}
      totalCount={totalCount}
      onRangeNeeded={onRangeNeeded}
      selection={selection}
      onItemClick={handleItemClick}
      onOpenItem={handleOpenItem}
      isDragging={isDragging}
      pendingFileIds={pendingFileIds}
      needsUserFileIds={needsUserFileIds}
      renamingId={renamingId}
      onRenameSubmit={handleRenameSubmit}
      onRenameCancel={handleRenameCancel}
      onContextMenu={handleContextMenu}
      onToggleStar={handleToggleStar}
    />
  )

  return (
    <>
      <div
        ref={containerRef}
        className="flex flex-col h-full p-4"
        onKeyDown={handleContainerKeyDown}
        tabIndex={-1}
      >
        {/* -- Breadcrumbs / Trash / Shared header -- */}
        {showTrashed ? (
          <div className="flex items-center gap-3 mb-3 flex-shrink-0">
            <div className="flex items-center gap-2 text-sm font-medium text-g-text dark:text-g-text-dark">
              <Trash2 size={16} className="text-g-text-disabled" />
              Trash
            </div>
            {totalCount > 0 && (
              <>
                <span className="text-xs text-g-text-disabled dark:text-g-text-disabled-dark">
                  {totalCount.toLocaleString()} items
                </span>
                <div className="flex-1" />
                <button
                  onClick={() => setEmptyTrashConfirm(true)}
                  className="px-3 py-1 text-xs font-medium text-g-secondary dark:text-g-secondary-dark border border-g-secondary/30 dark:border-g-secondary-dark/40 rounded-md hover:bg-g-secondary/8 dark:hover:bg-g-secondary-dark/10 transition"
                >
                  Empty Trash
                </button>
              </>
            )}
            {totalCount === 0 && (
              <span className="text-xs text-g-text-disabled dark:text-g-text-disabled-dark ml-auto">
                No items in trash
              </span>
            )}
          </div>
        ) : showShared ? (
          <div className="flex items-center gap-3 mb-3 flex-shrink-0">
            <div className="flex items-center gap-2 text-sm font-medium text-g-text dark:text-g-text-dark">
              <Users size={16} className="text-g-primary dark:text-g-primary-dark" />
              Shared with me
            </div>
            <span className="text-xs text-g-text-disabled dark:text-g-text-disabled-dark">
              {totalCount > 0 ? `${totalCount.toLocaleString()} items` : 'No shared items'}
            </span>
            {selection.selectedIds.size > 0 && (
              <span className="text-xs text-g-text-disabled dark:text-g-text-disabled-dark">
                &middot; {selection.selectedIds.size} selected
              </span>
            )}
          </div>
        ) : showMedia ? (
          <div className="flex items-center gap-3 mb-3 flex-shrink-0">
            <div className="flex items-center gap-2 text-sm font-medium text-g-text dark:text-g-text-dark">
              <Image size={16} className="text-g-primary dark:text-g-primary-dark" />
              Photos & Videos
            </div>
            <span className="text-xs text-g-text-disabled dark:text-g-text-disabled-dark">
              {totalCount > 0 ? `${totalCount.toLocaleString()} items` : 'No media files'}
            </span>
            {selection.selectedIds.size > 0 && (
              <span className="text-xs text-g-text-disabled dark:text-g-text-disabled-dark">
                &middot; {selection.selectedIds.size} selected
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1 text-xs text-g-text-secondary dark:text-g-text-secondary-dark mb-3 flex-shrink-0">
            <DroppableBreadcrumb folderId="root" onClick={navigateToRoot}>
              My Drive
            </DroppableBreadcrumb>
            {folderStack.map((folder, i) => (
              <span key={folder.id} className="flex items-center gap-1">
                <span className="text-g-border dark:text-g-border-dark">/</span>
                <DroppableBreadcrumb folderId={folder.id} onClick={() => navigateToBreadcrumb(i)}>
                  {folder.name}
                </DroppableBreadcrumb>
              </span>
            ))}
            {totalCount > 0 && (
              <span className="ml-auto text-g-text-disabled dark:text-g-text-disabled-dark">
                {totalCount.toLocaleString()} items
                {selection.selectedIds.size > 0 && (
                  <> &middot; {selection.selectedIds.size} selected</>
                )}
              </span>
            )}
          </div>
        )}

        {/* -- Trash info banner -- */}
        {showTrashed && items.length > 0 && (
          <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-g-accent/10 dark:bg-g-accent-dark/10 border border-g-accent/20 dark:border-g-accent-dark/30 flex-shrink-0">
            <Trash2 size={14} className="text-g-accent flex-shrink-0" />
            <span className="text-xs text-amber-700 dark:text-g-accent-dark">
              Items in trash are deleted forever after 30 days
            </span>
          </div>
        )}

        {/* -- Selection Action Bar -- */}
        {selection.selectedIds.size > 0 && (
          <div className="flex items-center gap-3 mb-2 px-3 py-2 rounded-lg bg-g-primary/8 dark:bg-g-primary-dark/10 border border-g-primary/20 dark:border-g-primary-dark/30 flex-shrink-0">
            <span className="text-xs font-medium text-g-primary dark:text-g-primary-dark">
              {selection.selectedIds.size} selected
            </span>
            <div className="flex-1" />
            {showTrashed ? (
              <>
                <button
                  onClick={handleRestore}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-g-primary dark:text-g-primary-dark bg-g-primary/12 dark:bg-g-primary-dark/15 hover:bg-g-primary/20 dark:hover:bg-g-primary-dark/25 rounded-md transition-colors"
                >
                  Restore
                </button>
                <button
                  onClick={() => setDeleteConfirmIds([...selection.selectedIds])}
                  disabled={!canDeleteSelection}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-g-secondary dark:text-g-secondary-dark bg-g-secondary/8 dark:bg-g-secondary-dark/10 hover:bg-g-secondary/15 dark:hover:bg-g-secondary-dark/20 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Delete permanently
                </button>
              </>
            ) : (
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-g-primary dark:text-g-primary-dark bg-g-primary/12 dark:bg-g-primary-dark/15 hover:bg-g-primary/20 dark:hover:bg-g-primary-dark/25 rounded-md transition-colors"
              >
                <Download size={13} />
                Download
              </button>
            )}
            <button
              onClick={() => setSelection({ selectedIds: new Set() })}
              className="p-1 text-g-primary dark:text-g-primary-dark hover:text-g-primary/70 dark:hover:text-g-primary-dark/70 rounded transition-colors"
              title="Clear selection"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* -- Content -- */}
        <div className="flex-1 min-h-0 rounded-xl border border-g-border dark:border-g-border-dark overflow-hidden bg-g-bg dark:bg-g-surface-dark/50 flex flex-col">
          {loading && items.length === 0 ? (
            <div className="flex flex-col h-full animate-pulse">
              {/* Skeleton header */}
              <div className="flex items-center gap-3 px-4 py-2 bg-g-surface dark:bg-g-btn-secondary-dark/70 border-b border-g-border dark:border-g-border-dark flex-shrink-0">
                <div className="w-7" />
                <div className="h-3 w-12 rounded bg-g-border dark:bg-g-border-dark" />
                <div className="flex-1" />
                <div className="h-3 w-16 rounded bg-g-border dark:bg-g-border-dark" />
                <div className="h-3 w-10 rounded bg-g-border dark:bg-g-border-dark" />
              </div>
              {/* Skeleton rows */}
              <div className="flex-1 overflow-hidden">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 h-[44px]">
                    <div className="flex-shrink-0 w-7 h-7 rounded bg-g-border dark:bg-g-border-dark" />
                    <div className="flex-1 min-w-0">
                      <div className="h-3.5 rounded bg-g-border dark:bg-g-border-dark" style={{ width: `${35 + (i % 5) * 12}%` }} />
                    </div>
                    <div className="w-5" />
                    <div className="w-16 h-3 rounded bg-g-border dark:bg-g-border-dark" />
                    <div className="w-12 h-3 rounded bg-g-border dark:bg-g-border-dark" />
                  </div>
                ))}
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-g-text-secondary dark:text-g-text-secondary-dark gap-3">
              {showTrashed ? (
                <>
                  <Trash2 className="w-16 h-16 text-g-border dark:text-g-border-dark" />
                  <p className="text-sm font-medium text-g-text-secondary dark:text-g-text-secondary-dark">Trash is empty</p>
                  <p className="text-xs text-g-text-disabled dark:text-g-text-disabled-dark">Items you delete will appear here</p>
                </>
              ) : showShared ? (
                <>
                  <Users className="w-16 h-16 text-g-border dark:text-g-border-dark" />
                  <p className="text-sm font-medium text-g-text-secondary dark:text-g-text-secondary-dark">No shared files</p>
                  <p className="text-xs text-g-text-disabled dark:text-g-text-disabled-dark">Files shared with you by others will appear here</p>
                </>
              ) : showMedia ? (
                <>
                  <Image className="w-16 h-16 text-g-border dark:text-g-border-dark" />
                  <p className="text-sm font-medium text-g-text-secondary dark:text-g-text-secondary-dark">No photos or videos</p>
                  <p className="text-xs text-g-text-disabled dark:text-g-text-disabled-dark">Image and video files from your Drive will appear here</p>
                </>
              ) : debouncedQuery ? (
                <>
                  <Search className="w-12 h-12 text-g-border dark:text-g-border-dark" />
                  <p className="text-sm">No results found for &ldquo;{debouncedQuery}&rdquo;</p>
                </>
              ) : (
                <>
                  <Folder className="w-16 h-16 text-g-border dark:text-g-border-dark" />
                  <p className="text-sm font-medium text-g-text-secondary dark:text-g-text-secondary-dark">No files synced yet</p>
                  <p className="text-xs text-g-text-disabled dark:text-g-text-disabled-dark">Start a sync to populate your file browser</p>
                </>
              )}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={pointerWithin}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <div className="flex-1 min-h-0">
                {viewContent}
              </div>
              <DragOverlay dropAnimation={null}>
                {activeItem ? (
                  <DragOverlayContent item={activeItem} count={dragCount} />
                ) : null}
              </DragOverlay>
            </DndContext>
          )}

          {/* -- Ops Status Bar -- */}
          <OpsStatusBar
            counts={counts}
            onTogglePanel={() => setOpsPanelOpen((prev) => !prev)}
          />

          {opsPanelOpen && (
            <OpsPanel
              ops={recentOps}
              onRetry={retry}
              onRollback={rollback}
              onCancel={cancel}
              onClose={() => setOpsPanelOpen(false)}
              onClear={clearCompleted}
            />
          )}
        </div>
      </div>

      {/* -- Context Menu (portal) -- */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedCount={selection.selectedIds.size}
          hasFocusedItem={!!focusedItem}
          isFocusedFolder={focusedItem?.type === 'folder'}
          isFocusedStarred={focusedItem?.starred ?? false}
          isTrashView={showTrashed}
          isSharedView={showShared}
          isFocusedOwned={focusedItem?.ownedByMe ?? true}
          canTrashSelection={canTrashSelection}
          canDeleteSelection={canDeleteSelection}
          canEditSelection={canEditSelection}
          onOpen={() => {
            if (selection.focusedId) handleOpenItem(selection.focusedId)
          }}
          onRename={() => {
            if (!isSpecialView && canEditSelection && selection.focusedId && selection.selectedIds.size === 1) {
              setRenamingId(selection.focusedId)
            }
          }}
          onTrash={handleTrash}
          onDelete={() => setDeleteConfirmIds([...selection.selectedIds])}
          onRestore={handleRestore}
          onEmptyTrash={() => setEmptyTrashConfirm(true)}
          onToggleStar={() => {
            if (focusedItem) handleToggleStar(focusedItem.id, !focusedItem.starred)
          }}
          onDownload={handleDownload}
          onMakeCopy={showShared ? handleMakeCopy : undefined}
          onShare={handleShare}
          canShareSelection={canShareSelection}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* -- Delete Confirmation Dialog (ownership-aware) -- */}
      {deleteConfirmIds && (() => {
        const selectedItems = items.filter((i) => deleteConfirmIds.includes(i.id))
        const allCanDelete = selectedItems.every((i) => i.canDelete)

        // Block if any file lacks canDelete capability
        if (!allCanDelete) {
          return (
            <ConfirmDialog
              title="Cannot delete permanently"
              message="Some selected files cannot be permanently deleted. You don't have delete permission for these files."
              confirmLabel="OK"
              onConfirm={() => setDeleteConfirmIds(null)}
              onCancel={() => setDeleteConfirmIds(null)}
            />
          )
        }

        const allOwned = selectedItems.every((i) => i.ownedByMe)
        const count = deleteConfirmIds.length
        const plural = count > 1 ? 's' : ''

        return (
          <ConfirmDialog
            title="Delete permanently?"
            message={
              allOwned
                ? `This will permanently delete ${count} item${plural} for everyone. This action cannot be undone.`
                : `This will permanently delete ${count} item${plural}. Shared files will be removed from all users. This action cannot be undone.`
            }
            confirmLabel="Delete"
            destructive
            onConfirm={handleDeletePermanently}
            onCancel={() => setDeleteConfirmIds(null)}
          />
        )
      })()}

      {/* -- Remove Access Confirmation Dialog (shared files) -- */}
      {removeAccessConfirmIds && (
        <ConfirmDialog
          title="Remove access?"
          message={`This will remove your access to ${removeAccessConfirmIds.length} shared item${removeAccessConfirmIds.length > 1 ? 's' : ''}. The file will still exist in the owner's Drive.`}
          confirmLabel="Remove"
          destructive
          onConfirm={handleRemoveAccessConfirm}
          onCancel={() => setRemoveAccessConfirmIds(null)}
        />
      )}

      {/* -- Empty Trash Confirmation Dialog -- */}
      {emptyTrashConfirm && (
        <ConfirmDialog
          title="Empty Trash?"
          message="All items in the trash will be permanently deleted. This action cannot be undone."
          confirmLabel="Empty Trash"
          destructive
          onConfirm={handleEmptyTrash}
          onCancel={() => setEmptyTrashConfirm(false)}
        />
      )}

    </>
  )
}
