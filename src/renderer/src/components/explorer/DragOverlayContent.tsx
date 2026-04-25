import type { DriveItemDTO } from '../../types/explorer'
import FileIcon from '../FileIcon'

interface DragOverlayContentProps {
  item: DriveItemDTO
  count: number
}

export function DragOverlayContent({ item, count }: DragOverlayContentProps) {
  return (
    <div className="rounded-lg border border-g-primary dark:border-g-primary-dark bg-g-bg dark:bg-g-surface-dark px-4 py-3 shadow-xl shadow-g-primary/20 max-w-[280px] pointer-events-none">
      <div className="flex items-center gap-2">
        <FileIcon mimeType={item.mimeType} type={item.type} size={20} />
        <span className="text-sm font-medium text-g-text dark:text-g-text-dark truncate">{item.name}</span>
      </div>
      {count > 1 && (
        <div className="text-[11px] text-g-primary dark:text-g-primary-dark mt-1 ml-6">
          + {count - 1} more item{count > 2 ? 's' : ''}
        </div>
      )}
    </div>
  )
}
