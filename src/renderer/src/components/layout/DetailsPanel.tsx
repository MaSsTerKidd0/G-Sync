import { ChevronRight, Star, Crown, Users, UserPlus } from 'lucide-react'
import type { DriveItemDTO } from '../../types/explorer'
import FileIcon from '../FileIcon'

interface DetailsPanelProps {
  item: DriveItemDTO | null
  onClose: () => void
  onToggleStar?: (itemId: string, starred: boolean) => void
  onShare?: (item: DriveItemDTO) => void
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

export default function DetailsPanel({ item, onClose, onToggleStar, onShare }: DetailsPanelProps) {
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
          <FileIcon mimeType={item.mimeType} type={item.type} size={64} className="opacity-40" />
        </div>

        {/* Name + type icon + star */}
        <div className="flex items-start gap-3">
          <FileIcon mimeType={item.mimeType} type={item.type} size={20} className="mt-0.5" />
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

        {/* Ownership section */}
        <div className="p-3 bg-g-surface dark:bg-g-btn-secondary-dark rounded-xl space-y-2">
          <p className="text-[10px] font-bold text-g-text-disabled dark:text-g-text-disabled-dark uppercase tracking-wider mb-1">
            Ownership
          </p>
          <div className="flex items-center gap-2">
            {item.ownedByMe ? (
              <>
                <Crown size={14} className="text-g-accent flex-shrink-0" />
                <span className="text-xs font-medium text-g-text dark:text-g-text-dark">You own this file</span>
              </>
            ) : (
              <>
                <Users size={14} className="text-g-primary dark:text-g-primary-dark flex-shrink-0" />
                <div className="min-w-0">
                  <span className="text-xs font-medium text-g-text dark:text-g-text-dark block truncate">
                    {item.ownerName ?? 'Unknown'}
                  </span>
                  {item.ownerEmail && (
                    <span className="text-[10px] text-g-text-disabled dark:text-g-text-disabled-dark block truncate">
                      {item.ownerEmail}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Share button */}
        {(item.canShare || item.shared) && onShare && (
          <button
            onClick={() => onShare(item)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium bg-g-primary/10 dark:bg-g-primary-dark/10 text-g-primary dark:text-g-primary-dark border border-g-primary/20 dark:border-g-primary-dark/30 rounded-xl hover:bg-g-primary/18 dark:hover:bg-g-primary-dark/18 transition-all"
          >
            <UserPlus size={14} />
            {item.canShare ? 'Share' : 'View sharing'}
          </button>
        )}

        {/* Capabilities */}
        <div className="flex flex-wrap gap-1.5">
          {item.canEdit && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-g-success/10 text-g-success text-[10px] font-medium">
              Can edit
            </span>
          )}
          {item.canShare && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-g-primary/10 dark:bg-g-primary-dark/10 text-g-primary dark:text-g-primary-dark text-[10px] font-medium">
              Can share
            </span>
          )}
          {item.canTrash && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-g-accent/10 text-g-accent text-[10px] font-medium">
              Can trash
            </span>
          )}
          {item.canDelete && item.ownedByMe && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-g-secondary/10 text-g-secondary text-[10px] font-medium">
              Can delete
            </span>
          )}
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
