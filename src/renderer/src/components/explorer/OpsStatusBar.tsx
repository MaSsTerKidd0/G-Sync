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
      className="flex items-center gap-3 px-3 py-1.5 text-xs border-t border-g-border dark:border-g-border-dark bg-g-surface dark:bg-g-btn-secondary-dark/50 hover:bg-g-btn-secondary dark:hover:bg-g-btn-secondary-dark/80 transition w-full text-left"
    >
      {syncing > 0 && (
        <span className="flex items-center gap-1.5 text-g-primary dark:text-g-primary-dark">
          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {syncing} syncing
        </span>
      )}
      {failed > 0 && (
        <span className="flex items-center gap-1 text-g-accent">
          <span className="font-bold">!</span>
          {failed} failed
        </span>
      )}
      <span className="ml-auto text-g-text-secondary">Click to view details</span>
    </button>
  )
}
