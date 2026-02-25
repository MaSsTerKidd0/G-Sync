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
      className={`hover:text-g-text dark:hover:text-g-text-dark transition max-w-[150px] truncate ${
        isOver ? 'text-g-primary dark:text-g-primary-dark bg-g-primary/8 dark:bg-g-primary-dark/10 rounded px-1.5 py-0.5 -mx-1.5 -my-0.5' : ''
      }`}
    >
      {children}
    </button>
  )
}
