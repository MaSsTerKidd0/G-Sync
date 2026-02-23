import { getDb } from './database'

export interface DriveItemRow {
  id: string
  drive_id: string | null
  name: string
  mime_type: string
  is_folder: number
  parent_count: number
  starred: number
  trashed: number
  explicitly_trashed: number
  created_time_ms: number | null
  modified_time_ms: number | null
  size_bytes: number | null
  resource_key: string | null
  icon_link: string | null
  has_thumbnail: number
  thumbnail_version: string | null
  is_removed: number
}

export interface FolderChildrenResult {
  items: DriveItemRow[]
  totalCount: number
}

// ── Phase 3: Keyset-paginated folder page ──

export type SortBy = 'name' | 'modifiedTime' | 'size'
export type SortDir = 'asc' | 'desc'

export interface PageResult {
  items: DriveItemRow[]
  totalCount: number
  nextCursor?: { sortValue: string | number; id: string }
}

/**
 * Keyset-paginated folder listing per the Phase 3 spec.
 * Uses (sortKey, id) as tiebreaker for stable pagination.
 */
export function listFolderPage(args: {
  parentId: string
  sortBy: SortBy
  sortDir: SortDir
  limit: number
  cursor?: { sortValue: string | number; id: string }
  q?: string
  showTrashed?: boolean
}): PageResult {
  const db = getDb()
  const { parentId, sortBy, sortDir, limit, cursor, q, showTrashed } = args

  // Map sortBy to DB column
  const sortCol =
    sortBy === 'modifiedTime'
      ? 'di.modified_time_ms'
      : sortBy === 'size'
        ? 'di.size_bytes'
        : 'di.name COLLATE NOCASE'

  const sortOp = sortDir === 'asc' ? '>' : '<'
  const sortOrder = sortDir === 'asc' ? 'ASC' : 'DESC'

  const isRoot =
    parentId === 'root' || parentId === '' || parentId === 'my-drive'

  // Build WHERE clauses
  const conditions: string[] = ['di.is_removed = 0']
  const params: (string | number)[] = []

  if (!showTrashed) {
    conditions.push('di.trashed = 0')
  }

  if (isRoot) {
    conditions.push(`(
      NOT EXISTS (SELECT 1 FROM item_parents ip2 WHERE ip2.child_id = di.id)
      OR NOT EXISTS (
        SELECT 1 FROM item_parents ip2
        JOIN drive_items di2 ON di2.id = ip2.parent_id
        WHERE ip2.child_id = di.id AND di2.name != '[loading...]'
      )
    )`)
  } else {
    conditions.push(
      'EXISTS (SELECT 1 FROM item_parents ip WHERE ip.child_id = di.id AND ip.parent_id = ?)'
    )
    params.push(parentId)
  }

  if (q) {
    conditions.push("di.name LIKE '%' || ? || '%' COLLATE NOCASE")
    params.push(q)
  }

  // Keyset cursor
  if (cursor) {
    if (sortBy === 'name') {
      conditions.push(
        `((di.name COLLATE NOCASE ${sortOp} ?) OR (di.name COLLATE NOCASE = ? AND di.id ${sortOp} ?))`
      )
      params.push(String(cursor.sortValue), String(cursor.sortValue), cursor.id)
    } else {
      conditions.push(
        `((${sortCol} ${sortOp} ?) OR (${sortCol} = ? AND di.id ${sortOp} ?))`
      )
      params.push(Number(cursor.sortValue), Number(cursor.sortValue), cursor.id)
    }
  }

  const whereClause = conditions.join(' AND ')

  // Items query
  const itemsSql = `
    SELECT di.*
    FROM drive_items di
    WHERE ${whereClause}
    ORDER BY di.is_folder DESC, ${sortCol} ${sortOrder}, di.id ${sortOrder}
    LIMIT ?
  `
  const items = db.prepare(itemsSql).all(...params, limit) as DriveItemRow[]

  // Count query (without cursor, without limit)
  // Rebuild count without cursor params
  const countParams: (string | number)[] = []
  const countConds: string[] = ['di.is_removed = 0']

  if (!showTrashed) countConds.push('di.trashed = 0')

  if (isRoot) {
    countConds.push(`(
      NOT EXISTS (SELECT 1 FROM item_parents ip2 WHERE ip2.child_id = di.id)
      OR NOT EXISTS (
        SELECT 1 FROM item_parents ip2
        JOIN drive_items di2 ON di2.id = ip2.parent_id
        WHERE ip2.child_id = di.id AND di2.name != '[loading...]'
      )
    )`)
  } else {
    countConds.push(
      'EXISTS (SELECT 1 FROM item_parents ip WHERE ip.child_id = di.id AND ip.parent_id = ?)'
    )
    countParams.push(parentId)
  }

  if (q) {
    countConds.push("di.name LIKE '%' || ? || '%' COLLATE NOCASE")
    countParams.push(q)
  }

  const countSql = `SELECT COUNT(*) as cnt FROM drive_items di WHERE ${countConds.join(' AND ')}`
  const countRow = db.prepare(countSql).get(...countParams) as { cnt: number }

  // Build next cursor from last item
  let nextCursor: PageResult['nextCursor'] = undefined
  if (items.length === limit) {
    const last = items[items.length - 1]!
    const sortValue =
      sortBy === 'modifiedTime'
        ? (last.modified_time_ms ?? 0)
        : sortBy === 'size'
          ? (last.size_bytes ?? 0)
          : last.name
    nextCursor = { sortValue, id: last.id }
  }

  return { items, totalCount: countRow.cnt, nextCursor }
}

/**
 * Get children of a folder, paged. Folders sorted first, then by name.
 */
export function getChildrenOfFolder(
  parentId: string,
  limit = 100,
  offset = 0
): FolderChildrenResult {
  const db = getDb()

  const items = db
    .prepare(
      `
      SELECT di.*
      FROM item_parents ip
      JOIN drive_items di ON di.id = ip.child_id
      WHERE ip.parent_id = ?
        AND di.is_removed = 0
        AND di.trashed = 0
      ORDER BY di.is_folder DESC, di.name COLLATE NOCASE
      LIMIT ? OFFSET ?
    `
    )
    .all(parentId, limit, offset) as DriveItemRow[]

  const countRow = db
    .prepare(
      `
      SELECT COUNT(*) as cnt
      FROM item_parents ip
      JOIN drive_items di ON di.id = ip.child_id
      WHERE ip.parent_id = ?
        AND di.is_removed = 0
        AND di.trashed = 0
    `
    )
    .get(parentId) as { cnt: number }

  return { items, totalCount: countRow.cnt }
}

/**
 * Get root-level items (items with no parent in the DB, or whose parent
 * is the Drive root). For practical purposes, we find items whose parents
 * are not in drive_items (meaning the parent is the root).
 */
export function getRootItems(limit = 100, offset = 0): FolderChildrenResult {
  const db = getDb()

  const items = db
    .prepare(
      `
      SELECT di.*
      FROM drive_items di
      LEFT JOIN item_parents ip ON ip.child_id = di.id
      WHERE di.is_removed = 0
        AND di.trashed = 0
        AND (
          ip.child_id IS NULL
          OR ip.parent_id NOT IN (SELECT id FROM drive_items)
        )
      ORDER BY di.is_folder DESC, di.name COLLATE NOCASE
      LIMIT ? OFFSET ?
    `
    )
    .all(limit, offset) as DriveItemRow[]

  const countRow = db
    .prepare(
      `
      SELECT COUNT(*) as cnt
      FROM drive_items di
      LEFT JOIN item_parents ip ON ip.child_id = di.id
      WHERE di.is_removed = 0
        AND di.trashed = 0
        AND (
          ip.child_id IS NULL
          OR ip.parent_id NOT IN (SELECT id FROM drive_items)
        )
    `
    )
    .get() as { cnt: number }

  return { items, totalCount: countRow.cnt }
}

/**
 * Search files by name (case-insensitive ASCII via COLLATE NOCASE).
 */
export function searchByName(query: string, limit = 200): DriveItemRow[] {
  const db = getDb()
  return db
    .prepare(
      `
      SELECT *
      FROM drive_items
      WHERE is_removed = 0
        AND trashed = 0
        AND name LIKE '%' || ? || '%' COLLATE NOCASE
      ORDER BY is_folder DESC, modified_time_ms DESC
      LIMIT ?
    `
    )
    .all(query, limit) as DriveItemRow[]
}

/**
 * Get recent files sorted by modification time.
 */
export function getRecentFiles(limit = 50): DriveItemRow[] {
  const db = getDb()
  return db
    .prepare(
      `
      SELECT *
      FROM drive_items
      WHERE is_removed = 0
        AND trashed = 0
        AND is_folder = 0
      ORDER BY modified_time_ms DESC
      LIMIT ?
    `
    )
    .all(limit) as DriveItemRow[]
}

/**
 * Get a single item by ID.
 */
export function getItemById(id: string): DriveItemRow | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM drive_items WHERE id = ?').get(id) as
    | DriveItemRow
    | undefined
  return row ?? null
}

/**
 * Get parent chain (breadcrumbs) for an item.
 */
export function getBreadcrumbs(itemId: string): DriveItemRow[] {
  const db = getDb()
  const crumbs: DriveItemRow[] = []
  let currentId: string | null = itemId

  // Walk up to 20 levels to prevent infinite loops
  for (let i = 0; i < 20 && currentId; i++) {
    const parentRow = db
      .prepare(
        `
        SELECT di.*
        FROM item_parents ip
        JOIN drive_items di ON di.id = ip.parent_id
        WHERE ip.child_id = ?
        LIMIT 1
      `
      )
      .get(currentId) as DriveItemRow | undefined

    if (!parentRow) break
    crumbs.unshift(parentRow)
    currentId = parentRow.id
  }

  return crumbs
}

/**
 * Get total counts for the sync stats display.
 */
export function getItemCounts(): { totalFiles: number; totalFolders: number; totalRemoved: number } {
  const db = getDb()
  const row = db
    .prepare(
      `
      SELECT
        SUM(CASE WHEN is_folder = 0 AND is_removed = 0 THEN 1 ELSE 0 END) as totalFiles,
        SUM(CASE WHEN is_folder = 1 AND is_removed = 0 THEN 1 ELSE 0 END) as totalFolders,
        SUM(CASE WHEN is_removed = 1 THEN 1 ELSE 0 END) as totalRemoved
      FROM drive_items
    `
    )
    .get() as { totalFiles: number; totalFolders: number; totalRemoved: number }

  return {
    totalFiles: row.totalFiles ?? 0,
    totalFolders: row.totalFolders ?? 0,
    totalRemoved: row.totalRemoved ?? 0
  }
}

/**
 * Phase 10: Update starred status for a single item.
 */
export function updateStarred(fileId: string, starred: boolean): void {
  const db = getDb()
  db.prepare('UPDATE drive_items SET starred = ? WHERE id = ?').run(starred ? 1 : 0, fileId)
}

/**
 * Phase 9: Get starred items for the sidebar.
 */
export function getStarredItems(limit = 50): DriveItemRow[] {
  const db = getDb()
  return db
    .prepare(
      `
      SELECT *
      FROM drive_items
      WHERE starred = 1
        AND is_removed = 0
        AND trashed = 0
      ORDER BY is_folder DESC, modified_time_ms DESC
      LIMIT ?
    `
    )
    .all(limit) as DriveItemRow[]
}
