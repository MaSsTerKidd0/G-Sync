import { useState, useEffect, useCallback } from 'react'
import { HardDrive } from 'lucide-react'
import Sidebar from './components/layout/Sidebar'
import TopBar from './components/layout/TopBar'
import StatusBar from './components/layout/StatusBar'
import DetailsPanel from './components/layout/DetailsPanel'
import ExplorerRoot from './components/explorer/ExplorerRoot'
import PhotosGrid from './components/PhotosGrid'
import CleanupDashboard from './components/cleanup/CleanupDashboard'
import SettingsPanel from './components/SettingsPanel'
import PatchNotesModal from './components/PatchNotesModal'
import { ShareDialog } from './components/explorer/ShareDialog'
import type { ViewMode, SortBy, SortDir, DriveItemDTO } from './types/explorer'

type AuthStatus = 'disconnected' | 'connecting' | 'connected'
type ActiveView = 'explorer' | 'smart-tools' | 'settings' | 'trash' | 'shared' | 'media'

function App(): React.JSX.Element {
  // ── Auth state ──
  const [authStatus, setAuthStatus] = useState<AuthStatus>('disconnected')
  const [encryptionWarning, setEncryptionWarning] = useState<string | undefined>()
  const [authError, setAuthError] = useState<string | undefined>()

  // ── View state ──
  const [activeView, setActiveView] = useState<ActiveView>('explorer')

  // ── Sync state (lifted for sidebar + status bar) ──
  const [syncPhase, setSyncPhase] = useState('idle')
  const [itemsProcessed, setItemsProcessed] = useState(0)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncCounts, setSyncCounts] = useState({ totalFiles: 0, totalFolders: 0, totalRemoved: 0 })
  const [syncing, setSyncing] = useState(false)

  // ── Explorer state (lifted for TopBar) ──
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [sortBy, setSortBy] = useState<SortBy>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // ── User profile (for account menu) ──
  const [userProfile, setUserProfile] = useState<{
    userName: string
    userEmail: string
    userPhoto?: string
  } | null>(null)

  // ── Details panel ──
  const [selectedItem, setSelectedItem] = useState<DriveItemDTO | null>(null)

  // ── Share dialog ──
  const [shareItem, setShareItem] = useState<DriveItemDTO | null>(null)

  // ── Patch notes modal ──
  // Shown once per version on first launch after upgrade. Dismissing with
  // "Don't show until next update" stamps last_seen_version in the settings
  // store so the modal stays hidden until the next release.
  const [showPatchNotes, setShowPatchNotes] = useState(false)
  const [appVersion, setAppVersion] = useState('1.1.0')

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Clear search + selection when switching views
  useEffect(() => {
    setSearchQuery('')
    setDebouncedQuery('')
    setSelectedItem(null)
  }, [activeView])

  // ── Auth logic ──
  const checkStatus = useCallback(async () => {
    try {
      const status = await window.gsync.auth.status()
      setAuthStatus(status.connected ? 'connected' : 'disconnected')
      setEncryptionWarning(status.encryptionWarning)
    } catch {
      setAuthStatus('disconnected')
    }
  }, [])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  // ── Patch notes version check ──
  // Compare the app's current version to the last_seen_version setting.
  // If the user hasn't dismissed the modal for this version yet, show it.
  useEffect(() => {
    async function checkVersion() {
      try {
        const [info, lastSeen] = await Promise.all([
          window.gsync.settings.getAppInfo(),
          window.gsync.settings.get('last_seen_version')
        ])
        setAppVersion(info.version)
        if (lastSeen !== info.version) {
          setShowPatchNotes(true)
        }
      } catch {
        // Settings DB may not be ready yet — skip silently; the next
        // status check will retry indirectly.
      }
    }
    checkVersion()
  }, [])

  const handleDismissPatchNotes = useCallback(async (dontShowAgain: boolean) => {
    setShowPatchNotes(false)
    if (dontShowAgain) {
      try {
        await window.gsync.settings.set('last_seen_version', appVersion)
      } catch {
        // Non-critical: at worst the modal shows again next launch.
      }
    }
  }, [appVersion])

  // Fetch user profile when connected (for account avatar/menu)
  useEffect(() => {
    if (authStatus !== 'connected') {
      setUserProfile(null)
      return
    }
    window.gsync.drive.getStoragePlan()
      .then((plan) => {
        setUserProfile({
          userName: plan.userName,
          userEmail: plan.userEmail,
          userPhoto: plan.userPhoto
        })
      })
      .catch((err) => {
        console.warn('[App] Failed to fetch user profile:', err)
      })
  }, [authStatus])

  const handleLogin = async (): Promise<void> => {
    setAuthStatus('connecting')
    setAuthError(undefined)
    try {
      const result = await window.gsync.auth.login()
      if (result.success) {
        setAuthStatus('connected')
      } else {
        setAuthStatus('disconnected')
        setAuthError(result.error || 'Login failed')
      }
    } catch (err) {
      setAuthStatus('disconnected')
      setAuthError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleDisconnect = async (): Promise<void> => {
    await window.gsync.auth.disconnect()
    setAuthStatus('disconnected')
    setAuthError(undefined)
  }

  // ── Sync logic (lifted from SyncPanel) ──
  const refreshSyncStatus = useCallback(async () => {
    try {
      const status = await window.gsync.sync.status()
      setSyncPhase(status.phase)
      setItemsProcessed(status.itemsProcessed)
      setSyncError(status.lastError)
    } catch {
      // DB not ready
    }
  }, [])

  const refreshCounts = useCallback(async () => {
    try {
      const c = await window.gsync.db.counts()
      setSyncCounts(c)
    } catch {
      // DB not ready
    }
  }, [])

  useEffect(() => {
    if (authStatus !== 'connected') return

    refreshSyncStatus()
    refreshCounts()

    const unsubPhase = window.gsync.sync.onPhaseChanged((p) => {
      setSyncPhase(p)
      refreshCounts()
    })

    const unsubProgress = window.gsync.sync.onProgress((data) => {
      setItemsProcessed(data.itemsProcessed)
      refreshCounts()
    })

    const unsubError = window.gsync.sync.onError((err) => {
      setSyncError(err.message)
    })

    return () => {
      unsubPhase()
      unsubProgress()
      unsubError()
    }
  }, [authStatus, refreshSyncStatus, refreshCounts])

  const handleStartSync = async (): Promise<void> => {
    setSyncing(true)
    setSyncError(null)
    const result = await window.gsync.sync.start()
    if (!result.success) {
      setSyncError(result.error ?? 'Sync failed to start')
    }
    setSyncing(false)
  }

  const handleStopSync = async (): Promise<void> => {
    await window.gsync.sync.stop()
    setSyncPhase('idle')
  }

  // ── Phase 9: Manual sync trigger ──
  const handleTriggerSync = async (): Promise<void> => {
    await window.gsync.sync.triggerSync()
  }

  // ── Phase 9: Navigate to a starred item ──
  const handleNavigateToItem = useCallback((_itemId: string) => {
    // Switch to explorer view — the item navigation would require
    // setting the explorer's current folder to the item's parent.
    // For now, we switch to explorer view. A more complete implementation
    // would pass the target itemId to ExplorerRoot.
    setActiveView('explorer')
  }, [])

  // ── Sort toggle ──
  const handleSortChange = (newSortBy: SortBy) => {
    if (sortBy === newSortBy) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(newSortBy)
      setSortDir('asc')
    }
  }

  const isConnected = authStatus === 'connected'

  // Suppress unused var warning — syncError is tracked for future UI usage
  void syncError

  return (
    <div className="h-screen w-full flex bg-g-bg dark:bg-g-bg-dark text-g-text dark:text-g-text-dark overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        authStatus={authStatus}
        syncPhase={syncPhase}
        syncCounts={syncCounts}
        onLogin={handleLogin}
        onStartSync={handleStartSync}
        onStopSync={handleStopSync}
        onTriggerSync={handleTriggerSync}
        onNavigateToItem={handleNavigateToItem}
        syncing={syncing}
      />

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <TopBar
          activeView={activeView}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={handleSortChange}
          isConnected={isConnected}
          userName={userProfile?.userName}
          userEmail={userProfile?.userEmail}
          userPhoto={userProfile?.userPhoto}
          onDisconnect={handleDisconnect}
          onViewChange={setActiveView}
        />

        {/* Content area */}
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 min-w-0 overflow-hidden">
            {!isConnected ? (
              /* Welcome / login prompt */
              <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                <div className="w-20 h-20 bg-g-primary rounded-2xl flex items-center justify-center shadow-xl shadow-g-primary/20 dark:shadow-g-primary-dark/15 mb-6">
                  <HardDrive className="text-white" size={40} />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-g-text dark:text-g-text-dark mb-2">
                  Welcome to <span className="text-g-primary dark:text-g-primary-dark">G</span>-Sync
                </h1>
                <p className="text-g-text-secondary dark:text-g-text-secondary-dark max-w-md mb-6">
                  A modern desktop client for your Google Drive. Connect your account to start syncing and managing files.
                </p>
                {authError && (
                  <div className="mb-4 rounded-lg bg-g-secondary/8 dark:bg-g-secondary-dark/10 border border-g-secondary/20 dark:border-g-secondary-dark/30 px-4 py-2 text-sm text-g-secondary dark:text-g-secondary-dark">
                    {authError}
                  </div>
                )}
                {encryptionWarning && (
                  <div className="mb-4 rounded-lg bg-g-accent/10 dark:bg-g-accent-dark/10 border border-g-accent/20 dark:border-g-accent-dark/30 px-4 py-2 text-sm text-amber-600 dark:text-g-accent-dark">
                    {encryptionWarning}
                  </div>
                )}
                <button
                  onClick={handleLogin}
                  disabled={authStatus === 'connecting'}
                  className="flex items-center gap-3 bg-g-text dark:bg-g-text-dark text-white dark:text-g-bg-dark px-6 py-3 rounded-xl font-semibold hover:bg-g-text/90 dark:hover:bg-g-text-dark/90 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  {authStatus === 'connecting' ? 'Connecting...' : 'Connect Google Drive'}
                </button>
              </div>
            ) : activeView === 'explorer' ? (
              <div className="h-full animate-fade-in">
                <ExplorerRoot
                  connected={isConnected}
                  searchQuery={searchQuery}
                  debouncedQuery={debouncedQuery}
                  viewMode={viewMode}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSelectedItemChange={setSelectedItem}
                  onShareItem={setShareItem}
                />
              </div>
            ) : activeView === 'trash' ? (
              <div className="h-full animate-fade-in">
                <ExplorerRoot
                  connected={isConnected}
                  searchQuery={searchQuery}
                  debouncedQuery={debouncedQuery}
                  viewMode={viewMode}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSelectedItemChange={setSelectedItem}
                  showTrashed
                />
              </div>
            ) : activeView === 'shared' ? (
              <div className="h-full animate-fade-in">
                <ExplorerRoot
                  connected={isConnected}
                  searchQuery={searchQuery}
                  debouncedQuery={debouncedQuery}
                  viewMode={viewMode}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSelectedItemChange={setSelectedItem}
                  onShareItem={setShareItem}
                  showShared
                />
              </div>
            ) : activeView === 'media' ? (
              <div className="h-full animate-fade-in overflow-hidden">
                <PhotosGrid />
              </div>
            ) : activeView === 'smart-tools' ? (
              <div className="h-full animate-fade-in overflow-hidden">
                <CleanupDashboard />
              </div>
            ) : activeView === 'settings' ? (
              <div className="h-full animate-fade-in overflow-auto custom-scrollbar p-6">
                <SettingsPanel />
              </div>
            ) : null}
          </div>

          {/* Details panel */}
          {(activeView === 'explorer' || activeView === 'shared') && selectedItem && (
            <DetailsPanel
              item={selectedItem}
              onClose={() => setSelectedItem(null)}
              onToggleStar={(itemId, starred) => window.gsync.db.updateStarred(itemId, starred)}
              onShare={setShareItem}
            />
          )}
        </div>

        {/* Status bar */}
        <StatusBar
          authStatus={authStatus}
          syncPhase={syncPhase}
          itemsProcessed={itemsProcessed}
          counts={syncCounts}
        />
      </main>


      {/* Share dialog */}
      {shareItem && (
        <ShareDialog item={shareItem} onClose={() => setShareItem(null)} />
      )}

      {/* Patch notes modal — shown once per version after a fresh upgrade */}
      {showPatchNotes && (
        <PatchNotesModal version={appVersion} onDismiss={handleDismissPatchNotes} />
      )}
    </div>
  )
}

export default App
