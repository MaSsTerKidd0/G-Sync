import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface ContextMenuProps {
  x: number
  y: number
  selectedCount: number
  hasFocusedItem: boolean
  isFocusedFolder: boolean
  isFocusedStarred: boolean
  onOpen: () => void
  onRename: () => void
  onTrash: () => void
  onDelete: () => void
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
  onOpen,
  onRename,
  onTrash,
  onDelete,
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

  const items: MenuItem[] = [
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
      disabled: selectedCount !== 1
    },
    { label: '', action: () => {}, separator: true },
    {
      label: selectedCount > 1 ? `Move ${selectedCount} items to Trash` : 'Move to Trash',
      shortcut: 'Del',
      action: onTrash,
      disabled: selectedCount === 0
    },
    {
      label: selectedCount > 1 ? `Delete ${selectedCount} items permanently` : 'Delete permanently',
      shortcut: 'Shift+Del',
      action: onDelete,
      disabled: selectedCount === 0,
      destructive: true
    }
  ]

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1 text-sm"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={i} className="border-t border-gray-200 dark:border-gray-700 my-1" />
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
                ? 'text-gray-400 dark:text-gray-600 cursor-default'
                : item.destructive
                  ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-600/15'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/60'
              }
            `}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span className="text-[10px] text-gray-500">{item.shortcut}</span>
            )}
          </button>
        )
      })}
    </div>,
    document.body
  )
}
