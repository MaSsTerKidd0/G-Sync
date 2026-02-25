interface OpsPanelProps {
  ops: OpRecordBridge[]
  onRetry: (opId: string) => Promise<void>
  onRollback: (opId: string) => Promise<void>
  onCancel: (opId: string) => Promise<void>
  onClose: () => void
  onClear?: () => void
}

function opTypeLabel(opType: string): string {
  switch (opType) {
    case 'move': return 'Move'
    case 'rename': return 'Rename'
    case 'trash': return 'Trash'
    case 'untrash': return 'Restore'
    case 'delete': return 'Delete'
    default: return opType
  }
}

function opTypeIcon(opType: string): string {
  switch (opType) {
    case 'move': return '\u2192'
    case 'rename': return '\u270F'
    case 'trash': return '\uD83D\uDDD1'
    case 'untrash': return '\u21A9'
    case 'delete': return '\u2716'
    default: return '\u2022'
  }
}

function statusBadge(status: string): { text: string; className: string } {
  switch (status) {
    case 'pending': return { text: 'Pending', className: 'text-g-primary dark:text-g-primary-dark bg-g-primary/10 dark:bg-g-primary-dark/15' }
    case 'in_flight': return { text: 'Syncing', className: 'text-g-primary dark:text-g-primary-dark bg-g-primary/10 dark:bg-g-primary-dark/15' }
    case 'succeeded': return { text: 'Done', className: 'text-g-success dark:text-g-success-dark bg-g-success/10 dark:bg-g-success-dark/15' }
    case 'failed': return { text: 'Failed', className: 'text-g-secondary dark:text-g-secondary-dark bg-g-secondary/10 dark:bg-g-secondary-dark/15' }
    case 'rolled_back': return { text: 'Rolled back', className: 'text-g-text-disabled dark:text-g-text-disabled-dark bg-g-text-disabled/10' }
    case 'needs_user': return { text: 'Needs attention', className: 'text-g-accent dark:text-g-accent-dark bg-g-accent/10 dark:bg-g-accent-dark/15' }
    default: return { text: status, className: 'text-g-text-disabled bg-g-text-disabled/10' }
  }
}

function formatTime(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function getFileName(op: OpRecordBridge): string {
  try {
    const req = JSON.parse(op.requestJson)
    if (op.opType === 'rename') {
      const opt = JSON.parse(op.optimisticJson)
      return opt.newName ?? op.fileId
    }
    return req.fileId ?? op.fileId
  } catch {
    return op.fileId
  }
}

export function OpsPanel({ ops, onRetry, onRollback, onCancel, onClose, onClear }: OpsPanelProps) {
  // Show only non-succeeded ops, or most recent 20
  const visibleOps = ops.filter((op) => op.status !== 'succeeded').slice(0, 20)
  const hasCompleted = ops.some((op) => op.status === 'succeeded' || op.status === 'rolled_back')

  if (visibleOps.length === 0) {
    return (
      <div className="border-t border-g-border dark:border-g-border-dark bg-g-surface dark:bg-g-btn-secondary-dark/70 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-g-text dark:text-g-text-dark">Operations</span>
          <div className="flex items-center gap-2">
            {hasCompleted && onClear && (
              <button
                onClick={onClear}
                className="px-2.5 py-1 text-xs font-medium rounded-md border border-g-border dark:border-g-border-dark text-g-text-secondary dark:text-g-text-secondary-dark hover:bg-g-surface dark:hover:bg-g-btn-secondary-dark transition"
              >
                Clear
              </button>
            )}
            <button
              onClick={onClose}
              className="px-2.5 py-1 text-xs font-medium rounded-md border border-g-border dark:border-g-border-dark text-g-text-secondary dark:text-g-text-secondary-dark hover:bg-g-surface dark:hover:bg-g-btn-secondary-dark transition"
            >
              Close
            </button>
          </div>
        </div>
        <p className="text-xs text-g-text-secondary">No active operations.</p>
      </div>
    )
  }

  return (
    <div className="border-t border-g-border dark:border-g-border-dark bg-g-surface dark:bg-g-btn-secondary-dark/70 max-h-[200px] overflow-auto">
      <div className="flex items-center justify-between px-4 py-2 border-b border-g-border/50 dark:border-g-border-dark/50 sticky top-0 bg-g-surface/90 dark:bg-g-btn-secondary-dark/90 backdrop-blur">
        <span className="text-sm font-medium text-g-text dark:text-g-text-dark">Operations ({visibleOps.length})</span>
        <div className="flex items-center gap-2">
          {hasCompleted && onClear && (
            <button
              onClick={onClear}
              className="px-2.5 py-1 text-xs font-medium rounded-md border border-g-border dark:border-g-border-dark text-g-text-secondary dark:text-g-text-secondary-dark hover:bg-g-surface dark:hover:bg-g-btn-secondary-dark transition"
            >
              Clear
            </button>
          )}
          <button
            onClick={onClose}
            className="px-2.5 py-1 text-xs font-medium rounded-md border border-g-border dark:border-g-border-dark text-g-text-secondary dark:text-g-text-secondary-dark hover:bg-g-surface dark:hover:bg-g-btn-secondary-dark transition"
          >
            Close
          </button>
        </div>
      </div>
      {visibleOps.map((op) => {
        const badge = statusBadge(op.status)
        const showActions = op.status === 'failed' || op.status === 'needs_user'

        return (
          <div key={op.opId} className="flex items-center gap-3 px-4 py-2 text-xs border-b border-g-border/30 dark:border-g-border-dark/30 last:border-b-0">
            <span className="flex-shrink-0 w-5 text-center text-g-text-disabled dark:text-g-text-disabled-dark">{opTypeIcon(op.opType)}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-g-text dark:text-g-text-dark truncate">{opTypeLabel(op.opType)}</span>
                <span className="text-g-text-secondary dark:text-g-text-secondary-dark truncate" title={getFileName(op)}>
                  {getFileName(op).slice(0, 30)}
                </span>
              </div>
              {op.lastErrorMessage && showActions && (
                <div className="text-[10px] text-g-secondary/80 dark:text-g-secondary-dark/80 mt-0.5 truncate" title={op.lastErrorMessage}>
                  {op.lastErrorMessage}
                </div>
              )}
            </div>
            <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full ${badge.className}`}>
              {badge.text}
            </span>
            <span className="flex-shrink-0 text-g-text-secondary dark:text-g-text-secondary-dark w-12 text-right">
              {formatTime(op.updatedAtMs)}
            </span>
            {showActions && (
              <div className="flex-shrink-0 flex items-center gap-1">
                <button
                  onClick={() => onRetry(op.opId)}
                  className="px-1.5 py-0.5 text-[10px] text-g-primary dark:text-g-primary-dark hover:bg-g-primary/10 dark:hover:bg-g-primary-dark/15 rounded transition"
                  title="Retry"
                >
                  Retry
                </button>
                <button
                  onClick={() => onRollback(op.opId)}
                  className="px-1.5 py-0.5 text-[10px] text-g-accent dark:text-g-accent-dark hover:bg-g-accent/10 dark:hover:bg-g-accent-dark/15 rounded transition"
                  title="Rollback"
                >
                  Undo
                </button>
                <button
                  onClick={() => onCancel(op.opId)}
                  className="px-1.5 py-0.5 text-[10px] text-g-text-disabled dark:text-g-text-disabled-dark hover:bg-g-text-disabled/10 rounded transition"
                  title="Dismiss"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
