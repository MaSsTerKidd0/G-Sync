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
  return <File className={`text-g-text-disabled dark:text-g-text-disabled-dark ${className}`} />
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
    <aside className="w-72 border-l border-g-border dark:border-g-border-dark bg-g-bg dark:bg-g-surface-dark flex flex-col shrink-0 animate-slide-in-right">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-g-border dark:border-g-border-dark">
        <h3 className="font-bold text-sm text-g-text dark:text-g-text-dark">Details</h3>
        <button
          onClick={onClose}
          className="p-1 text-g-text-disabled dark:text-g-text-disabled-dark hover:text-g-text-secondary dark:hover:text-g-text-secondary-dark hover:bg-g-surface dark:hover:bg-g-btn-secondary-dark rounded-lg transition-all"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {/* Icon preview */}
        <div className="aspect-video bg-g-surface dark:bg-g-btn-secondary-dark rounded-xl flex items-center justify-center border border-g-border dark:border-g-border-dark">
          <FileTypeIcon mimeType={item.mimeType} className="w-16 h-16 opacity-30" />
        </div>

        {/* Name + type icon + star */}
        <div className="flex items-start gap-3">
          <FileTypeIcon mimeType={item.mimeType} className="w-5 h-5 mt-0.5 shrink-0" />
          <h4 className="flex-1 font-semibold text-sm text-g-text dark:text-g-text-dark break-all leading-snug">
            {item.name}
          </h4>
          <button
            onClick={() => onToggleStar?.(item.id, !item.starred)}
            className={`p-1 rounded-md transition-colors shrink-0 ${
              item.starred
                ? 'text-g-accent hover:text-g-accent-dark'
                : 'text-g-border dark:text-g-border-dark hover:text-g-accent'
            }`}
            title={item.starred ? 'Unstar' : 'Star'}
          >
            <Star size={16} className={item.starred ? 'fill-g-accent' : ''} />
          </button>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-g-surface dark:bg-g-btn-secondary-dark rounded-xl">
            <p className="text-[10px] font-bold text-g-text-disabled dark:text-g-text-disabled-dark uppercase tracking-wider mb-1">Type</p>
            <p className="text-xs font-medium text-g-text dark:text-g-text-dark truncate">
              {item.type === 'folder' ? 'Folder' : mimeLabel(item.mimeType)}
            </p>
          </div>
          <div className="p-3 bg-g-surface dark:bg-g-btn-secondary-dark rounded-xl">
            <p className="text-[10px] font-bold text-g-text-disabled dark:text-g-text-disabled-dark uppercase tracking-wider mb-1">Size</p>
            <p className="text-xs font-medium text-g-text dark:text-g-text-dark">
              {item.type === 'folder' ? '\u2014' : formatBytes(item.sizeBytes)}
            </p>
          </div>
        </div>

        {/* Detail rows */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-g-text-disabled dark:text-g-text-disabled-dark font-medium">Modified</span>
            <span className="text-g-text dark:text-g-text-dark font-medium">
              {formatDate(item.modifiedTimeMs)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-g-text-disabled dark:text-g-text-disabled-dark font-medium">MIME</span>
            <span className="text-g-text-secondary dark:text-g-text-secondary-dark font-mono text-[10px] truncate max-w-[150px]">
              {item.mimeType}
            </span>
          </div>
          {item.starred && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-g-text-disabled dark:text-g-text-disabled-dark font-medium">Starred</span>
              <span className="text-g-accent font-medium">Yes</span>
            </div>
          )}
          {item.trashed && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-g-text-disabled dark:text-g-text-disabled-dark font-medium">Status</span>
              <span className="text-g-secondary dark:text-g-secondary-dark font-medium">Trashed</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
