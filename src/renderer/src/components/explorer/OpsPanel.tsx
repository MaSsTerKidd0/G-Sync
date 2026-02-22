interface OpsPanelProps {
  ops: OpRecordBridge[]
  onRetry: (opId: string) => Promise<void>
  onRollback: (opId: string) => Promise<void>
  onCancel: (opId: string) => Promise<void>
  onClose: () => void
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
    case 'pending': return { text: 'Pending', className: 'text-blue-400 bg-blue-600/15' }
    case 'in_flight': return { text: 'Syncing', className: 'text-blue-400 bg-blue-600/15' }
    case 'succeeded': return { text: 'Done', className: 'text-green-400 bg-green-600/15' }
    case 'failed': return { text: 'Failed', className: 'text-red-400 bg-red-600/15' }
    case 'rolled_back': return { text: 'Rolled back', className: 'text-gray-400 bg-gray-600/15' }
    case 'needs_user': return { text: 'Needs attention', className: 'text-amber-400 bg-amber-600/15' }
    default: return { text: status, className: 'text-gray-400 bg-gray-600/15' }
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

export function OpsPanel({ ops, onRetry, onRollback, onCancel, onClose }: OpsPanelProps) {
  // Show only non-succeeded ops, or most recent 20
  const visibleOps = ops.filter((op) => op.status !== 'succeeded').slice(0, 20)

  if (visibleOps.length === 0) {
    return (
      <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/70 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Operations</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm">
            Close
          </button>
        </div>
        <p className="text-xs text-gray-500">No active operations.</p>
      </div>
    )
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/70 max-h-[200px] overflow-auto">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200/50 dark:border-gray-700/50 sticky top-0 bg-gray-50/90 dark:bg-gray-800/90 backdrop-blur">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Operations ({visibleOps.length})</span>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm">
          Close
        </button>
      </div>
      {visibleOps.map((op) => {
        const badge = statusBadge(op.status)
        const showActions = op.status === 'failed' || op.status === 'needs_user'

        return (
          <div key={op.opId} className="flex items-center gap-3 px-4 py-2 text-xs border-b border-gray-200/30 dark:border-gray-700/30 last:border-b-0">
            <span className="flex-shrink-0 w-5 text-center text-gray-400">{opTypeIcon(op.opType)}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-gray-700 dark:text-gray-300 truncate">{opTypeLabel(op.opType)}</span>
                <span className="text-gray-500 truncate" title={getFileName(op)}>
                  {getFileName(op).slice(0, 30)}
                </span>
              </div>
              {op.lastErrorMessage && showActions && (
                <div className="text-[10px] text-red-400/80 mt-0.5 truncate" title={op.lastErrorMessage}>
                  {op.lastErrorMessage}
                </div>
              )}
            </div>
            <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full ${badge.className}`}>
              {badge.text}
            </span>
            <span className="flex-shrink-0 text-gray-600 w-12 text-right">
              {formatTime(op.updatedAtMs)}
            </span>
            {showActions && (
              <div className="flex-shrink-0 flex items-center gap-1">
                <button
                  onClick={() => onRetry(op.opId)}
                  className="px-1.5 py-0.5 text-[10px] text-blue-400 hover:bg-blue-600/15 rounded transition"
                  title="Retry"
                >
                  Retry
                </button>
                <button
                  onClick={() => onRollback(op.opId)}
                  className="px-1.5 py-0.5 text-[10px] text-amber-400 hover:bg-amber-600/15 rounded transition"
                  title="Rollback"
                >
                  Undo
                </button>
                <button
                  onClick={() => onCancel(op.opId)}
                  className="px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-600/15 rounded transition"
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
