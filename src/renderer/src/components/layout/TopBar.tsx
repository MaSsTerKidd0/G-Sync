import { Search, LayoutGrid, List, X } from 'lucide-react'
import type { ViewMode, SortBy, SortDir } from '../../types/explorer'

type ActiveView = 'explorer' | 'smart-tools' | 'settings'

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
}

const VIEW_TITLES: Record<ActiveView, string> = {
  explorer: 'My Drive',
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
  onSortChange
}: TopBarProps) {
  return (
    <header className="h-14 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between px-6 shrink-0">
      {activeView === 'explorer' ? (
        <>
          {/* Search bar */}
          <div className="flex-1 max-w-2xl">
            <div className="relative group">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 group-focus-within:text-blue-500 transition-colors"
                size={18}
              />
              <input
                type="text"
                placeholder="Search in Drive..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full bg-gray-100 dark:bg-gray-800 border border-transparent focus:bg-white dark:focus:bg-gray-900 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-500/20 focus:border-blue-500 rounded-xl py-2 pl-10 pr-10 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-all outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
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
                      ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
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
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
              <button
                onClick={() => onViewModeChange('grid')}
                className={`p-1.5 rounded-md transition-all ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600 dark:text-blue-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
                title="Grid View"
              >
                <LayoutGrid size={18} />
              </button>
              <button
                onClick={() => onViewModeChange('list')}
                className={`p-1.5 rounded-md transition-all ${
                  viewMode === 'list'
                    ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600 dark:text-blue-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
                title="List View"
              >
                <List size={18} />
              </button>
            </div>
          </div>
        </>
      ) : (
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {VIEW_TITLES[activeView]}
        </h2>
      )}
    </header>
  )
}
