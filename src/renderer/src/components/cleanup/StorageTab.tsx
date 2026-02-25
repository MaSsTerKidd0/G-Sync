/**
 * Phase 5: Storage overview tab — category breakdown + activity timeline.
 *
 * - Horizontal bar chart for storage by category (pure CSS)
 * - Timeline histogram of recent file activity
 * - Summary statistics
 */

import { useState, useEffect, useCallback } from 'react'

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

const CATEGORY_COLORS: Record<string, string> = {
  Images: 'bg-blue-500',
  Videos: 'bg-purple-500',
  Audio: 'bg-pink-500',
  Documents: 'bg-green-500',
  Archives: 'bg-amber-500',
  Folders: 'bg-g-text-disabled',
  Other: 'bg-g-text-secondary'
}

const CATEGORY_TEXT_COLORS: Record<string, string> = {
  Images: 'text-blue-500 dark:text-blue-400',
  Videos: 'text-purple-500 dark:text-purple-400',
  Audio: 'text-pink-500 dark:text-pink-400',
  Documents: 'text-green-500 dark:text-green-400',
  Archives: 'text-amber-500 dark:text-amber-400',
  Folders: 'text-g-text-secondary dark:text-g-text-secondary-dark',
  Other: 'text-g-text-disabled dark:text-g-text-disabled-dark'
}

export default function StorageTab(): React.JSX.Element {
  const [categories, setCategories] = useState<StorageCategoryBridge[]>([])
  const [histogram, setHistogram] = useState<HistogramEntryBridge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [cats, hist] = await Promise.all([
        window.gsync.cleanup.getStorageBreakdown(),
        window.gsync.cleanup.getTimelineHistogram(90)
      ])
      setCategories(cats)
      setHistogram(hist)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-g-text-secondary dark:text-g-text-secondary-dark">
        <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Analyzing storage...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-g-secondary/8 dark:bg-g-secondary-dark/10 border border-g-secondary/20 dark:border-g-secondary-dark/30 rounded-lg p-4 text-sm text-g-secondary dark:text-g-secondary-dark">
          {error}
          <button onClick={load} className="ml-3 text-g-secondary dark:text-g-secondary-dark hover:text-g-secondary/80 dark:hover:text-g-secondary-dark/80 underline">
            Retry
          </button>
        </div>
      </div>
    )
  }

  const totalSize = categories.reduce((sum, c) => sum + c.totalSize, 0)
  const totalFiles = categories.reduce((sum, c) => sum + c.fileCount, 0)
  const maxCategorySize = Math.max(...categories.map((c) => c.totalSize), 1)
  const largestCategory = categories[0]

  // Histogram
  const maxHistCount = Math.max(...histogram.map((h) => h.count), 1)

  return (
    <div className="p-4 space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-g-surface dark:bg-g-btn-secondary-dark/40 border border-g-border dark:border-g-border-dark rounded-lg p-4">
          <div className="text-xs text-g-text-secondary dark:text-g-text-secondary-dark uppercase tracking-wider">Total Size</div>
          <div className="text-2xl font-bold text-g-text dark:text-g-text-dark mt-1">{formatSize(totalSize)}</div>
        </div>
        <div className="bg-g-surface dark:bg-g-btn-secondary-dark/40 border border-g-border dark:border-g-border-dark rounded-lg p-4">
          <div className="text-xs text-g-text-secondary dark:text-g-text-secondary-dark uppercase tracking-wider">Total Files</div>
          <div className="text-2xl font-bold text-g-text dark:text-g-text-dark mt-1">{totalFiles.toLocaleString()}</div>
        </div>
        <div className="bg-g-surface dark:bg-g-btn-secondary-dark/40 border border-g-border dark:border-g-border-dark rounded-lg p-4">
          <div className="text-xs text-g-text-secondary dark:text-g-text-secondary-dark uppercase tracking-wider">Largest Category</div>
          <div className="text-2xl font-bold text-g-text dark:text-g-text-dark mt-1">
            {largestCategory?.category ?? '—'}
          </div>
          <div className="text-xs text-g-text-secondary dark:text-g-text-secondary-dark">
            {largestCategory ? formatSize(largestCategory.totalSize) : ''}
          </div>
        </div>
      </div>

      {/* Storage by category — horizontal bar chart */}
      <div className="bg-g-surface dark:bg-g-btn-secondary-dark/40 border border-g-border dark:border-g-border-dark rounded-lg p-4">
        <h3 className="text-sm font-medium text-g-text dark:text-g-text-dark mb-4">Storage by Category</h3>
        <div className="space-y-3">
          {categories
            .filter((c) => c.category !== 'Folders')
            .map((cat) => {
              const pct = totalSize > 0 ? (cat.totalSize / maxCategorySize) * 100 : 0
              const color = CATEGORY_COLORS[cat.category] ?? 'bg-g-text-secondary'
              const textColor = CATEGORY_TEXT_COLORS[cat.category] ?? 'text-g-text-disabled'

              return (
                <div key={cat.category}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium ${textColor}`}>
                      {cat.category}
                    </span>
                    <span className="text-xs text-g-text-secondary dark:text-g-text-secondary-dark">
                      {formatSize(cat.totalSize)}
                      <span className="text-g-text-disabled dark:text-g-text-disabled-dark ml-1">
                        ({cat.fileCount.toLocaleString()} file{cat.fileCount !== 1 ? 's' : ''})
                      </span>
                    </span>
                  </div>
                  <div className="w-full h-2 bg-g-border dark:bg-g-border-dark/50 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${color} transition-all duration-500`}
                      style={{ width: `${Math.max(pct, 0.5)}%` }}
                    />
                  </div>
                </div>
              )
            })}
        </div>
      </div>

      {/* Activity timeline — bar histogram */}
      {histogram.length > 0 && (
        <div className="bg-g-surface dark:bg-g-btn-secondary-dark/40 border border-g-border dark:border-g-border-dark rounded-lg p-4">
          <h3 className="text-sm font-medium text-g-text dark:text-g-text-dark mb-4">
            File Activity (last 90 days)
          </h3>
          <div className="flex items-end gap-[2px] h-24">
            {histogram.map((entry) => {
              const heightPct = (entry.count / maxHistCount) * 100
              return (
                <div
                  key={entry.day}
                  className="flex-1 min-w-[2px] bg-g-primary/60 hover:bg-g-primary/80 dark:bg-g-primary-dark/60 dark:hover:bg-g-primary-dark/80 rounded-t transition-colors cursor-default"
                  style={{ height: `${Math.max(heightPct, 2)}%` }}
                  title={`${entry.day}: ${entry.count} files`}
                />
              )
            })}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-g-text-disabled dark:text-g-text-disabled-dark">
            <span>{histogram[0]?.day ?? ''}</span>
            <span>{histogram[histogram.length - 1]?.day ?? ''}</span>
          </div>
        </div>
      )}
    </div>
  )
}
