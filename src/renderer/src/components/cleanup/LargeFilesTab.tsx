/**
 * Phase 5: Large Files tab — find and manage storage hogs.
 *
 * - Configurable size threshold (slider)
 * - Sorted by size descending
 * - Multi-select for bulk trash/delete
 * - Shows total recoverable space for selected files
 */

import { useState, useEffect, useCallback } from 'react'

const SIZE_THRESHOLDS = [
  { label: '10 MB', bytes: 10_485_760 },
  { label: '50 MB', bytes: 52_428_800 },
  { label: '100 MB', bytes: 104_857_600 },
  { label: '500 MB', bytes: 524_288_000 },
  { label: '1 GB', bytes: 1_073_741_824 }
]

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function formatDate(ms: number | null): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

interface LargeFile {
  id: string
  name: string
  mimeType: string
  sizeBytes: number
  modifiedTimeMs: number | null
  parentPath: string
}

export default function LargeFilesTab(): React.JSX.Element {
  const [thresholdIdx, setThresholdIdx] = useState(2) // Default: 100 MB
  const [files, setFiles] = useState<LargeFile[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [processing, setProcessing] = useState(false)

  const threshold = SIZE_THRESHOLDS[thresholdIdx]

  const loadFiles = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSelected(new Set())
    try {
      const result = await window.gsync.cleanup.listLargeFiles({
        minSizeBytes: threshold.bytes,
        limit: 200
      })
      setFiles(result.files)
      setTotalCount(result.totalCount)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [threshold.bytes])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  const toggleSelect = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = (): void => {
    if (selected.size === files.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(files.map((f) => f.id)))
    }
  }

  const handleAction = async (action: 'trash' | 'delete'): Promise<void> => {
    if (selected.size === 0) return
    setProcessing(true)
    try {
      const fileIds = [...selected]

      // Create review → set decisions → enqueue
      const { reviewId } = await window.gsync.cleanup.createReview({
        kind: 'large_files'
      })

      await window.gsync.cleanup.setReviewDecisions({
        reviewId,
        decisions: fileIds.map((fileId) => ({ fileId, decision: action }))
      })

      await window.gsync.cleanup.enqueueReviewActions({ reviewId })

      // Reload
      await loadFiles()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setProcessing(false)
    }
  }

  // Calculate selected size
  const selectedSize = files
    .filter((f) => selected.has(f.id))
    .reduce((sum, f) => sum + f.sizeBytes, 0)

  return (
    <div className="p-4">
      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">Minimum size:</span>
          <div className="flex items-center gap-1">
            {SIZE_THRESHOLDS.map((t, idx) => (
              <button
                key={t.label}
                onClick={() => setThresholdIdx(idx)}
                className={`px-3 py-1.5 text-xs rounded-md transition ${
                  idx === thresholdIdx
                    ? 'bg-blue-50 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 border border-transparent'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <span className="text-xs text-gray-500">
          {totalCount} file{totalCount !== 1 ? 's' : ''} found
        </span>
      </div>

      {/* Action bar (shown when items selected) */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2 bg-gray-100 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/50 rounded-lg">
          <span className="text-xs text-gray-700 dark:text-gray-300">
            {selected.size} file{selected.size !== 1 ? 's' : ''} selected
            <span className="text-gray-500 ml-1.5">({formatSize(selectedSize)})</span>
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => handleAction('trash')}
              disabled={processing}
              className="px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-600/10 hover:bg-amber-100 dark:hover:bg-amber-600/20 border border-amber-200 dark:border-amber-600/30 rounded-md transition disabled:opacity-50"
            >
              Move to Trash
            </button>
            <button
              onClick={() => handleAction('delete')}
              disabled={processing}
              className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-600/10 hover:bg-red-100 dark:hover:bg-red-600/20 border border-red-200 dark:border-red-600/30 rounded-md transition disabled:opacity-50"
            >
              Delete Permanently
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-lg p-3 text-sm text-red-600 dark:text-red-400 mb-3">
          {error}
          <button onClick={loadFiles} className="ml-3 text-red-500 dark:text-red-300 hover:text-red-700 dark:hover:text-red-100 underline">
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-500">
          <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Scanning for large files...
        </div>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-500">
          <span className="text-4xl mb-3">✨</span>
          <p className="text-sm">No files larger than {threshold.label}</p>
        </div>
      ) : (
        /* File table */
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
            <div className="w-6 flex-shrink-0">
              <input
                type="checkbox"
                checked={selected.size === files.length && files.length > 0}
                onChange={selectAll}
                className="rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-blue-500"
              />
            </div>
            <div className="flex-1 min-w-0">Name</div>
            <div className="w-24 text-right">Size</div>
            <div className="w-28 text-right">Modified</div>
            <div className="w-48 text-right">Location</div>
          </div>

          {/* File rows */}
          {files.map((file) => {
            const isSelected = selected.has(file.id)
            return (
              <div
                key={file.id}
                className={`flex items-center gap-3 px-4 py-2 text-xs border-b border-gray-100 dark:border-gray-700/30 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/20 transition cursor-pointer ${
                  isSelected ? 'bg-blue-50 dark:bg-blue-600/10' : ''
                }`}
                onClick={() => toggleSelect(file.id)}
              >
                <div className="w-6 flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(file.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-blue-500"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-gray-800 dark:text-gray-200 truncate">{file.name}</div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-600">{file.mimeType.split('/').pop()}</div>
                </div>
                <div className="w-24 text-right text-gray-700 dark:text-gray-300 font-mono">
                  {formatSize(file.sizeBytes)}
                </div>
                <div className="w-28 text-right text-gray-500">
                  {formatDate(file.modifiedTimeMs)}
                </div>
                <div className="w-48 text-right text-gray-400 dark:text-gray-600 truncate" title={file.parentPath}>
                  {file.parentPath}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
