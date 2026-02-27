/**
 * Virtualized List View — fixed 44px row height using TanStack Virtual.
 * Phase 4: adds useDraggable on all items, useDroppable on folder items,
 * inline rename, context menu, and pending-op status indicators.
 * Phase 10: adds star toggle icon.
 */

import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Star, Users } from 'lucide-react'
import type { DriveItemDTO, SelectionState } from '../../types/explorer'
import { useThumbnail } from '../../hooks/useThumbnail'
import { InlineRename } from './InlineRename'

const ROW_H = 44
const OVERSCAN = 8
const OVERSCAN_DRAGGING = 40

interface ListViewProps {
  items: DriveItemDTO[]
  totalCount: number
  onRangeNeeded: (start: number, end: number) => void
  selection: SelectionState
  onItemClick: (id: string, event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => void
  onOpenItem: (id: string) => void
  isDragging?: boolean
  pendingFileIds?: Set<string>
  needsUserFileIds?: Set<string>
  renamingId?: string | null
  onRenameSubmit?: (fileId: string, newName: string) => void
  onRenameCancel?: () => void
  onContextMenu?: (itemId: string, x: number, y: number) => void
  onToggleStar?: (itemId: string, starred: boolean) => void
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '\u2014'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function formatDate(ms: number | null): string {
  if (!ms) return '\u2014'
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return '\u2014'
  }
}

function getMimeIcon(mimeType: string, type: string): string {
  if (type === 'folder') return '\uD83D\uDCC1'
  if (type === 'shortcut') return '\u21AA\uFE0F'
  if (mimeType.startsWith('image/')) return '\uD83D\uDDBC\uFE0F'
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '\uD83D\uDCCA'
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '\uD83D\uDCFD\uFE0F'
  if (mimeType.includes('document') || mimeType.includes('word')) return '\uD83D\uDCC4'
  if (mimeType === 'application/pdf') return '\uD83D\uDCC4'
  return '\uD83D\uDCC4'
}

// Memoized row component with drag/drop support
const ListRow = React.memo(function ListRow({
  item,
  isSelected,
  isFocused,
  onItemClick,
  onOpenItem,
  isPending,
  needsUser,
  isRenaming,
  onRenameSubmit,
  onRenameCancel,
  onContextMenu,
  onToggleStar
}: {
  item: DriveItemDTO
  isSelected: boolean
  isFocused: boolean
  onItemClick: (id: string, event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => void
  onOpenItem: (id: string) => void
  isPending: boolean
  needsUser: boolean
  isRenaming: boolean
  onRenameSubmit?: (fileId: string, newName: string) => void
  onRenameCancel?: () => void
  onContextMenu?: (itemId: string, x: number, y: number) => void
  onToggleStar?: (itemId: string, starred: boolean) => void
}) {
  const thumbnailUrl = useThumbnail({
    fileId: item.id,
    hasThumbnail: item.hasThumbnail,
    thumbnailVersion: item.thumbnailVersion
  })

  // Draggable
  const {
    setNodeRef: setDragRef,
    attributes: dragAttributes,
    listeners: dragListeners,
    isDragging
  } = useDraggable({
    id: item.id,
    data: { item }
  })

  // Droppable (only for folders)
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `folder-drop-${item.id}`,
    data: { type: 'folder', folderId: item.id },
    disabled: item.type !== 'folder'
  })

  // Merge refs
  const mergedRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      setDragRef(node)
      setDropRef(node)
    },
    [setDragRef, setDropRef]
  )

  return (
    <div
      ref={mergedRef}
      {...dragAttributes}
      {...dragListeners}
      role="row"
      tabIndex={isFocused ? 0 : -1}
      aria-selected={isSelected}
      className={`flex items-center gap-3 px-4 h-full select-none cursor-default transition-colors group
        ${isSelected ? 'bg-g-primary/8 dark:bg-g-primary-dark/15 text-g-text dark:text-g-text-dark' : 'text-g-text dark:text-g-text-dark hover:bg-g-surface dark:hover:bg-g-btn-secondary-dark/30'}
        ${isFocused ? 'ring-1 ring-inset ring-g-primary/40 dark:ring-g-primary-dark/40' : ''}
        ${isDragging ? 'opacity-30' : ''}
        ${isOver && item.type === 'folder' ? 'bg-g-primary/8 dark:bg-g-primary-dark/10 border-l-2 border-g-primary dark:border-g-primary-dark' : ''}
        ${item.type === 'folder' ? 'cursor-pointer' : ''}
      `}
      onClick={(e) => onItemClick(item.id, e)}
      onDoubleClick={() => onOpenItem(item.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu?.(item.id, e.clientX, e.clientY)
      }}
    >
      {/* Thumbnail or icon */}
      <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            className="w-7 h-7 rounded object-cover"
            loading="lazy"
          />
        ) : (
          <span className="text-base">{getMimeIcon(item.mimeType, item.type)}</span>
        )}
      </div>

      {/* Name (or inline rename input) */}
      <div className="flex-1 min-w-0 text-sm font-medium truncate flex items-center gap-2">
        {isRenaming ? (
          <InlineRename
            currentName={item.name}
            onSubmit={(newName) => onRenameSubmit?.(item.id, newName)}
            onCancel={() => onRenameCancel?.()}
          />
        ) : (
          <span className="truncate">{item.name}</span>
        )}
        {isPending && (
          <svg className="flex-shrink-0 animate-spin h-3.5 w-3.5 text-g-primary dark:text-g-primary-dark" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {needsUser && (
          <span className="flex-shrink-0 text-g-accent text-xs font-bold" title="Action needed">!</span>
        )}
      </div>

      {/* Star toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleStar?.(item.id, !item.starred)
        }}
        className={`flex-shrink-0 p-0.5 rounded transition-colors ${
          item.starred
            ? 'text-g-accent hover:text-g-accent-dark'
            : 'text-transparent group-hover:text-g-border dark:group-hover:text-g-border-dark hover:!text-g-accent'
        }`}
        title={item.starred ? 'Unstar' : 'Star'}
      >
        <Star size={14} className={item.starred ? 'fill-g-accent' : ''} />
      </button>

      {/* Owner */}
      <div className="flex-shrink-0 w-24 text-xs text-g-text-secondary dark:text-g-text-secondary-dark text-right truncate flex items-center justify-end gap-1">
        {!item.ownedByMe && (
          <Users size={12} className="flex-shrink-0 text-g-text-disabled" />
        )}
        <span title={!item.ownedByMe && item.ownerEmail ? item.ownerEmail : undefined}>
          {item.ownedByMe ? 'me' : (item.ownerName?.split(' ')[0] ?? '\u2014')}
        </span>
      </div>

      {/* Modified */}
      <div className="flex-shrink-0 w-28 text-xs text-g-text-secondary dark:text-g-text-secondary-dark text-right">
        {formatDate(item.modifiedTimeMs)}
      </div>

      {/* Size */}
      <div className="flex-shrink-0 w-20 text-xs text-g-text-secondary dark:text-g-text-secondary-dark text-right">
        {item.type === 'folder' ? '\u2014' : formatBytes(item.sizeBytes)}
      </div>
    </div>
  )
})

export default function ListView({
  items,
  totalCount,
  onRangeNeeded,
  selection,
  onItemClick,
  onOpenItem,
  isDragging = false,
  pendingFileIds,
  needsUserFileIds,
  renamingId,
  onRenameSubmit,
  onRenameCancel,
  onContextMenu,
  onToggleStar
}: ListViewProps): React.JSX.Element {
  const parentRef = React.useRef<HTMLDivElement | null>(null)

  const virtualizer = useVirtualizer({
    count: totalCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: isDragging ? OVERSCAN_DRAGGING : OVERSCAN
  })

  // Request data for visible range
  React.useEffect(() => {
    const vItems = virtualizer.getVirtualItems()
    if (!vItems.length) return
    const start = vItems[0]!.index
    const end = vItems[vItems.length - 1]!.index
    onRangeNeeded(start, end)
  }, [virtualizer.getVirtualItems(), onRangeNeeded])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 text-xs uppercase tracking-wider text-g-text-secondary dark:text-g-text-secondary-dark bg-g-surface dark:bg-g-btn-secondary-dark/70 border-b border-g-border dark:border-g-border-dark flex-shrink-0">
        <div className="w-7" />
        <div className="flex-1 min-w-0">Name</div>
        <div className="w-5" />
        <div className="w-24 text-right">Owner</div>
        <div className="w-28 text-right">Modified</div>
        <div className="w-20 text-right">Size</div>
      </div>

      {/* Virtualized list */}
      <div
        ref={parentRef}
        role="grid"
        aria-multiselectable="true"
        className="flex-1 overflow-auto"
      >
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: 'relative'
          }}
        >
          {virtualizer.getVirtualItems().map((vItem) => {
            const item = items[vItem.index]
            if (!item) {
              return (
                <div
                  key={vItem.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: vItem.size,
                    transform: `translateY(${vItem.start}px)`
                  }}
                >
                  <div className="flex items-center gap-3 px-4 h-full animate-pulse">
                    <div className="flex-shrink-0 w-7 h-7 rounded bg-g-border dark:bg-g-border-dark" />
                    <div className="flex-1 min-w-0">
                      <div className="h-3.5 rounded bg-g-border dark:bg-g-border-dark" style={{ width: `${40 + (vItem.index % 4) * 10}%` }} />
                    </div>
                    <div className="w-5" />
                    <div className="w-16 h-3 rounded bg-g-border dark:bg-g-border-dark" />
                    <div className="w-12 h-3 rounded bg-g-border dark:bg-g-border-dark" />
                  </div>
                </div>
              )
            }

            return (
              <div
                key={item.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: vItem.size,
                  transform: `translateY(${vItem.start}px)`
                }}
              >
                <ListRow
                  item={item}
                  isSelected={selection.selectedIds.has(item.id)}
                  isFocused={selection.focusedId === item.id}
                  onItemClick={onItemClick}
                  onOpenItem={onOpenItem}
                  isPending={pendingFileIds?.has(item.id) ?? false}
                  needsUser={needsUserFileIds?.has(item.id) ?? false}
                  isRenaming={renamingId === item.id}
                  onRenameSubmit={onRenameSubmit}
                  onRenameCancel={onRenameCancel}
                  onContextMenu={onContextMenu}
                  onToggleStar={onToggleStar}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
