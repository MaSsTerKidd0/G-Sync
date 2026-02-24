import { useState, useEffect, useCallback } from 'react'
import {
  HardDrive,
  Sparkles,
  Settings,
  Sun,
  Moon,
  Monitor,
  LogOut,
  LogIn,
  Loader2,
  Star,
  ChevronDown,
  RefreshCw,
  Folder,
  FileText,
  FolderSync,
  Plus,
  X
} from 'lucide-react'
import { useTheme, type ThemeOption } from '../../context/ThemeContext'

type ActiveView = 'explorer' | 'smart-tools' | 'settings'

interface SidebarProps {
  activeView: ActiveView
  onViewChange: (view: ActiveView) => void
  authStatus: 'disconnected' | 'connecting' | 'connected'
  syncPhase: string
  syncCounts: { totalFiles: number; totalFolders: number }
  onLogin: () => void
  onDisconnect: () => void
  onStartSync: () => void
  onStopSync: () => void
  onTriggerSync: () => void
  onNavigateToItem?: (itemId: string) => void
  syncing: boolean
}

const NAV_ITEMS: Array<{ id: ActiveView; label: string; icon: typeof HardDrive }> = [
  { id: 'explorer', label: 'My Drive', icon: HardDrive },
  { id: 'smart-tools', label: 'Smart Tools', icon: Sparkles },
  { id: 'settings', label: 'Settings', icon: Settings }
]

const THEME_OPTIONS: Array<{ value: ThemeOption; icon: typeof Sun; label: string }> = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' }
]

const phaseLabel: Record<string, string> = {
  idle: 'Idle',
  snapshot: 'Syncing...',
  catchup: 'Catching up...',
  incremental: 'Synced'
}

const phaseColor: Record<string, string> = {
  idle: 'bg-gray-400',
  snapshot: 'bg-yellow-400 animate-pulse',
  catchup: 'bg-orange-400 animate-pulse',
  incremental: 'bg-green-500'
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
  onDisconnect,
  onStartSync,
  onStopSync,
  onTriggerSync,
  onNavigateToItem,
  syncing
}: SidebarProps) {
  const { theme, setTheme } = useTheme()
  const isConnected = authStatus === 'connected'

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
    <aside className="w-64 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-md">
          <HardDrive className="text-white" size={18} />
        </div>
        <span className="font-bold text-lg tracking-tight text-gray-900 dark:text-gray-100">
          <span className="text-blue-500">G</span>-Sync
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
                  ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium'
                  : disabled
                    ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <Icon
                size={18}
                className={active ? 'text-blue-600 dark:text-blue-400' : disabled ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400 dark:text-gray-500'}
              />
              {label}
            </button>
          )
        })}
      </nav>

      {/* Starred section */}
      {isConnected && (
        <div className="px-3 mt-3">
          <button
            onClick={() => setStarredOpen(!starredOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Star size={16} className="text-amber-500" />
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
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400">
                  <Loader2 size={12} className="animate-spin" />
                  Loading...
                </div>
              ) : starredItems.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">
                  No starred items
                </p>
              ) : (
                starredItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onNavigateToItem?.(item.id)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors truncate"
                    title={item.name}
                  >
                    {item.is_folder === 1 ? (
                      <Folder size={14} className="text-blue-400 shrink-0" />
                    ) : (
                      <FileText size={14} className="text-gray-400 shrink-0" />
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
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FolderSync size={16} className="text-blue-500" />
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
                <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">
                  No synced folders
                </p>
              ) : (
                syncedFolders.map((folder) => {
                  const folderName = folder.local_path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? 'Folder'
                  const progress = folderProgress[folder.id]
                  const statusDot =
                    folder.status === 'synced' ? 'bg-green-500' :
                    folder.status === 'syncing' ? 'bg-amber-400 animate-pulse' :
                    folder.status === 'error' ? 'bg-red-500' :
                    'bg-gray-400'

                  return (
                    <div key={folder.id} className="group">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <div className={`h-2 w-2 rounded-full flex-shrink-0 ${statusDot}`} />
                        <Folder size={14} className="text-blue-400 shrink-0" />
                        <span className="flex-1 text-xs text-gray-600 dark:text-gray-400 truncate" title={folder.local_path}>
                          {folderName}
                        </span>
                        {folder.status === 'error' && (
                          <button
                            onClick={() => handleRetryFolder(folder.id)}
                            className="text-amber-500 hover:text-amber-600 p-0.5"
                            title={folder.last_error ?? 'Retry sync'}
                          >
                            <RefreshCw size={12} />
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveFolder(folder.id)}
                          className="text-gray-400 hover:text-red-500 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Remove synced folder"
                        >
                          <X size={12} />
                        </button>
                      </div>
                      {/* Progress bar during sync */}
                      {folder.status === 'syncing' && progress && progress.total > 0 && (
                        <div className="px-3 pb-1">
                          <div className="h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all duration-300"
                              style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5 truncate">
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
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-md transition-colors font-medium"
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
          <div className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${phaseColor[syncPhase] ?? 'bg-gray-400'}`} />
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  {phaseLabel[syncPhase] ?? syncPhase}
                </span>
              </div>
              {syncPhase === 'idle' ? (
                <button
                  onClick={onStartSync}
                  disabled={syncing}
                  className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                >
                  {syncing ? 'Starting...' : 'Start'}
                </button>
              ) : syncPhase === 'incremental' ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={onTriggerSync}
                    className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                    title="Trigger immediate sync"
                  >
                    <RefreshCw size={10} />
                    Sync Now
                  </button>
                  <button
                    onClick={onStopSync}
                    className="text-[10px] font-bold text-gray-500 dark:text-gray-400 hover:underline"
                  >
                    Stop
                  </button>
                </div>
              ) : (
                <button
                  onClick={onStopSync}
                  className="text-[10px] font-bold text-gray-500 dark:text-gray-400 hover:underline"
                >
                  Stop
                </button>
              )}
            </div>
            <div className="flex gap-2 text-[10px] text-gray-400 dark:text-gray-500">
              <span>{syncCounts.totalFiles.toLocaleString()} files</span>
              <span>&middot;</span>
              <span>{syncCounts.totalFolders.toLocaleString()} folders</span>
            </div>
          </div>
        </div>
      )}

      {/* Bottom section */}
      <div className="p-4 border-t border-gray-100 dark:border-gray-800 space-y-3">
        {/* Theme picker */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
          {THEME_OPTIONS.map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs transition-all ${
                theme === value
                  ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600 dark:text-blue-400 font-medium'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              title={label}
            >
              <Icon size={14} />
              <span className="hidden lg:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Auth */}
        {authStatus === 'connected' ? (
          <button
            onClick={onDisconnect}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <LogOut size={16} />
            Disconnect
          </button>
        ) : authStatus === 'connecting' ? (
          <div className="flex items-center gap-3 px-3 py-2 text-sm text-gray-400">
            <Loader2 size={16} className="animate-spin" />
            Connecting...
          </div>
        ) : (
          <button
            onClick={onLogin}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <LogIn size={16} />
            Login with Google
          </button>
        )}
      </div>
    </aside>
  )
}
