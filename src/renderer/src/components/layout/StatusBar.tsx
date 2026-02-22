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
    <footer className="h-9 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 flex items-center justify-between shrink-0">
      {/* Left: connection status + progress */}
      <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
        <div className="flex items-center gap-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              authStatus === 'connected'
                ? 'bg-green-500'
                : authStatus === 'connecting'
                  ? 'bg-yellow-400 animate-pulse'
                  : 'bg-gray-400'
            }`}
          />
          {authStatus === 'connected' ? 'Connected' : authStatus === 'connecting' ? 'Connecting' : 'Disconnected'}
        </div>

        {/* Progress bar when syncing */}
        {authStatus === 'connected' && isSyncing && (
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full animate-indeterminate-progress" />
            </div>
            <span className="text-blue-500 dark:text-blue-400 normal-case tracking-normal font-medium">
              {syncPhase === 'snapshot' ? 'Indexing' : 'Catching up'} &middot; {itemsProcessed.toLocaleString()} items
            </span>
          </div>
        )}
      </div>

      {/* Right: counts */}
      {authStatus === 'connected' && (
        <div className="flex items-center gap-3 text-[10px] font-medium text-gray-400 dark:text-gray-500">
          <span>{counts.totalFiles.toLocaleString()} files</span>
          <span>&middot;</span>
          <span>{counts.totalFolders.toLocaleString()} folders</span>
        </div>
      )}
    </footer>
  )
}
