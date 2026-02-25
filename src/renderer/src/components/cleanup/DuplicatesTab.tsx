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
      <div className="flex items-center justify-center h-64 text-g-text-secondary dark:text-g-text-secondary-dark">
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
        <div className="bg-g-secondary/8 dark:bg-g-secondary-dark/10 border border-g-secondary/20 dark:border-g-secondary-dark/30 rounded-lg p-4 text-sm text-g-secondary dark:text-g-secondary-dark">
          {error}
          <button onClick={loadGroups} className="ml-3 text-g-secondary dark:text-g-secondary-dark hover:text-g-secondary/80 dark:hover:text-g-secondary-dark/80 underline">
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-g-text-secondary dark:text-g-text-secondary-dark">
        <span className="text-4xl mb-3">✨</span>
        <p className="text-sm">No duplicate files found</p>
        <p className="text-xs text-g-text-disabled dark:text-g-text-disabled-dark mt-1">Your Drive is clean!</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      {/* Summary header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-g-text dark:text-g-text-dark">
            {groups.length} duplicate group{groups.length !== 1 ? 's' : ''} found
          </h3>
          <p className="text-xs text-g-text-secondary dark:text-g-text-secondary-dark mt-0.5">
            Files with matching names, sizes, and types
          </p>
        </div>
        {totalActionable > 0 && (
          <button
            onClick={handleCleanup}
            disabled={processing}
            className="flex items-center gap-2 px-4 py-2 bg-g-primary hover:bg-g-primary/90 disabled:bg-g-primary/50 disabled:text-white/60 text-white text-sm font-medium rounded-lg transition"
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
                <span className="text-white/70 text-xs">({formatSize(totalReclaimable)})</span>
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
          <div key={key} className="border border-g-border dark:border-g-border-dark rounded-lg bg-g-bg dark:bg-g-btn-secondary-dark/40 overflow-hidden">
            {/* Group header — clickable to expand */}
            <button
              onClick={() => toggleGroup(group)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-g-surface dark:hover:bg-g-btn-secondary-dark/30 transition"
            >
              <span className={`text-g-text-disabled dark:text-g-text-disabled-dark transition-transform ${expanded ? 'rotate-90' : ''}`}>
                ▶
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-g-text dark:text-g-text-dark truncate">{group.nameNorm}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    group.confidence === 'high'
                      ? 'text-g-success dark:text-g-success-dark bg-g-success/10 dark:bg-g-success-dark/15'
                      : 'text-g-accent dark:text-g-accent-dark bg-g-accent/10 dark:bg-g-accent-dark/15'
                  }`}>
                    {group.confidence === 'high' ? 'High confidence' : 'Medium confidence'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-g-text-secondary dark:text-g-text-secondary-dark mt-0.5">
                  <span>{group.fileCount} copies</span>
                  <span>{formatSize(group.sizeBytes)} each</span>
                  <span className="text-g-accent dark:text-g-accent-dark/80">~{formatSize(wastedSize)} wasted</span>
                </div>
              </div>
              <span className="text-xs text-g-text-disabled dark:text-g-text-disabled-dark">{group.mimeType.split('/').pop()}</span>
            </button>

            {/* Expanded detail */}
            {expanded && (
              <div className="border-t border-g-border dark:border-g-border-dark/50 px-4 py-2">
                {state?.loading ? (
                  <div className="py-4 text-center text-g-text-secondary dark:text-g-text-secondary-dark text-xs">Loading details...</div>
                ) : state?.detail ? (
                  <div className="space-y-1.5">
                    {state.detail.files.map((file) => {
                      const decision = state.decisions.get(file.id) ?? 'skip'
                      return (
                        <div
                          key={file.id}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs ${
                            decision === 'keep'
                              ? 'bg-g-success/8 dark:bg-g-success-dark/10 border border-g-success/20 dark:border-g-success-dark/30'
                              : decision === 'trash'
                                ? 'bg-g-secondary/8 dark:bg-g-secondary-dark/10 border border-g-secondary/20 dark:border-g-secondary-dark/30'
                                : 'bg-g-surface dark:bg-g-btn-secondary-dark/30 border border-g-border dark:border-g-border-dark/30'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-g-text dark:text-g-text-dark truncate">{file.name}</div>
                            <div className="flex items-center gap-3 text-g-text-secondary dark:text-g-text-secondary-dark mt-0.5">
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
                                  ? 'bg-g-success/15 dark:bg-g-success-dark/20 text-g-success dark:text-g-success-dark border border-g-success/30 dark:border-g-success-dark/40'
                                  : 'text-g-text-disabled dark:text-g-text-disabled-dark hover:text-g-success dark:hover:text-g-success-dark hover:bg-g-success/8 dark:hover:bg-g-success-dark/10'
                              }`}
                            >
                              Keep
                            </button>
                            <button
                              onClick={() => setDecision(key, file.id, 'trash')}
                              className={`px-2 py-1 rounded text-[10px] font-medium transition ${
                                decision === 'trash'
                                  ? 'bg-g-accent/15 dark:bg-g-accent-dark/20 text-g-accent dark:text-g-accent-dark border border-g-accent/30 dark:border-g-accent-dark/40'
                                  : 'text-g-text-disabled dark:text-g-text-disabled-dark hover:text-g-accent dark:hover:text-g-accent-dark hover:bg-g-accent/8 dark:hover:bg-g-accent-dark/10'
                              }`}
                            >
                              Trash
                            </button>
                            <button
                              onClick={() => setDecision(key, file.id, 'delete')}
                              className={`px-2 py-1 rounded text-[10px] font-medium transition ${
                                decision === 'delete'
                                  ? 'bg-g-secondary/15 dark:bg-g-secondary-dark/20 text-g-secondary dark:text-g-secondary-dark border border-g-secondary/30 dark:border-g-secondary-dark/40'
                                  : 'text-g-text-disabled dark:text-g-text-disabled-dark hover:text-g-secondary dark:hover:text-g-secondary-dark hover:bg-g-secondary/8 dark:hover:bg-g-secondary-dark/10'
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
                  <div className="py-4 text-center text-g-text-secondary dark:text-g-text-secondary-dark text-xs">Failed to load details</div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
