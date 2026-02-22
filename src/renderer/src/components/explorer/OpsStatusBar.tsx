interface OpsStatusBarProps {
  counts: Record<string, number>
  onTogglePanel: () => void
}

export function OpsStatusBar({ counts, onTogglePanel }: OpsStatusBarProps) {
  const syncing = (counts.pending ?? 0) + (counts.in_flight ?? 0)
  const failed = (counts.needs_user ?? 0) + (counts.failed ?? 0)

  if (syncing === 0 && failed === 0) return null

  return (
    <button
      onClick={onTogglePanel}
      className="flex items-center gap-3 px-3 py-1.5 text-xs border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800/80 transition w-full text-left"
    >
      {syncing > 0 && (
        <span className="flex items-center gap-1.5 text-blue-400">
          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {syncing} syncing
        </span>
      )}
      {failed > 0 && (
        <span className="flex items-center gap-1 text-amber-400">
          <span className="font-bold">!</span>
          {failed} failed
        </span>
      )}
      <span className="ml-auto text-gray-500">Click to view details</span>
    </button>
  )
}
