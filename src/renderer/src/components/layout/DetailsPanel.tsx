import { ChevronRight, Folder, File, FileText, Image, Video, Music, Star } from 'lucide-react'
import type { DriveItemDTO } from '../../types/explorer'

interface DetailsPanelProps {
  item: DriveItemDTO | null
  onClose: () => void
  onToggleStar?: (itemId: string, starred: boolean) => void
}

function FileTypeIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  if (mimeType === 'application/vnd.google-apps.folder' || mimeType === 'inode/directory')
    return <Folder className={`text-blue-400 fill-blue-400/20 ${className}`} />
  if (mimeType.startsWith('image/'))
    return <Image className={`text-purple-400 ${className}`} />
  if (mimeType.startsWith('video/'))
    return <Video className={`text-red-400 ${className}`} />
  if (mimeType.startsWith('audio/'))
    return <Music className={`text-pink-400 ${className}`} />
  if (mimeType.includes('pdf'))
    return <FileText className={`text-orange-400 ${className}`} />
  return <File className={`text-gray-400 dark:text-gray-500 ${className}`} />
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
    return new Date(ms).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return '\u2014'
  }
}

function mimeLabel(mimeType: string): string {
  const suffix = mimeType.split('/').pop() ?? mimeType
  return suffix.replace('vnd.google-apps.', '')
}

export default function DetailsPanel({ item, onClose, onToggleStar }: DetailsPanelProps) {
  if (!item) return null

  return (
    <aside className="w-72 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col shrink-0 animate-slide-in-right">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
        <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">Details</h3>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {/* Icon preview */}
        <div className="aspect-video bg-gray-50 dark:bg-gray-800 rounded-xl flex items-center justify-center border border-gray-100 dark:border-gray-700">
          <FileTypeIcon mimeType={item.mimeType} className="w-16 h-16 opacity-30" />
        </div>

        {/* Name + type icon + star */}
        <div className="flex items-start gap-3">
          <FileTypeIcon mimeType={item.mimeType} className="w-5 h-5 mt-0.5 shrink-0" />
          <h4 className="flex-1 font-semibold text-sm text-gray-900 dark:text-gray-100 break-all leading-snug">
            {item.name}
          </h4>
          <button
            onClick={() => onToggleStar?.(item.id, !item.starred)}
            className={`p-1 rounded-md transition-colors shrink-0 ${
              item.starred
                ? 'text-amber-400 hover:text-amber-500'
                : 'text-gray-300 dark:text-gray-600 hover:text-amber-400'
            }`}
            title={item.starred ? 'Unstar' : 'Star'}
          >
            <Star size={16} className={item.starred ? 'fill-amber-400' : ''} />
          </button>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Type</p>
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
              {item.type === 'folder' ? 'Folder' : mimeLabel(item.mimeType)}
            </p>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Size</p>
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {item.type === 'folder' ? '\u2014' : formatBytes(item.sizeBytes)}
            </p>
          </div>
        </div>

        {/* Detail rows */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400 dark:text-gray-500 font-medium">Modified</span>
            <span className="text-gray-900 dark:text-gray-200 font-medium">
              {formatDate(item.modifiedTimeMs)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400 dark:text-gray-500 font-medium">MIME</span>
            <span className="text-gray-600 dark:text-gray-400 font-mono text-[10px] truncate max-w-[150px]">
              {item.mimeType}
            </span>
          </div>
          {item.starred && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400 dark:text-gray-500 font-medium">Starred</span>
              <span className="text-amber-500 font-medium">Yes</span>
            </div>
          )}
          {item.trashed && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400 dark:text-gray-500 font-medium">Status</span>
              <span className="text-red-500 font-medium">Trashed</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
