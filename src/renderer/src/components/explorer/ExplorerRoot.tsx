/**
 * ExplorerRoot — the main explorer component (Phase 3 + Phase 4 + Phase 10).
 *
 * Orchestrates:
 * - Breadcrumb navigation (droppable in list/grid modes)
 * - Data fetching via useExplorerData (SWR)
 * - Selection via useSelection
 * - Keyboard shortcuts (Backspace, Enter, Escape, Delete, F2)
 * - Phase 4: DndContext for drag-and-drop (list/grid), context menu, inline rename,
 *   ops status bar, ops panel, confirm dialog
 * - Phase 10: star toggle, download, selection action bar
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
import { Search, Folder, Download, X } from 'lucide-react'
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
}

export default function ExplorerRoot({
  connected,
  searchQuery,
  debouncedQuery,
  viewMode,
  sortBy,
  sortDir,
  onSelectedItemChange
}: ExplorerRootProps) {
  // -- Navigation state --
  const [folderStack, setFolderStack] = useState<BreadcrumbEntry[]>([])
  const currentFolderId = folderStack.length > 0 ? folderStack[folderStack.length - 1]!.id : 'root'

  // -- Query --
  const query: ExplorerQuery = {
    parentId: currentFolderId,
    viewMode,
    sortBy,
    sortDir,
    q: debouncedQuery || undefined,
    showTrashed: false
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

  // -- Phase 4: Delete confirmation state --
  const [deleteConfirmIds, setDeleteConfirmIds] = useState<string[] | null>(null)

  const handleTrash = useCallback(() => {
    if (selection.selectedIds.size === 0) return
    window.gsync.ops.enqueueTrash({
      fileIds: [...selection.selectedIds],
      trashed: true
    })
  }, [selection.selectedIds])

  const handleDeletePermanently = useCallback(() => {
    if (!deleteConfirmIds || deleteConfirmIds.length === 0) return
    window.gsync.ops.enqueueDelete({ fileIds: deleteConfirmIds })
    setDeleteConfirmIds(null)
  }, [deleteConfirmIds])

  // -- Phase 10: Star toggle --
  const handleToggleStar = useCallback((itemId: string, starred: boolean) => {
    window.gsync.db.updateStarred(itemId, starred)
  }, [])

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
      const item = items.find((i) => i.id === id)
      if (!item) return
      if (item.type === 'folder') {
        setFolderStack((prev) => [...prev, { id: item.id, name: item.name }])
        setSelection({ selectedIds: new Set() })
        setRenamingId(null)
        setContextMenu(null)
      }
    },
    [items]
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

      // Backspace / Alt+Left: go up
      if (
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

      if (e.key === 'F2' && selection.focusedId && selection.selectedIds.size === 1) {
        e.preventDefault()
        setRenamingId(selection.focusedId)
        return
      }

      if (e.key === 'Delete' && selection.selectedIds.size > 0) {
        const target = e.target as HTMLElement
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault()
          if (e.shiftKey) {
            setDeleteConfirmIds([...selection.selectedIds])
          } else {
            handleTrash()
          }
          return
        }
      }

      handleKeyDown(e)
    },
    [
      renamingId,
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
        {/* -- Breadcrumbs -- */}
        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-3 flex-shrink-0">
          <DroppableBreadcrumb folderId="root" onClick={navigateToRoot}>
            My Drive
          </DroppableBreadcrumb>
          {folderStack.map((folder, i) => (
            <span key={folder.id} className="flex items-center gap-1">
              <span className="text-gray-300 dark:text-gray-600">/</span>
              <DroppableBreadcrumb folderId={folder.id} onClick={() => navigateToBreadcrumb(i)}>
                {folder.name}
              </DroppableBreadcrumb>
            </span>
          ))}
          {totalCount > 0 && (
            <span className="ml-auto text-gray-400 dark:text-gray-500">
              {totalCount.toLocaleString()} items
              {selection.selectedIds.size > 0 && (
                <> &middot; {selection.selectedIds.size} selected</>
              )}
            </span>
          )}
        </div>

        {/* -- Selection Action Bar -- */}
        {selection.selectedIds.size > 0 && (
          <div className="flex items-center gap-3 mb-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-600/10 border border-blue-200 dark:border-blue-500/30 flex-shrink-0">
            <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
              {selection.selectedIds.size} selected
            </span>
            <div className="flex-1" />
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-600/20 hover:bg-blue-200 dark:hover:bg-blue-600/30 rounded-md transition-colors"
            >
              <Download size={13} />
              Download
            </button>
            <button
              onClick={() => setSelection({ selectedIds: new Set() })}
              className="p-1 text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-200 rounded transition-colors"
              title="Clear selection"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* -- Content -- */}
        <div className="flex-1 min-h-0 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900/50 flex flex-col">
          {loading && items.length === 0 ? (
            <div className="flex flex-col h-full animate-pulse">
              {/* Skeleton header */}
              <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 dark:bg-gray-800/70 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <div className="w-7" />
                <div className="h-3 w-12 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="flex-1" />
                <div className="h-3 w-16 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-3 w-10 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
              {/* Skeleton rows */}
              <div className="flex-1 overflow-hidden">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 h-[44px]">
                    <div className="flex-shrink-0 w-7 h-7 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="flex-1 min-w-0">
                      <div className="h-3.5 rounded bg-gray-200 dark:bg-gray-700" style={{ width: `${35 + (i % 5) * 12}%` }} />
                    </div>
                    <div className="w-5" />
                    <div className="w-16 h-3 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="w-12 h-3 rounded bg-gray-200 dark:bg-gray-700" />
                  </div>
                ))}
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400 gap-3">
              {debouncedQuery ? (
                <>
                  <Search className="w-12 h-12 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm">No results found for &ldquo;{debouncedQuery}&rdquo;</p>
                </>
              ) : (
                <>
                  <Folder className="w-16 h-16 text-gray-200 dark:text-gray-700" />
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No files synced yet</p>
                  <p className="text-xs text-gray-400 dark:text-gray-600">Start a sync to populate your file browser</p>
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
          onOpen={() => {
            if (selection.focusedId) handleOpenItem(selection.focusedId)
          }}
          onRename={() => {
            if (selection.focusedId && selection.selectedIds.size === 1) {
              setRenamingId(selection.focusedId)
            }
          }}
          onTrash={handleTrash}
          onDelete={() => setDeleteConfirmIds([...selection.selectedIds])}
          onToggleStar={() => {
            if (focusedItem) handleToggleStar(focusedItem.id, !focusedItem.starred)
          }}
          onDownload={handleDownload}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* -- Delete Confirmation Dialog -- */}
      {deleteConfirmIds && (
        <ConfirmDialog
          title="Delete permanently?"
          message={`This will permanently delete ${deleteConfirmIds.length} item${deleteConfirmIds.length > 1 ? 's' : ''}. This action cannot be undone.`}
          confirmLabel="Delete"
          destructive
          onConfirm={handleDeletePermanently}
          onCancel={() => setDeleteConfirmIds(null)}
        />
      )}
    </>
  )
}
