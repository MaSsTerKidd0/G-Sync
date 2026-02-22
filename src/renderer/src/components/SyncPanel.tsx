import { useState, useEffect, useCallback } from 'react'

interface SyncPanelProps {
  connected: boolean
}

export default function SyncPanel({ connected }: SyncPanelProps): React.JSX.Element {
  const [phase, setPhase] = useState('idle')
  const [itemsProcessed, setItemsProcessed] = useState(0)
  const [lastError, setLastError] = useState<string | null>(null)
  const [counts, setCounts] = useState({ totalFiles: 0, totalFolders: 0, totalRemoved: 0 })
  const [syncing, setSyncing] = useState(false)

  const refreshStatus = useCallback(async () => {
    try {
      const status = await window.gsync.sync.status()
      setPhase(status.phase)
      setItemsProcessed(status.itemsProcessed)
      setLastError(status.lastError)
    } catch {
      // DB not ready yet
    }
  }, [])

  const refreshCounts = useCallback(async () => {
    try {
      const c = await window.gsync.db.counts()
      setCounts(c)
    } catch {
      // DB not ready yet
    }
  }, [])

  useEffect(() => {
    if (!connected) return

    refreshStatus()
    refreshCounts()

    const unsubPhase = window.gsync.sync.onPhaseChanged((p) => {
      setPhase(p)
      refreshCounts()
    })

    const unsubProgress = window.gsync.sync.onProgress((data) => {
      setItemsProcessed(data.itemsProcessed)
      refreshCounts()
    })

    const unsubError = window.gsync.sync.onError((err) => {
      setLastError(err.message)
    })

    return () => {
      unsubPhase()
      unsubProgress()
      unsubError()
    }
  }, [connected, refreshStatus, refreshCounts])

  const handleStartSync = async (): Promise<void> => {
    setSyncing(true)
    setLastError(null)
    const result = await window.gsync.sync.start()
    if (!result.success) {
      setLastError(result.error ?? 'Sync failed to start')
    }
    setSyncing(false)
  }

  const handleStopSync = async (): Promise<void> => {
    await window.gsync.sync.stop()
    setPhase('idle')
  }

  if (!connected) return <></>

  const phaseLabel: Record<string, string> = {
    idle: 'Idle',
    snapshot: 'Full Snapshot',
    catchup: 'Catch-up',
    incremental: 'Synced'
  }

  const phaseColor: Record<string, string> = {
    idle: 'bg-gray-500',
    snapshot: 'bg-yellow-400 animate-pulse',
    catchup: 'bg-orange-400 animate-pulse',
    incremental: 'bg-green-400'
  }

  return (
    <div className="rounded-xl bg-gray-800/50 border border-gray-700 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`h-2.5 w-2.5 rounded-full ${phaseColor[phase] ?? 'bg-gray-500'}`} />
          <span className="text-sm font-medium text-gray-300">
            Sync: {phaseLabel[phase] ?? phase}
          </span>
          {(phase === 'snapshot' || phase === 'catchup') && (
            <span className="text-xs text-gray-500">
              {itemsProcessed.toLocaleString()} items processed
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex gap-1.5 text-xs text-gray-500">
            <span>{counts.totalFiles.toLocaleString()} files</span>
            <span>&middot;</span>
            <span>{counts.totalFolders.toLocaleString()} folders</span>
          </div>

          {phase === 'idle' ? (
            <button
              onClick={handleStartSync}
              disabled={syncing}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              {syncing ? 'Starting...' : 'Start Sync'}
            </button>
          ) : (
            <button
              onClick={handleStopSync}
              className="rounded-md border border-gray-600 px-3 py-1.5 text-xs text-gray-400 transition hover:bg-gray-700"
            >
              Stop
            </button>
          )}
        </div>
      </div>

      {lastError && (
        <div className="mt-2 rounded-md bg-red-500/10 border border-red-500/30 px-3 py-1.5 text-xs text-red-400">
          {lastError}
        </div>
      )}
    </div>
  )
}
