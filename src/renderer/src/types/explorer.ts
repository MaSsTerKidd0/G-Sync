// ── Phase 3 Explorer Types ──
// These types form the contract between the renderer and the main process.

export type DriveItemType = 'folder' | 'file' | 'shortcut'
export type ViewMode = 'grid' | 'list'
export type SortBy = 'name' | 'modifiedTime' | 'size'
export type SortDir = 'asc' | 'desc'

/**
 * Renderer-facing DTO — mapped from the raw SQLite DriveItemRow.
 */
export interface DriveItemDTO {
  id: string
  name: string
  type: DriveItemType
  mimeType: string
  parentId: string | null

  modifiedTimeMs: number | null
  sizeBytes: number | null

  starred: boolean
  trashed: boolean
  isRemoved: boolean

  canDelete: boolean
  canTrash: boolean

  iconLink?: string | null
  hasThumbnail?: boolean | null
  thumbnailVersion?: string | null
}

/**
 * Explorer query parameters — determines what page to fetch.
 * Used as SWR cache key.
 */
export interface ExplorerQuery {
  parentId: string
  viewMode: ViewMode
  sortBy: SortBy
  sortDir: SortDir
  q?: string
  showTrashed?: boolean
  showShared?: boolean
}

/**
 * Selection state for keyboard + mouse multi-select.
 */
export interface SelectionState {
  anchorId?: string
  focusedId?: string
  selectedIds: Set<string>
}

/**
 * Explorer component props — per the spec.
 */
export interface ExplorerProps {
  query: ExplorerQuery
  selection: SelectionState
  onSelectionChange: (next: SelectionState) => void
  onOpenItem: (id: string) => void
  // Phase 4 integration seam:
  onRequestMove?: (args: { itemIds: string[]; targetFolderId: string }) => void
}

/**
 * Page result from the IPC query.
 */
export interface PageResult {
  items: DriveItemDTO[]
  totalCount: number
  nextCursor?: { sortValue: string | number; id: string }
}

/**
 * Raw DB row returned by the preload bridge.
 */
export interface DriveItemRow {
  id: string
  drive_id: string | null
  name: string
  mime_type: string
  is_folder: number
  parent_count: number
  starred: number
  trashed: number
  size_bytes: number | null
  modified_time_ms: number | null
  icon_link: string | null
  has_thumbnail: number
  thumbnail_version: string | null
  is_removed: number
  can_delete: number | null
  can_trash: number | null
}

/**
 * Map a raw DB row to a renderer-friendly DTO.
 */
export function rowToDTO(row: DriveItemRow): DriveItemDTO {
  const isFolder = row.is_folder === 1
  const isShortcut = row.mime_type === 'application/vnd.google-apps.shortcut'

  return {
    id: row.id,
    name: row.name,
    type: isShortcut ? 'shortcut' : isFolder ? 'folder' : 'file',
    mimeType: row.mime_type,
    parentId: null, // populated by parent context if needed

    modifiedTimeMs: row.modified_time_ms,
    sizeBytes: row.size_bytes,

    starred: row.starred === 1,
    trashed: row.trashed === 1,
    isRemoved: row.is_removed === 1,

    canDelete: row.can_delete === 1,
    canTrash: row.can_trash === 1,

    iconLink: row.icon_link,
    hasThumbnail: row.has_thumbnail === 1,
    thumbnailVersion: row.thumbnail_version
  }
}
