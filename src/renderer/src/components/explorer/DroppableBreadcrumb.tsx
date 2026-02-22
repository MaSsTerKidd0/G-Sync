import { useDroppable } from '@dnd-kit/core'
import type { ReactNode } from 'react'

interface DroppableBreadcrumbProps {
  folderId: string
  onClick: () => void
  children: ReactNode
}

export function DroppableBreadcrumb({ folderId, onClick, children }: DroppableBreadcrumbProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `breadcrumb-${folderId}`,
    data: { type: 'breadcrumb', folderId }
  })

  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      className={`hover:text-gray-700 dark:hover:text-gray-300 transition max-w-[150px] truncate ${
        isOver ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-600/20 rounded px-1.5 py-0.5 -mx-1.5 -my-0.5' : ''
      }`}
    >
      {children}
    </button>
  )
}
