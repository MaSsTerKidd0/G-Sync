/**
 * Phase 5: Duplicates tab — shows duplicate file groups with review workflow.
 *
 * - Loads duplicate groups on mount
 * - Expandable cards showing files in each group
 * - Per-file keep/trash decisions
 * - "Review & Clean" button enqueues actions via Phase 4 ops queue
 */

import { useState, useEffect, useCallback } from 'react'

interface GroupState {
  expanded: boolean
  detail: DuplicateGroupDetailBridge | null
  loading: boolean
  decisions: Map<string, 'keep' | 'trash' | 'delete'>
}

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

export default function DuplicatesTab(): React.JSX.Element {
  const [groups, setGroups] = useState<DuplicateGroupBridge[]>([])
  const [groupStates, setGroupStates] = useState<Map<string, GroupState>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  const loadGroups = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.gsync.cleanup.listDuplicateGroups({ limit: 50 })
      setGroups(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadGroups()
  }, [loadGroups])

  const groupKey = (g: DuplicateGroupBridge): string =>
    `${g.nameNorm}|${g.sizeBytes}|${g.mimeType}`

  const toggleGroup = async (group: DuplicateGroupBridge): Promise<void> => {
    const key = groupKey(group)
    const current = groupStates.get(key)

    if (current?.expanded) {
      // Collapse
      setGroupStates((prev) => {
        const next = new Map(prev)
        next.set(key, { ...current, expanded: false })
        return next
      })
      return
    }

    // Expand — load detail if not cached
    if (!current?.detail) {
      setGroupStates((prev) => {
        const next = new Map(prev)
        next.set(key, {
          expanded: true,
          detail: null,
          loading: true,
          decisions: new Map()
        })
        return next
      })

      try {
        const detail = await window.gsync.cleanup.getDuplicateGroupDetails({
          nameNorm: group.nameNorm,
          sizeBytes: group.sizeBytes,
          mimeType: group.mimeType
        })

        // Default first file to 'keep', rest to 'trash'
        const decisions = new Map<string, 'keep' | 'trash' | 'delete'>()
        detail.files.forEach((f, i) => {
          decisions.set(f.id, i === 0 ? 'keep' : 'trash')
        })

        setGroupStates((prev) => {
          const next = new Map(prev)
          next.set(key, { expanded: true, detail, loading: false, decisions })
          return next
        })
      } catch {
        setGroupStates((prev) => {
          const next = new Map(prev)
          next.set(key, {
            expanded: true,
            detail: null,
            loading: false,
            decisions: new Map()
          })
          return next
        })
      }
    } else {
      setGroupStates((prev) => {
        const next = new Map(prev)
        next.set(key, { ...current, expanded: true })
        return next
      })
    }
  }

  const setDecision = (gKey: string, fileId: string, decision: 'keep' | 'trash' | 'delete'): void => {
    setGroupStates((prev) => {
      const next = new Map(prev)
      const state = next.get(gKey)
      if (state) {
        const decisions = new Map(state.decisions)
        decisions.set(fileId, decision)
        next.set(gKey, { ...state, decisions })
      }
      return next
    })
  }

  const handleCleanup = async (): Promise<void> => {
    setProcessing(true)
    try {
      // Collect all trash/delete decisions across all expanded groups
      const allDecisions: Array<{ fileId: string; decision: string }> = []

      for (const [, state] of groupStates) {
        if (!state.detail) continue
        for (const [fileId, decision] of state.decisions) {
          if (decision === 'trash' || decision === 'delete') {
            allDecisions.push({ fileId, decision })
          }
        }
      }

      if (allDecisions.length === 0) return

      // Create review → set decisions → enqueue
      const { reviewId } = await window.gsync.cleanup.createReview({
        kind: 'duplicates'
      })

      await window.gsync.cleanup.setReviewDecisions({
        reviewId,
        decisions: allDecisions
      })

      await window.gsync.cleanup.enqueueReviewActions({ reviewId })

      // Reload groups
      await loadGroups()
      setGroupStates(new Map())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setProcessing(false)
    }
  }

  // Count total actionable items
  let totalActionable = 0
  let totalReclaimable = 0
  for (const [, state] of groupStates) {
    if (!state.detail) continue
    for (const [fileId, decision] of state.decisions) {
      if (decision === 'trash' || decision === 'delete') {
        totalActionable++
        const file = state.detail.files.find((f) => f.id === fileId)
        if (file?.sizeBytes) totalReclaimable += file.sizeBytes
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-500">
        <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Scanning for duplicates...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-lg p-4 text-sm text-red-600 dark:text-red-400">
          {error}
          <button onClick={loadGroups} className="ml-3 text-red-500 dark:text-red-300 hover:text-red-700 dark:hover:text-red-100 underline">
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <span className="text-4xl mb-3">✨</span>
        <p className="text-sm">No duplicate files found</p>
        <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">Your Drive is clean!</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      {/* Summary header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {groups.length} duplicate group{groups.length !== 1 ? 's' : ''} found
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Files with matching names, sizes, and types
          </p>
        </div>
        {totalActionable > 0 && (
          <button
            onClick={handleCleanup}
            disabled={processing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:text-blue-400 text-white text-sm font-medium rounded-lg transition"
          >
            {processing ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Processing...
              </>
            ) : (
              <>
                Clean up {totalActionable} file{totalActionable !== 1 ? 's' : ''}
                <span className="text-blue-200 text-xs">({formatSize(totalReclaimable)})</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Duplicate groups */}
      {groups.map((group) => {
        const key = groupKey(group)
        const state = groupStates.get(key)
        const expanded = state?.expanded ?? false
        const wastedSize = group.totalSize - group.sizeBytes // total minus one copy

        return (
          <div key={key} className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800/40 overflow-hidden">
            {/* Group header — clickable to expand */}
            <button
              onClick={() => toggleGroup(group)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition"
            >
              <span className={`text-gray-400 dark:text-gray-500 transition-transform ${expanded ? 'rotate-90' : ''}`}>
                ▶
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{group.nameNorm}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    group.confidence === 'high'
                      ? 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-600/15'
                      : 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-600/15'
                  }`}>
                    {group.confidence === 'high' ? 'High confidence' : 'Medium confidence'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                  <span>{group.fileCount} copies</span>
                  <span>{formatSize(group.sizeBytes)} each</span>
                  <span className="text-amber-500 dark:text-amber-400/80">~{formatSize(wastedSize)} wasted</span>
                </div>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-600">{group.mimeType.split('/').pop()}</span>
            </button>

            {/* Expanded detail */}
            {expanded && (
              <div className="border-t border-gray-200 dark:border-gray-700/50 px-4 py-2">
                {state?.loading ? (
                  <div className="py-4 text-center text-gray-500 text-xs">Loading details...</div>
                ) : state?.detail ? (
                  <div className="space-y-1.5">
                    {state.detail.files.map((file) => {
                      const decision = state.decisions.get(file.id) ?? 'skip'
                      return (
                        <div
                          key={file.id}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs ${
                            decision === 'keep'
                              ? 'bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30'
                              : decision === 'trash'
                                ? 'bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30'
                                : 'bg-gray-50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700/30'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-gray-700 dark:text-gray-300 truncate">{file.name}</div>
                            <div className="flex items-center gap-3 text-gray-500 mt-0.5">
                              <span title={file.parentPath}>{file.parentPath}</span>
                              <span>{formatDate(file.modifiedTimeMs)}</span>
                              <span>{file.sizeBytes != null ? formatSize(file.sizeBytes) : '—'}</span>
                            </div>
                          </div>

                          {/* Decision buttons */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => setDecision(key, file.id, 'keep')}
                              className={`px-2 py-1 rounded text-[10px] font-medium transition ${
                                decision === 'keep'
                                  ? 'bg-green-100 dark:bg-green-600/20 text-green-600 dark:text-green-400 border border-green-300 dark:border-green-600/40'
                                  : 'text-gray-400 dark:text-gray-500 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-600/10'
                              }`}
                            >
                              Keep
                            </button>
                            <button
                              onClick={() => setDecision(key, file.id, 'trash')}
                              className={`px-2 py-1 rounded text-[10px] font-medium transition ${
                                decision === 'trash'
                                  ? 'bg-amber-100 dark:bg-amber-600/20 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-600/40'
                                  : 'text-gray-400 dark:text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-600/10'
                              }`}
                            >
                              Trash
                            </button>
                            <button
                              onClick={() => setDecision(key, file.id, 'delete')}
                              className={`px-2 py-1 rounded text-[10px] font-medium transition ${
                                decision === 'delete'
                                  ? 'bg-red-100 dark:bg-red-600/20 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-600/40'
                                  : 'text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-600/10'
                              }`}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="py-4 text-center text-gray-500 text-xs">Failed to load details</div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
