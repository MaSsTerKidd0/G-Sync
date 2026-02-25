interface StatusBarProps {
  authStatus: 'disconnected' | 'connecting' | 'connected'
  syncPhase: string
  itemsProcessed: number
  counts: { totalFiles: number; totalFolders: number }
}

export default function StatusBar({
  authStatus,
  syncPhase,
  itemsProcessed,
  counts
}: StatusBarProps) {
  const isSyncing = syncPhase === 'snapshot' || syncPhase === 'catchup'

  return (
    <footer className="h-9 border-t border-g-border dark:border-g-border-dark bg-g-bg dark:bg-g-surface-dark px-6 flex items-center justify-between shrink-0">
      {/* Left: connection status + progress */}
      <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-g-text-disabled dark:text-g-text-disabled-dark">
        <div className="flex items-center gap-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              authStatus === 'connected'
                ? 'bg-g-success dark:bg-g-success-dark'
                : authStatus === 'connecting'
                  ? 'bg-g-accent dark:bg-g-accent-dark animate-pulse'
                  : 'bg-g-text-disabled dark:bg-g-text-disabled-dark'
            }`}
          />
          {authStatus === 'connected' ? 'Connected' : authStatus === 'connecting' ? 'Connecting' : 'Disconnected'}
        </div>

        {/* Progress bar when syncing */}
        {authStatus === 'connected' && isSyncing && (
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 bg-g-border dark:bg-g-border-dark rounded-full overflow-hidden">
              <div className="h-full bg-g-primary dark:bg-g-primary-dark rounded-full animate-indeterminate-progress" />
            </div>
            <span className="text-g-primary dark:text-g-primary-dark normal-case tracking-normal font-medium">
              {syncPhase === 'snapshot' ? 'Indexing' : 'Catching up'} &middot; {itemsProcessed.toLocaleString()} items
            </span>
          </div>
        )}
      </div>

      {/* Right: counts */}
      {authStatus === 'connected' && (
        <div className="flex items-center gap-3 text-[10px] font-medium text-g-text-disabled dark:text-g-text-disabled-dark">
          <span>{counts.totalFiles.toLocaleString()} files</span>
          <span>&middot;</span>
          <span>{counts.totalFolders.toLocaleString()} folders</span>
        </div>
      )}
    </footer>
  )
}
