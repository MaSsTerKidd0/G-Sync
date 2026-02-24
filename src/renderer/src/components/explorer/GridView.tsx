/**
 * Virtualized Grid/Card View — fixed card dimensions using TanStack Virtual lanes.
 * Phase 4: adds useDraggable on all items, useDroppable on folder items,
 * inline rename, context menu, and pending-op status indicators.
 * Phase 10: adds star toggle icon.
 */

import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Star } from 'lucide-react'
import type { DriveItemDTO, SelectionState } from '../../types/explorer'
import { useThumbnail } from '../../hooks/useThumbnail'
import { InlineRename } from './InlineRename'

const CARD_W = 200
const CARD_H = 180
const GAP = 12
const OVERSCAN = 10
const OVERSCAN_DRAGGING = 40

interface GridViewProps {
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

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return ''
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

const GridCard = React.memo(function GridCard({
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
      role="gridcell"
      tabIndex={isFocused ? 0 : -1}
      aria-selected={isSelected}
      className={`h-full rounded-xl border transition-all cursor-default select-none flex flex-col overflow-hidden group
        ${isSelected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-600/15 ring-1 ring-blue-400/40'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/40 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/60'
        }
        ${isFocused ? 'ring-2 ring-blue-400/60' : ''}
        ${isDragging ? 'opacity-30' : ''}
        ${isOver && item.type === 'folder' ? 'border-blue-400 bg-blue-50 dark:bg-blue-600/20 ring-2 ring-blue-400/50' : ''}
        ${item.type === 'folder' ? 'cursor-pointer' : ''}
      `}
      onClick={(e) => onItemClick(item.id, e)}
      onDoubleClick={() => onOpenItem(item.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu?.(item.id, e.clientX, e.clientY)
      }}
    >
      {/* Thumbnail area */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-800/30 min-h-0 relative">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            className="max-w-full max-h-full object-contain p-2"
            loading="lazy"
          />
        ) : (
          <span className="text-4xl opacity-60">{getMimeIcon(item.mimeType, item.type)}</span>
        )}
        {/* Star button (top-left overlay) */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleStar?.(item.id, !item.starred)
          }}
          className={`absolute top-1.5 left-1.5 p-0.5 rounded transition-colors ${
            item.starred
              ? 'text-amber-400 hover:text-amber-500'
              : 'text-transparent group-hover:text-gray-400/60 dark:group-hover:text-gray-500/60 hover:!text-amber-400'
          }`}
          title={item.starred ? 'Unstar' : 'Star'}
        >
          <Star size={14} className={item.starred ? 'fill-amber-400' : ''} />
        </button>
        {/* Status indicators (overlay) */}
        {(isPending || needsUser) && (
          <div className="absolute top-1.5 right-1.5">
            {isPending && (
              <svg className="animate-spin h-4 w-4 text-blue-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {needsUser && (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-[10px] font-bold text-gray-900">!</span>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-700/50">
        {isRenaming ? (
          <InlineRename
            currentName={item.name}
            onSubmit={(newName) => onRenameSubmit?.(item.id, newName)}
            onCancel={() => onRenameCancel?.()}
          />
        ) : (
          <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate" title={item.name}>
            {item.name}
          </div>
        )}
        <div className="text-[10px] text-gray-500 mt-0.5">
          {item.type === 'folder' ? 'Folder' : formatBytes(item.sizeBytes)}
        </div>
      </div>
    </div>
  )
})

export default function GridView({
  items,
  totalCount,
  onRangeNeeded,
  selection,
  onItemClick,
  onOpenItem,
  isDragging: isDraggingProp = false,
  pendingFileIds,
  needsUserFileIds,
  renamingId,
  onRenameSubmit,
  onRenameCancel,
  onContextMenu,
  onToggleStar
}: GridViewProps): React.JSX.Element {
  const parentRef = React.useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = React.useState(800)

  React.useLayoutEffect(() => {
    const el = parentRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const columns = Math.max(1, Math.floor((width + GAP) / (CARD_W + GAP)))

  const virtualizer = useVirtualizer({
    count: totalCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CARD_H + GAP,
    overscan: isDraggingProp ? OVERSCAN_DRAGGING : OVERSCAN,
    lanes: columns
  })

  React.useEffect(() => {
    const vItems = virtualizer.getVirtualItems()
    if (!vItems.length) return
    onRangeNeeded(vItems[0]!.index, vItems[vItems.length - 1]!.index)
  }, [virtualizer.getVirtualItems(), onRangeNeeded])

  return (
    <div
      ref={parentRef}
      role="grid"
      aria-multiselectable="true"
      className="h-full overflow-auto p-2"
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vItem) => {
          const item = items[vItem.index]
          const lane = (vItem as unknown as { lane: number }).lane ?? (vItem.index % columns)
          const x = lane * (CARD_W + GAP)
          const y = vItem.start

          if (!item) {
            return (
              <div
                key={vItem.key}
                style={{
                  position: 'absolute',
                  width: CARD_W,
                  height: CARD_H,
                  transform: `translate(${x}px, ${y}px)`
                }}
              >
                <div className="h-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/40 flex flex-col overflow-hidden animate-pulse">
                  <div className="flex-1 bg-gray-100 dark:bg-gray-800/30" />
                  <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-700/50 space-y-1.5">
                    <div className="h-3 rounded bg-gray-200 dark:bg-gray-700 w-3/4" />
                    <div className="h-2.5 rounded bg-gray-200 dark:bg-gray-700 w-1/3" />
                  </div>
                </div>
              </div>
            )
          }

          return (
            <div
              key={item.id}
              style={{
                position: 'absolute',
                width: CARD_W,
                height: CARD_H,
                transform: `translate(${x}px, ${y}px)`
              }}
            >
              <GridCard
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
  )
}

export { CARD_W, GAP }
