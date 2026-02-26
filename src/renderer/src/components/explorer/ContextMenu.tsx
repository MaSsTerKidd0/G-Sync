import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface ContextMenuProps {
  x: number
  y: number
  selectedCount: number
  hasFocusedItem: boolean
  isFocusedFolder: boolean
  isFocusedStarred: boolean
  isTrashView?: boolean
  isSharedView?: boolean
  canTrashSelection: boolean
  canDeleteSelection: boolean
  onOpen: () => void
  onRename: () => void
  onTrash: () => void
  onDelete: () => void
  onRestore?: () => void
  onEmptyTrash?: () => void
  onToggleStar: () => void
  onDownload: () => void
  onClose: () => void
}

interface MenuItem {
  label: string
  shortcut?: string
  action: () => void
  disabled?: boolean
  destructive?: boolean
  separator?: boolean
}

export function ContextMenu({
  x,
  y,
  selectedCount,
  hasFocusedItem,
  isFocusedFolder,
  isFocusedStarred,
  isTrashView = false,
  isSharedView = false,
  canTrashSelection,
  canDeleteSelection,
  onOpen,
  onRename,
  onTrash,
  onDelete,
  onRestore,
  onEmptyTrash,
  onToggleStar,
  onDownload,
  onClose
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Dismiss on outside click or escape
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  // Adjust position to stay within viewport
  const adjustedX = Math.min(x, window.innerWidth - 220)
  const adjustedY = Math.min(y, window.innerHeight - 280)

  let items: MenuItem[]

  if (isTrashView) {
    // ── Trash view context menu ──
    items = [
      {
        label: selectedCount > 1 ? `Restore ${selectedCount} items` : 'Restore',
        action: () => onRestore?.(),
        disabled: selectedCount === 0
      },
      { label: '', action: () => {}, separator: true },
      {
        label: selectedCount > 1 ? `Delete ${selectedCount} items permanently` : 'Delete permanently',
        shortcut: 'Shift+Del',
        action: onDelete,
        disabled: selectedCount === 0 || !canDeleteSelection,
        destructive: true
      },
      { label: '', action: () => {}, separator: true },
      {
        label: 'Empty Trash',
        action: () => onEmptyTrash?.(),
        destructive: true
      }
    ]
  } else if (isSharedView) {
    // ── Shared view context menu (read-only: no rename, no trash) ──
    items = [
      {
        label: 'Open',
        action: onOpen,
        disabled: !hasFocusedItem
      },
      { label: '', action: () => {}, separator: true },
      {
        label: isFocusedStarred ? 'Remove Star' : 'Add Star',
        action: onToggleStar,
        disabled: !hasFocusedItem
      },
      {
        label: selectedCount > 1 ? `Download ${selectedCount} items` : 'Download',
        action: onDownload,
        disabled: selectedCount === 0
      }
    ]
  } else {
    // ── Normal view context menu ──
    items = [
      {
        label: isFocusedFolder ? 'Open Folder' : 'Open',
        action: onOpen,
        disabled: !hasFocusedItem
      },
      { label: '', action: () => {}, separator: true },
      {
        label: isFocusedStarred ? 'Remove Star' : 'Add Star',
        action: onToggleStar,
        disabled: !hasFocusedItem
      },
      {
        label: selectedCount > 1 ? `Download ${selectedCount} items` : 'Download',
        action: onDownload,
        disabled: selectedCount === 0
      },
      { label: '', action: () => {}, separator: true },
      {
        label: 'Rename',
        shortcut: 'F2',
        action: onRename,
        disabled: selectedCount !== 1 || !canTrashSelection
      },
      { label: '', action: () => {}, separator: true },
      {
        label: selectedCount > 1 ? `Move ${selectedCount} items to Trash` : 'Move to Trash',
        shortcut: 'Del',
        action: onTrash,
        disabled: selectedCount === 0 || !canTrashSelection
      }
    ]
  }

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] bg-g-bg dark:bg-g-surface-dark border border-g-border dark:border-g-border-dark rounded-lg shadow-xl py-1 text-sm"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={i} className="border-t border-g-border dark:border-g-border-dark my-1" />
        }
        return (
          <button
            key={i}
            onClick={() => {
              item.action()
              onClose()
            }}
            disabled={item.disabled}
            className={`w-full text-left px-3 py-1.5 flex items-center justify-between gap-4 transition
              ${item.disabled
                ? 'text-g-text-disabled dark:text-g-text-disabled-dark cursor-default'
                : item.destructive
                  ? 'text-g-secondary dark:text-g-secondary-dark hover:bg-g-secondary/8 dark:hover:bg-g-secondary-dark/10'
                  : 'text-g-text dark:text-g-text-dark hover:bg-g-surface dark:hover:bg-g-btn-secondary-dark/60'
              }
            `}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span className="text-[10px] text-g-text-secondary">{item.shortcut}</span>
            )}
          </button>
        )
      })}
    </div>,
    document.body
  )
}
