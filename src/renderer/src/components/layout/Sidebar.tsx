import { useState, useEffect, useCallback } from 'react'
import {
  HardDrive,
  Sparkles,
  LogIn,
  Loader2,
  Star,
  ChevronDown,
  RefreshCw,
  Folder,
  FileText,
  FolderSync,
  Plus,
  X,
  Trash2,
  Users,
  Image,
  AlertTriangle
} from 'lucide-react'
import ConflictResolutionDialog from '../ConflictResolutionDialog'

type ActiveView = 'explorer' | 'smart-tools' | 'settings' | 'trash' | 'shared' | 'media'

interface SidebarProps {
  activeView: ActiveView
  onViewChange: (view: ActiveView) => void
  authStatus: 'disconnected' | 'connecting' | 'connected'
  syncPhase: string
  syncCounts: { totalFiles: number; totalFolders: number }
  onLogin: () => void
  onStartSync: () => void
  onStopSync: () => void
  onTriggerSync: () => void
  onNavigateToItem?: (itemId: string) => void
  syncing: boolean
}

const NAV_ITEMS: Array<{ id: ActiveView; label: string; icon: typeof HardDrive }> = [
  { id: 'explorer', label: 'My Drive', icon: HardDrive },
  { id: 'shared', label: 'Shared with me', icon: Users },
  { id: 'media', label: 'Photos', icon: Image },
  { id: 'trash', label: 'Trash', icon: Trash2 },
  { id: 'smart-tools', label: 'Smart Tools', icon: Sparkles }
]

const phaseLabel: Record<string, string> = {
  idle: 'Idle',
  snapshot: 'Syncing...',
  catchup: 'Catching up...',
  incremental: 'Synced'
}

const phaseColor: Record<string, string> = {
  idle: 'bg-g-text-disabled dark:bg-g-text-disabled-dark',
  snapshot: 'bg-g-accent animate-pulse',
  catchup: 'bg-orange-400 animate-pulse',
  incremental: 'bg-g-success'
}

interface StarredItem {
  id: string
  name: string
  mime_type: string
  is_folder: number
}

export default function Sidebar({
  activeView,
  onViewChange,
  authStatus,
  syncPhase,
  syncCounts,
  onLogin,
  onStartSync,
  onStopSync,
  onTriggerSync,
  onNavigateToItem,
  syncing
}: SidebarProps) {
  const isConnected = authStatus === 'connected'

  // ── Trash count ──
  const [trashedCount, setTrashedCount] = useState(0)

  useEffect(() => {
    if (!isConnected) return
    window.gsync.db.trashedCount().then(setTrashedCount).catch(console.error)
  }, [isConnected])

  // ── Shared with me count ──
  const [sharedCount, setSharedCount] = useState(0)

  useEffect(() => {
    if (!isConnected) return
    window.gsync.db.sharedWithMeCount().then(setSharedCount).catch(console.error)
  }, [isConnected])

  // Refresh trash + shared counts when DB changes
  useEffect(() => {
    if (!isConnected) return
    const unsub = window.gsync.explorer.onDbChanged(() => {
      window.gsync.db.trashedCount().then(setTrashedCount).catch(console.error)
      window.gsync.db.sharedWithMeCount().then(setSharedCount).catch(console.error)
    })
    return unsub
  }, [isConnected])

  // ── Starred section state ──
  const [starredOpen, setStarredOpen] = useState(false)
  const [starredItems, setStarredItems] = useState<StarredItem[]>([])
  const [starredLoading, setStarredLoading] = useState(false)

  useEffect(() => {
    if (starredOpen && isConnected) {
      setStarredLoading(true)
      window.gsync.db
        .starredItems(20)
        .then((items) => setStarredItems(items as unknown as StarredItem[]))
        .catch(console.error)
        .finally(() => setStarredLoading(false))
    }
  }, [starredOpen, isConnected])

  // ── Synced Folders state ──
  interface SyncedFolderItem {
    id: string
    local_path: string
    status: string
    last_error: string | null
  }

  const [syncedFoldersOpen, setSyncedFoldersOpen] = useState(false)
  const [syncedFolders, setSyncedFolders] = useState<SyncedFolderItem[]>([])
  const [folderProgress, setFolderProgress] = useState<Record<string, { current: number; total: number; fileName: string }>>({})

  // Per-folder conflict count for the warning badge.
  const [conflictCounts, setConflictCounts] = useState<Record<string, number>>({})
  // Currently-open conflict resolution dialog (folderId or null).
  const [conflictDialogFolder, setConflictDialogFolder] = useState<SyncedFolderItem | null>(null)

  const refreshConflictCounts = useCallback(() => {
    if (!isConnected) return
    window.gsync.folders
      .conflictCounts()
      .then(setConflictCounts)
      .catch(console.error)
  }, [isConnected])

  useEffect(() => {
    refreshConflictCounts()
  }, [refreshConflictCounts])

  // Fetch synced folders
  useEffect(() => {
    if (!isConnected) return
    window.gsync.folders
      .list()
      .then((folders) => setSyncedFolders(folders))
      .catch(console.error)
  }, [isConnected])

  // Subscribe to folder status changes
  useEffect(() => {
    if (!isConnected) return

    const unsubStatus = window.gsync.folders.onStatusChanged((payload) => {
      if (payload.status === 'removed') {
        setSyncedFolders((prev) => prev.filter((f) => f.id !== payload.folderId))
      } else {
        setSyncedFolders((prev) =>
          prev.map((f) => (f.id === payload.folderId ? { ...f, status: payload.status } : f))
        )
      }
      // Conflict counts may have changed — a sync run can create new conflicts
      // and a 'conflict-resolved' event clears one. Refetch in either case.
      refreshConflictCounts()
    })

    const unsubProgress = window.gsync.folders.onSyncProgress((payload) => {
      setFolderProgress((prev) => ({
        ...prev,
        [payload.folderId]: { current: payload.current, total: payload.total, fileName: payload.fileName }
      }))
    })

    return () => {
      unsubStatus()
      unsubProgress()
    }
  }, [isConnected])

  const handleAddFolder = useCallback(async () => {
    try {
      const result = await window.gsync.folders.add()
      if (result.success && result.folder) {
        setSyncedFolders((prev) => [...prev, result.folder as SyncedFolderItem])
      }
    } catch (err) {
      console.error('[sidebar] Failed to add folder:', err)
    }
  }, [])

  const handleRemoveFolder = useCallback(async (folderId: string) => {
    try {
      await window.gsync.folders.remove(folderId)
      // The status event handler will remove it from state
    } catch (err) {
      console.error('[sidebar] Failed to remove folder:', err)
    }
  }, [])

  const handleRetryFolder = useCallback(async (folderId: string) => {
    try {
      await window.gsync.folders.sync(folderId)
    } catch (err) {
      console.error('[sidebar] Failed to retry folder sync:', err)
    }
  }, [])

  // Refresh starred items when sync updates data
  useEffect(() => {
    if (!starredOpen || !isConnected) return
    const unsub = window.gsync.explorer.onDbChanged(() => {
      window.gsync.db
        .starredItems(20)
        .then((items) => setStarredItems(items as unknown as StarredItem[]))
        .catch(console.error)
    })
    return unsub
  }, [starredOpen, isConnected])

  return (
    <aside className="w-64 border-r border-g-border dark:border-g-border-dark bg-g-bg dark:bg-g-surface-dark flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 bg-g-primary rounded-lg flex items-center justify-center shadow-md">
          <HardDrive className="text-white" size={18} />
        </div>
        <span className="font-bold text-lg tracking-tight text-g-text dark:text-g-text-dark">
          <span className="text-g-primary dark:text-g-primary-dark">G</span>-Sync
        </span>
      </div>

      {/* Navigation */}
      <nav className="px-3 space-y-1">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = activeView === id
          const disabled = id !== 'settings' && !isConnected
          return (
            <button
              key={id}
              onClick={() => !disabled && onViewChange(id)}
              disabled={disabled}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-sm ${
                active
                  ? 'bg-g-primary/8 dark:bg-g-primary-dark/10 text-g-primary dark:text-g-primary-dark font-medium'
                  : disabled
                    ? 'text-g-text-disabled dark:text-g-text-disabled-dark cursor-not-allowed'
                    : 'text-g-text-secondary dark:text-g-text-secondary-dark hover:bg-g-surface dark:hover:bg-g-btn-secondary-dark'
              }`}
            >
              <Icon
                size={18}
                className={active ? 'text-g-primary dark:text-g-primary-dark' : disabled ? 'text-g-text-disabled dark:text-g-text-disabled-dark' : 'text-g-text-disabled dark:text-g-text-secondary-dark'}
              />
              <span className="flex-1">{label}</span>
              {id === 'trash' && trashedCount > 0 && !disabled && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-g-btn-secondary dark:bg-g-btn-secondary-dark text-g-text-secondary dark:text-g-text-secondary-dark">
                  {trashedCount > 999 ? '999+' : trashedCount}
                </span>
              )}
              {id === 'shared' && sharedCount > 0 && !disabled && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-g-btn-secondary dark:bg-g-btn-secondary-dark text-g-text-secondary dark:text-g-text-secondary-dark">
                  {sharedCount > 999 ? '999+' : sharedCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Starred section */}
      {isConnected && (
        <div className="px-3 mt-3">
          <button
            onClick={() => setStarredOpen(!starredOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-g-text-secondary dark:text-g-text-secondary-dark hover:bg-g-surface dark:hover:bg-g-btn-secondary-dark transition-colors"
          >
            <div className="flex items-center gap-2">
              <Star size={16} className="text-g-accent" />
              <span>Starred</span>
            </div>
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${starredOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {starredOpen && (
            <div className="mt-1 space-y-0.5 max-h-48 overflow-y-auto custom-scrollbar">
              {starredLoading ? (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-g-text-disabled">
                  <Loader2 size={12} className="animate-spin" />
                  Loading...
                </div>
              ) : starredItems.length === 0 ? (
                <p className="text-xs text-g-text-disabled dark:text-g-text-disabled-dark px-3 py-2">
                  No starred items
                </p>
              ) : (
                starredItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onNavigateToItem?.(item.id)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-g-text-secondary dark:text-g-text-secondary-dark hover:bg-g-surface dark:hover:bg-g-btn-secondary-dark rounded-md transition-colors truncate"
                    title={item.name}
                  >
                    {item.is_folder === 1 ? (
                      <Folder size={14} className="text-g-primary-dark shrink-0" />
                    ) : (
                      <FileText size={14} className="text-g-text-disabled shrink-0" />
                    )}
                    <span className="truncate">{item.name}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Synced Folders section */}
      {isConnected && (
        <div className="px-3 mt-3">
          <button
            onClick={() => setSyncedFoldersOpen(!syncedFoldersOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-g-text-secondary dark:text-g-text-secondary-dark hover:bg-g-surface dark:hover:bg-g-btn-secondary-dark transition-colors"
          >
            <div className="flex items-center gap-2">
              <FolderSync size={16} className="text-g-primary dark:text-g-primary-dark" />
              <span>Synced Folders</span>
            </div>
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${syncedFoldersOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {syncedFoldersOpen && (
            <div className="mt-1 space-y-0.5 max-h-48 overflow-y-auto custom-scrollbar">
              {syncedFolders.length === 0 ? (
                <p className="text-xs text-g-text-disabled dark:text-g-text-disabled-dark px-3 py-2">
                  No synced folders
                </p>
              ) : (
                syncedFolders.map((folder) => {
                  const folderName = folder.local_path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? 'Folder'
                  const progress = folderProgress[folder.id]
                  const conflictCount = conflictCounts[folder.id] ?? 0
                  const statusDot =
                    folder.status === 'synced' ? 'bg-g-success' :
                    folder.status === 'syncing' ? 'bg-g-accent animate-pulse' :
                    folder.status === 'error' ? 'bg-g-secondary' :
                    'bg-g-text-disabled'

                  return (
                    <div key={folder.id} className="group">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-g-surface dark:hover:bg-g-btn-secondary-dark transition-colors">
                        <div className={`h-2 w-2 rounded-full flex-shrink-0 ${statusDot}`} />
                        <Folder size={14} className="text-g-primary-dark shrink-0" />
                        <span className="flex-1 text-xs text-g-text-secondary dark:text-g-text-secondary-dark truncate" title={folder.local_path}>
                          {folderName}
                        </span>
                        {/* Conflict badge — only shown when count > 0. Click opens the resolution dialog. */}
                        {conflictCount > 0 && (
                          <button
                            onClick={() => setConflictDialogFolder(folder)}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-g-accent/15 dark:bg-g-accent-dark/20 text-g-accent dark:text-g-accent-dark hover:bg-g-accent/25 dark:hover:bg-g-accent-dark/30 transition-colors"
                            title={`${conflictCount} file${conflictCount === 1 ? '' : 's'} need conflict resolution`}
                          >
                            <AlertTriangle size={10} />
                            <span className="text-[10px] font-bold leading-none">{conflictCount}</span>
                          </button>
                        )}
                        {folder.status === 'error' && (
                          <button
                            onClick={() => handleRetryFolder(folder.id)}
                            className="text-g-accent hover:text-g-accent-dark p-0.5"
                            title={folder.last_error ?? 'Retry sync'}
                          >
                            <RefreshCw size={12} />
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveFolder(folder.id)}
                          className="text-g-text-disabled hover:text-g-secondary p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Remove synced folder"
                        >
                          <X size={12} />
                        </button>
                      </div>
                      {/* Progress bar during sync */}
                      {folder.status === 'syncing' && progress && progress.total > 0 && (
                        <div className="px-3 pb-1">
                          <div className="h-1 rounded-full bg-g-border dark:bg-g-border-dark overflow-hidden">
                            <div
                              className="h-full bg-g-primary rounded-full transition-all duration-300"
                              style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-g-text-disabled mt-0.5 truncate">
                            {progress.current}/{progress.total} — {progress.fileName}
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })
              )}

              {/* Add Folder button */}
              <button
                onClick={handleAddFolder}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-g-primary dark:text-g-primary-dark hover:bg-g-primary/8 dark:hover:bg-g-primary-dark/10 rounded-md transition-colors font-medium"
              >
                <Plus size={14} />
                Add Folder
              </button>
            </div>
          )}
        </div>
      )}

      {/* Spacer — pushes sync status + bottom section to the very bottom */}
      <div className="flex-1" />

      {/* Sync status (bottom, above theme/auth) */}
      {isConnected && (
        <div className="px-3 pb-2">
          <div className="px-3 py-2 rounded-lg bg-g-surface dark:bg-g-bg-dark/50">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${phaseColor[syncPhase] ?? 'bg-g-text-disabled'}`} />
                <span className="text-xs font-medium text-g-text-secondary dark:text-g-text-secondary-dark">
                  {phaseLabel[syncPhase] ?? syncPhase}
                </span>
              </div>
              {syncPhase === 'idle' ? (
                <button
                  onClick={onStartSync}
                  disabled={syncing}
                  className="text-[10px] font-bold text-g-primary dark:text-g-primary-dark hover:underline disabled:opacity-50"
                >
                  {syncing ? 'Starting...' : 'Start'}
                </button>
              ) : syncPhase === 'incremental' ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={onTriggerSync}
                    className="flex items-center gap-1 text-[10px] font-bold text-g-primary dark:text-g-primary-dark hover:underline"
                    title="Trigger immediate sync"
                  >
                    <RefreshCw size={10} />
                    Sync Now
                  </button>
                  <button
                    onClick={onStopSync}
                    className="text-[10px] font-bold text-g-text-secondary dark:text-g-text-secondary-dark hover:underline"
                  >
                    Stop
                  </button>
                </div>
              ) : (
                <button
                  onClick={onStopSync}
                  className="text-[10px] font-bold text-g-text-secondary dark:text-g-text-secondary-dark hover:underline"
                >
                  Stop
                </button>
              )}
            </div>
            <div className="flex gap-2 text-[10px] text-g-text-disabled dark:text-g-text-disabled-dark">
              <span>{syncCounts.totalFiles.toLocaleString()} files</span>
              <span>&middot;</span>
              <span>{syncCounts.totalFolders.toLocaleString()} folders</span>
            </div>
          </div>
        </div>
      )}

      {/* Bottom section — Login prompt when disconnected */}
      {!isConnected && (
        <div className="p-4 border-t border-g-border/50 dark:border-g-border-dark">
          {authStatus === 'connecting' ? (
            <div className="flex items-center gap-3 px-3 py-2 text-sm text-g-text-disabled">
              <Loader2 size={16} className="animate-spin" />
              Connecting...
            </div>
          ) : (
            <button
              onClick={onLogin}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-g-text dark:text-g-text-dark bg-g-btn-secondary dark:bg-g-btn-secondary-dark hover:bg-g-border dark:hover:bg-g-border-dark rounded-lg transition-colors"
            >
              <LogIn size={16} />
              Login with Google
            </button>
          )}
        </div>
      )}

      {/* Conflict resolution dialog — opened from the per-folder badge above */}
      {conflictDialogFolder && (
        <ConflictResolutionDialog
          folderId={conflictDialogFolder.id}
          folderName={
            conflictDialogFolder.local_path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ??
            'Folder'
          }
          onClose={() => {
            setConflictDialogFolder(null)
            // Refetch counts on close — the dialog may have resolved some
            // conflicts that we want reflected in the badge immediately.
            refreshConflictCounts()
          }}
        />
      )}
    </aside>
  )
}
