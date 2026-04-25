import { useState, useEffect, useCallback } from 'react'
import FileIcon from './FileIcon'

interface DriveItemRow {
  id: string
  name: string
  mime_type: string
  is_folder: number
  modified_time_ms: number | null
  size_bytes: number | null
}

interface FolderChildrenResult {
  items: DriveItemRow[]
  totalCount: number
}

interface FileBrowserProps {
  connected: boolean
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function formatDate(ms: number | null): string {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return '—'
  }
}

export default function FileBrowser({ connected }: FileBrowserProps): React.JSX.Element {
  const [folderStack, setFolderStack] = useState<Array<{ id: string; name: string }>>([])
  const [items, setItems] = useState<DriveItemRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<DriveItemRow[] | null>(null)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 100

  const currentFolderId = folderStack.length > 0 ? folderStack[folderStack.length - 1].id : null

  const loadItems = useCallback(async () => {
    if (!connected) return
    setLoading(true)
    try {
      let result: FolderChildrenResult
      if (currentFolderId) {
        result = await window.gsync.db.children(currentFolderId, PAGE_SIZE, page * PAGE_SIZE)
      } else {
        result = await window.gsync.db.rootItems(PAGE_SIZE, page * PAGE_SIZE)
      }
      setItems(result.items)
      setTotalCount(result.totalCount)
    } catch {
      setItems([])
      setTotalCount(0)
    } finally {
      setLoading(false)
    }
  }, [connected, currentFolderId, page])

  useEffect(() => {
    if (searchQuery) return // Don't load folder items when searching
    loadItems()
  }, [loadItems, searchQuery])

  // Listen for sync progress to auto-refresh
  useEffect(() => {
    if (!connected) return
    const unsub = window.gsync.sync.onProgress(() => {
      if (!searchQuery) loadItems()
    })
    return unsub
  }, [connected, loadItems, searchQuery])

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null)
      return
    }
    setLoading(true)
    try {
      const results = await window.gsync.db.search(searchQuery.trim(), 200)
      setSearchResults(results)
    } catch {
      setSearchResults([])
    } finally {
      setLoading(false)
    }
  }, [searchQuery])

  useEffect(() => {
    const timer = setTimeout(handleSearch, 300) // Debounce
    return () => clearTimeout(timer)
  }, [handleSearch])

  const navigateToFolder = (item: DriveItemRow): void => {
    if (!item.is_folder) return
    setFolderStack((prev) => [...prev, { id: item.id, name: item.name }])
    setPage(0)
    setSearchQuery('')
    setSearchResults(null)
  }

  const navigateUp = (): void => {
    setFolderStack((prev) => prev.slice(0, -1))
    setPage(0)
  }

  const navigateToBreadcrumb = (index: number): void => {
    setFolderStack((prev) => prev.slice(0, index + 1))
    setPage(0)
  }

  const navigateToRoot = (): void => {
    setFolderStack([])
    setPage(0)
    setSearchQuery('')
    setSearchResults(null)
  }

  if (!connected) return <></>

  const displayItems = searchResults ?? items
  const totalPages = searchResults ? 1 : Math.ceil(totalCount / PAGE_SIZE)

  return (
    <div>
      {/* Search bar */}
      <div className="mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search files..."
          className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-2 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500 transition"
        />
      </div>

      {/* Breadcrumbs */}
      {!searchResults && (
        <div className="mb-3 flex items-center gap-1 text-xs text-gray-500">
          <button
            onClick={navigateToRoot}
            className="hover:text-gray-300 transition"
          >
            My Drive
          </button>
          {folderStack.map((folder, i) => (
            <span key={folder.id} className="flex items-center gap-1">
              <span>/</span>
              <button
                onClick={() => navigateToBreadcrumb(i)}
                className="hover:text-gray-300 transition max-w-[150px] truncate"
              >
                {folder.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {searchResults && (
        <div className="mb-3 text-xs text-gray-500">
          {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
        </div>
      )}

      {/* File list */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading...
        </div>
      ) : displayItems.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {searchResults !== null ? 'No results found.' : 'No files synced yet. Start a sync to populate your file browser.'}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-700">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-800/70 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Modified</th>
                  <th className="px-4 py-3 text-right">Size</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {!searchResults && folderStack.length > 0 && (
                  <tr
                    onClick={navigateUp}
                    className="hover:bg-gray-800/30 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 font-medium text-gray-400" colSpan={3}>
                      <span className="mr-2">{'\u2B06\uFE0F'}</span>
                      ..
                    </td>
                  </tr>
                )}
                {displayItems.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => item.is_folder && navigateToFolder(item)}
                    className={`hover:bg-gray-800/30 transition-colors ${item.is_folder ? 'cursor-pointer' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-200">
                      <FileIcon
                        mimeType={item.mime_type}
                        type={item.is_folder ? 'folder' : 'file'}
                        size={18}
                        className="mr-2 inline-block align-text-bottom"
                      />
                      {item.name}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {formatDate(item.modified_time_ms)}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-right">
                      {item.is_folder ? '—' : formatBytes(item.size_bytes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!searchResults && totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
              <span>
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of{' '}
                {totalCount.toLocaleString()}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded px-2 py-1 border border-gray-700 hover:bg-gray-800 disabled:opacity-30 transition"
                >
                  Prev
                </button>
                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded px-2 py-1 border border-gray-700 hover:bg-gray-800 disabled:opacity-30 transition"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
