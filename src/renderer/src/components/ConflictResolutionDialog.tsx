/**
 * Conflict Resolution Dialog (v1.1.0)
 *
 * Triggered from the sidebar when a synced folder has files in 'conflict'
 * status. Lists each conflicted file with local + remote metadata, lets the
 * user choose keep-local / keep-remote / keep-both per file, and sends the
 * decision through window.gsync.folders.resolveConflict.
 *
 * UX choices:
 *   - Per-row buttons (not radio + apply) so a single click resolves a file.
 *   - "Apply to all" header buttons for bulk actions when the user has the
 *     same intent across the whole list.
 *   - Inline busy indicator per row while resolution is in flight, in case
 *     keep-remote / keep-both involves a Drive download for a large file.
 */

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, AlertTriangle, Check, FileWarning } from 'lucide-react'

interface ConflictRow {
  id: string
  folder_id: string
  relative_path: string
  local_hash: string | null
  local_modified_ms: number | null
  local_size_bytes: number | null
  drive_file_id: string | null
  drive_modified_ms: number | null
  drive_hash: string | null
  sync_status: string
  last_error: string | null
}

interface ConflictResolutionDialogProps {
  folderId: string
  folderName: string
  onClose: () => void
}

type Action = 'keep-local' | 'keep-remote' | 'keep-both'

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function formatDate(ms: number | null): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString()
}

export default function ConflictResolutionDialog({
  folderId,
  folderName,
  onClose
}: ConflictResolutionDialogProps): React.JSX.Element {
  const [conflicts, setConflicts] = useState<ConflictRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyPaths, setBusyPaths] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})

  const loadConflicts = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await window.gsync.folders.listConflicts(folderId)
      setConflicts(rows as ConflictRow[])
    } catch (err) {
      console.error('[conflicts] Failed to list:', err)
    } finally {
      setLoading(false)
    }
  }, [folderId])

  useEffect(() => {
    loadConflicts()
  }, [loadConflicts])

  // Auto-close when the last conflict is cleared — there's nothing else to do
  useEffect(() => {
    if (!loading && conflicts.length === 0) {
      const timer = setTimeout(onClose, 1200)
      return () => clearTimeout(timer)
    }
    return
  }, [loading, conflicts.length, onClose])

  const resolveOne = useCallback(
    async (relativePath: string, action: Action) => {
      setBusyPaths((prev) => new Set(prev).add(relativePath))
      setErrors((prev) => {
        const next = { ...prev }
        delete next[relativePath]
        return next
      })
      try {
        const result = await window.gsync.folders.resolveConflict({
          folderId,
          relativePath,
          action
        })
        if (result.success) {
          // Drop the row optimistically; reload in case 'keep-both' added a
          // new pending row that should also surface elsewhere.
          setConflicts((prev) => prev.filter((c) => c.relative_path !== relativePath))
        } else {
          setErrors((prev) => ({ ...prev, [relativePath]: result.error ?? 'Resolution failed' }))
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setErrors((prev) => ({ ...prev, [relativePath]: message }))
      } finally {
        setBusyPaths((prev) => {
          const next = new Set(prev)
          next.delete(relativePath)
          return next
        })
      }
    },
    [folderId]
  )

  // Bulk-apply: resolve every remaining conflict with the same action.
  const resolveAll = useCallback(
    async (action: Action) => {
      const targets = [...conflicts.map((c) => c.relative_path)]
      for (const path of targets) {
        // Sequential, not parallel — keep-remote / keep-both download Drive
        // bytes and we don't want to flood the rate limiter.
        // eslint-disable-next-line no-await-in-loop
        await resolveOne(path, action)
      }
    },
    [conflicts, resolveOne]
  )

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60" />

      <div
        className="relative bg-g-bg dark:bg-g-surface-dark border border-g-border dark:border-g-border-dark rounded-2xl shadow-2xl max-w-3xl w-full mx-4 overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-g-accent/90 to-g-accent px-6 py-5 text-white shrink-0">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-white/20 transition-colors"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-2 mb-2">
            <FileWarning size={20} className="text-white/90" />
            <span className="text-xs font-bold uppercase tracking-wider text-white/80">
              Resolve sync conflicts
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight truncate">{folderName}</h2>
          <p className="text-sm text-white/85 mt-1">
            {loading
              ? 'Loading conflicts…'
              : conflicts.length === 0
                ? 'All conflicts resolved.'
                : `${conflicts.length} file${conflicts.length === 1 ? '' : 's'} changed both locally and on Google Drive. Pick a resolution for each.`}
          </p>
        </div>

        {/* Bulk actions */}
        {!loading && conflicts.length > 0 && (
          <div className="px-6 py-3 border-b border-g-border dark:border-g-border-dark bg-g-surface dark:bg-g-btn-secondary-dark/40 flex items-center gap-2 text-xs shrink-0">
            <span className="text-g-text-secondary dark:text-g-text-secondary-dark mr-2 font-medium uppercase tracking-wide">
              Apply to all:
            </span>
            <BulkButton onClick={() => resolveAll('keep-local')}>Keep local</BulkButton>
            <BulkButton onClick={() => resolveAll('keep-remote')}>Keep remote</BulkButton>
            <BulkButton onClick={() => resolveAll('keep-both')}>Keep both</BulkButton>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-g-text-disabled dark:text-g-text-disabled-dark">
              <Loader2 className="animate-spin h-5 w-5 mr-2" />
              Loading conflicts…
            </div>
          ) : conflicts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-g-success dark:text-g-success-dark">
              <Check size={32} className="mb-2" />
              <p className="text-sm font-medium">All clear</p>
              <p className="text-xs text-g-text-disabled dark:text-g-text-disabled-dark mt-1">
                Closing in a moment…
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {conflicts.map((c) => (
                <ConflictRow
                  key={c.id}
                  row={c}
                  busy={busyPaths.has(c.relative_path)}
                  error={errors[c.relative_path]}
                  onResolve={(action) => resolveOne(c.relative_path, action)}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-g-border dark:border-g-border-dark flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-g-text-secondary dark:text-g-text-secondary-dark hover:text-g-text dark:hover:text-g-text-dark transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function BulkButton({
  onClick,
  children
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-md border border-g-border dark:border-g-border-dark bg-g-bg dark:bg-g-surface-dark hover:bg-g-btn-secondary dark:hover:bg-g-btn-secondary-dark text-g-text dark:text-g-text-dark font-medium transition-colors"
    >
      {children}
    </button>
  )
}

function ConflictRow({
  row,
  busy,
  error,
  onResolve
}: {
  row: ConflictRow
  busy: boolean
  error?: string
  onResolve: (action: Action) => void
}) {
  return (
    <li className="rounded-lg border border-g-border dark:border-g-border-dark bg-g-surface/50 dark:bg-g-btn-secondary-dark/30 p-4">
      <div className="flex items-start gap-3 mb-3">
        <FileWarning
          size={18}
          className="text-g-accent dark:text-g-accent-dark flex-shrink-0 mt-0.5"
        />
        <div className="min-w-0">
          <p className="text-sm font-mono font-medium text-g-text dark:text-g-text-dark truncate">
            {row.relative_path}
          </p>
          {error && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-g-secondary dark:text-g-secondary-dark">
              <AlertTriangle size={12} />
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Local vs remote metadata */}
      <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
        <MetadataBlock
          label="Your local copy"
          modified={row.local_modified_ms}
          size={row.local_size_bytes}
          hash={row.local_hash}
        />
        <MetadataBlock
          label="Google Drive copy"
          modified={row.drive_modified_ms}
          size={null /* drive size not tracked separately */}
          hash={row.drive_hash}
        />
      </div>

      {/* Per-row action buttons */}
      <div className="flex items-center gap-2">
        <ActionButton onClick={() => onResolve('keep-local')} disabled={busy}>
          Keep local
        </ActionButton>
        <ActionButton onClick={() => onResolve('keep-remote')} disabled={busy}>
          Keep remote
        </ActionButton>
        <ActionButton onClick={() => onResolve('keep-both')} disabled={busy}>
          Keep both
        </ActionButton>
        {busy && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-g-text-disabled dark:text-g-text-disabled-dark">
            <Loader2 className="animate-spin h-3.5 w-3.5" />
            Working…
          </span>
        )}
      </div>
    </li>
  )
}

function MetadataBlock({
  label,
  modified,
  size,
  hash
}: {
  label: string
  modified: number | null
  size: number | null
  hash: string | null
}) {
  return (
    <div className="rounded bg-g-bg dark:bg-g-surface-dark p-2.5 border border-g-border/50 dark:border-g-border-dark/50">
      <p className="text-xs uppercase tracking-wide text-g-text-disabled dark:text-g-text-disabled-dark mb-1">
        {label}
      </p>
      <p className="text-xs text-g-text-secondary dark:text-g-text-secondary-dark">
        Modified: <span className="font-mono">{formatDate(modified)}</span>
      </p>
      {size !== null && (
        <p className="text-xs text-g-text-secondary dark:text-g-text-secondary-dark">
          Size: <span className="font-mono">{formatBytes(size)}</span>
        </p>
      )}
      {hash && (
        <p className="text-xs text-g-text-disabled dark:text-g-text-disabled-dark truncate">
          Hash: <span className="font-mono">{hash.slice(0, 12)}…</span>
        </p>
      )}
    </div>
  )
}

function ActionButton({
  onClick,
  disabled,
  children
}: {
  onClick: () => void
  disabled: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 text-xs font-medium rounded-md border border-g-border dark:border-g-border-dark bg-g-bg dark:bg-g-surface-dark hover:bg-g-primary/8 dark:hover:bg-g-primary-dark/10 hover:border-g-primary dark:hover:border-g-primary-dark hover:text-g-primary dark:hover:text-g-primary-dark text-g-text dark:text-g-text-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  )
}
