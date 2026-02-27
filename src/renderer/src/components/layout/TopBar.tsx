import { useState, useRef, useCallback } from 'react'
import { Search, LayoutGrid, List, X, CircleUserRound } from 'lucide-react'
import type { ViewMode, SortBy, SortDir } from '../../types/explorer'
import { AccountMenu } from './AccountMenu'

type ActiveView = 'explorer' | 'smart-tools' | 'settings' | 'trash' | 'shared'

interface TopBarProps {
  activeView: ActiveView
  // Explorer-specific props
  searchQuery: string
  onSearchChange: (q: string) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  sortBy: SortBy
  sortDir: SortDir
  onSortChange: (sortBy: SortBy) => void
  // Account props
  isConnected: boolean
  userName?: string
  userEmail?: string
  userPhoto?: string
  onDisconnect: () => void
  onViewChange: (view: ActiveView) => void
}

const VIEW_TITLES: Record<ActiveView, string> = {
  explorer: 'My Drive',
  shared: 'Shared with me',
  trash: 'Trash',
  'smart-tools': 'Smart Tools',
  settings: 'Settings'
}

export default function TopBar({
  activeView,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  sortBy,
  sortDir,
  onSortChange,
  isConnected,
  userName,
  userEmail,
  userPhoto,
  onDisconnect,
  onViewChange
}: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const avatarRef = useRef<HTMLButtonElement>(null)

  const handleToggleMenu = useCallback(() => {
    setMenuOpen((prev) => !prev)
  }, [])

  const handleCloseMenu = useCallback(() => {
    setMenuOpen(false)
  }, [])

  return (
    <header className="h-14 border-b border-g-border dark:border-g-border-dark bg-g-bg dark:bg-g-surface-dark flex items-center justify-between px-6 shrink-0">
      {activeView === 'explorer' ? (
        <>
          {/* Search bar */}
          <div className="flex-1 max-w-2xl">
            <div className="relative group">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-g-text-disabled dark:text-g-text-disabled-dark group-focus-within:text-g-primary transition-colors"
                size={18}
              />
              <input
                type="text"
                placeholder="Search in Drive..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full bg-g-btn-secondary dark:bg-g-btn-secondary-dark border border-transparent focus:bg-g-bg dark:focus:bg-g-surface-dark focus:ring-2 focus:ring-g-primary/15 dark:focus:ring-g-primary-dark/20 focus:border-g-primary rounded-xl py-2 pl-10 pr-10 text-sm text-g-text dark:text-g-text-dark placeholder-g-text-disabled dark:placeholder-g-text-disabled-dark transition-all outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-g-text-disabled hover:text-g-text-secondary dark:hover:text-g-text-secondary-dark"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 ml-4">
            {/* Sort controls */}
            <div className="flex items-center gap-1 text-xs">
              {(['name', 'modifiedTime', 'size'] as SortBy[]).map((s) => (
                <button
                  key={s}
                  onClick={() => onSortChange(s)}
                  className={`px-2 py-1.5 rounded transition ${
                    sortBy === s
                      ? 'bg-g-primary/8 dark:bg-g-primary-dark/10 text-g-primary dark:text-g-primary-dark font-medium'
                      : 'text-g-text-secondary dark:text-g-text-secondary-dark hover:text-g-text dark:hover:text-g-text-dark hover:bg-g-surface dark:hover:bg-g-btn-secondary-dark'
                  }`}
                >
                  {s === 'name' ? 'Name' : s === 'modifiedTime' ? 'Date' : 'Size'}
                  {sortBy === s && (
                    <span className="ml-1">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
                  )}
                </button>
              ))}
            </div>

            {/* View mode toggle */}
            <div className="flex items-center bg-g-btn-secondary dark:bg-g-btn-secondary-dark p-1 rounded-lg">
              <button
                onClick={() => onViewModeChange('grid')}
                className={`p-1.5 rounded-md transition-all ${
                  viewMode === 'grid'
                    ? 'bg-g-bg dark:bg-g-border-dark shadow-sm text-g-primary dark:text-g-primary-dark'
                    : 'text-g-text-secondary dark:text-g-text-secondary-dark hover:text-g-text dark:hover:text-g-text-dark'
                }`}
                title="Grid View"
              >
                <LayoutGrid size={18} />
              </button>
              <button
                onClick={() => onViewModeChange('list')}
                className={`p-1.5 rounded-md transition-all ${
                  viewMode === 'list'
                    ? 'bg-g-bg dark:bg-g-border-dark shadow-sm text-g-primary dark:text-g-primary-dark'
                    : 'text-g-text-secondary dark:text-g-text-secondary-dark hover:text-g-text dark:hover:text-g-text-dark'
                }`}
                title="List View"
              >
                <List size={18} />
              </button>
            </div>

            {/* Account avatar */}
            <div className="ml-1">
              <button
                ref={avatarRef}
                onClick={handleToggleMenu}
                className="flex items-center justify-center w-8 h-8 rounded-full transition-all hover:ring-2 hover:ring-g-primary/20 dark:hover:ring-g-primary-dark/20 focus:ring-2 focus:ring-g-primary/30 dark:focus:ring-g-primary-dark/30 outline-none"
                title={isConnected ? (userEmail ?? 'Account') : 'Not connected'}
              >
                {isConnected && userPhoto ? (
                  <img
                    src={userPhoto}
                    alt=""
                    className="w-8 h-8 rounded-full"
                    referrerPolicy="no-referrer"
                  />
                ) : isConnected && userName ? (
                  <div className="w-8 h-8 rounded-full bg-g-primary/15 dark:bg-g-primary-dark/20 flex items-center justify-center">
                    <span className="text-xs font-semibold text-g-primary dark:text-g-primary-dark">
                      {userName[0]?.toUpperCase() ?? '?'}
                    </span>
                  </div>
                ) : (
                  <CircleUserRound size={24} className="text-g-text-disabled dark:text-g-text-disabled-dark" />
                )}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-lg font-semibold text-g-text dark:text-g-text-dark">
            {VIEW_TITLES[activeView]}
          </h2>

          {/* Account avatar — always visible */}
          <div>
            <button
              ref={avatarRef}
              onClick={handleToggleMenu}
              className="flex items-center justify-center w-8 h-8 rounded-full transition-all hover:ring-2 hover:ring-g-primary/20 dark:hover:ring-g-primary-dark/20 focus:ring-2 focus:ring-g-primary/30 dark:focus:ring-g-primary-dark/30 outline-none"
              title={isConnected ? (userEmail ?? 'Account') : 'Not connected'}
            >
              {isConnected && userPhoto ? (
                <img
                  src={userPhoto}
                  alt=""
                  className="w-8 h-8 rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : isConnected && userName ? (
                <div className="w-8 h-8 rounded-full bg-g-primary/15 dark:bg-g-primary-dark/20 flex items-center justify-center">
                  <span className="text-xs font-semibold text-g-primary dark:text-g-primary-dark">
                    {userName[0]?.toUpperCase() ?? '?'}
                  </span>
                </div>
              ) : (
                <CircleUserRound size={24} className="text-g-text-disabled dark:text-g-text-disabled-dark" />
              )}
            </button>
          </div>
        </>
      )}

      {/* Account popup menu */}
      {menuOpen && isConnected && avatarRef.current && (
        <AccountMenu
          anchorRect={avatarRef.current.getBoundingClientRect()}
          userName={userName ?? ''}
          userEmail={userEmail ?? ''}
          userPhoto={userPhoto}
          onNavigateSettings={() => onViewChange('settings')}
          onDisconnect={onDisconnect}
          onClose={handleCloseMenu}
        />
      )}
    </header>
  )
}
