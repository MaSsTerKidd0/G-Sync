import type { DriveItemDTO } from '../../types/explorer'

interface DragOverlayContentProps {
  item: DriveItemDTO
  count: number
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

export function DragOverlayContent({ item, count }: DragOverlayContentProps) {
  return (
    <div className="rounded-lg border border-blue-400 bg-white dark:bg-gray-800 px-4 py-3 shadow-xl shadow-blue-500/20 max-w-[280px] pointer-events-none">
      <div className="flex items-center gap-2">
        <span className="text-base flex-shrink-0">{getMimeIcon(item.mimeType, item.type)}</span>
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{item.name}</span>
      </div>
      {count > 1 && (
        <div className="text-[11px] text-blue-400 mt-1 ml-6">
          + {count - 1} more item{count > 2 ? 's' : ''}
        </div>
      )}
    </div>
  )
}
