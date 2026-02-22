/**
 * Phase 5: Cleanup query functions.
 *
 * All functions are synchronous (better-sqlite3) and use getDb().
 * They power the Smart Tools dashboard: duplicate grouping, large file
 * finder, storage breakdown, and timeline queries.
 */

import { getDb } from '../db/database'

// ── Result types ──

export interface DuplicateGroup {
  nameNorm: string
  sizeBytes: number
  mimeType: string
  confidence: 'medium' | 'high'
  fileCount: number
  fileIds: string[]
  totalSize: number
}

export interface DuplicateGroupDetail {
  nameNorm: string
  sizeBytes: number
  mimeType: string
  files: Array<{
    id: string
    name: string
    mimeType: string
    sizeBytes: number | null
    modifiedTimeMs: number | null
    parentPath: string
    md5Checksum: string | null
    sha256Checksum: string | null
    canTrash: number | null
    canDelete: number | null
  }>
  confidence: 'medium' | 'high'
}

export interface LargeFileResult {
  files: Array<{
    id: string
    name: string
    mimeType: string
    sizeBytes: number
    modifiedTimeMs: number | null
    parentPath: string
  }>
  totalCount: number
}

export interface StorageCategory {
  category: string
  totalSize: number
  fileCount: number
}

export interface TimelineEntry {
  id: string
  name: string
  mimeType: string
  sizeBytes: number | null
  modifiedTimeMs: number
}

export interface HistogramEntry {
  day: string
  count: number
}

// ── Helpers ──

/** Build a breadcrumb-style parent path for a file */
function getParentPath(fileId: string): string {
  const db = getDb()
  // Get the file's primary parent
  const parentRow = db.prepare(`
    SELECT p.parent_id FROM item_parents p WHERE p.child_id = ? AND p.is_primary = 1 LIMIT 1
  `).get(fileId) as { parent_id: string } | undefined

  if (!parentRow) return '/'

  // Build path by walking up
  const parts: string[] = []
  let currentId: string | undefined = parentRow.parent_id
  let depth = 0
  const maxDepth = 20

  while (currentId && depth < maxDepth) {
    const item = db.prepare(`SELECT id, name FROM drive_items WHERE id = ?`).get(currentId) as
      | { id: string; name: string }
      | undefined
    if (!item || item.name === '[loading...]') break
    parts.unshift(item.name)

    const parent = db.prepare(`
      SELECT parent_id FROM item_parents WHERE child_id = ? AND is_primary = 1 LIMIT 1
    `).get(currentId) as { parent_id: string } | undefined
    currentId = parent?.parent_id
    depth++
  }

  return parts.length > 0 ? '/' + parts.join('/') : '/'
}

// ── Public query functions ──

/**
 * Find groups of potential duplicate files based on (name_norm, size_bytes, mime_type).
 * Joins file_hashes to upgrade confidence to 'high' when checksums match within a group.
 */
export function findDuplicateGroups(args?: {
  minGroupSize?: number
  limit?: number
  offset?: number
}): DuplicateGroup[] {
  const db = getDb()
  const minGroupSize = args?.minGroupSize ?? 2
  const limit = args?.limit ?? 100
  const offset = args?.offset ?? 0

  // Group by normalized name + size + mimeType, excluding shortcuts and folders
  const groups = db.prepare(`
    SELECT
      fp.name_norm,
      fp.size_bytes,
      fp.mime_type,
      COUNT(*) as file_count,
      GROUP_CONCAT(fp.file_id, ',') as file_ids,
      SUM(fp.size_bytes) as total_size
    FROM file_fingerprints fp
    JOIN drive_items di ON di.id = fp.file_id
    WHERE fp.is_shortcut = 0
      AND fp.size_bytes IS NOT NULL
      AND fp.size_bytes > 0
      AND di.trashed = 0
      AND di.is_removed = 0
      AND di.is_folder = 0
    GROUP BY fp.name_norm, fp.size_bytes, fp.mime_type
    HAVING COUNT(*) >= ?
    ORDER BY total_size DESC
    LIMIT ? OFFSET ?
  `).all(minGroupSize, limit, offset) as Array<{
    name_norm: string
    size_bytes: number
    mime_type: string
    file_count: number
    file_ids: string
    total_size: number
  }>

  return groups.map((g) => {
    const fileIds = g.file_ids.split(',')

    // Check if checksums exist and match within this group → high confidence
    let confidence: 'medium' | 'high' = 'medium'
    if (fileIds.length >= 2) {
      const placeholders = fileIds.map(() => '?').join(',')
      const hashes = db.prepare(`
        SELECT file_id, digest_hex FROM file_hashes
        WHERE file_id IN (${placeholders}) AND algo = 'md5'
      `).all(...fileIds) as Array<{ file_id: string; digest_hex: string }>

      if (hashes.length >= 2) {
        // All hashes in this group match → high confidence
        const uniqueDigests = new Set(hashes.map((h) => h.digest_hex))
        if (uniqueDigests.size === 1) {
          confidence = 'high'
        }
      }
    }

    return {
      nameNorm: g.name_norm,
      sizeBytes: g.size_bytes,
      mimeType: g.mime_type,
      confidence,
      fileCount: g.file_count,
      fileIds,
      totalSize: g.total_size
    }
  })
}

/**
 * Get detailed info for all files in a specific duplicate group.
 */
export function getDuplicateGroupDetails(args: {
  nameNorm: string
  sizeBytes: number
  mimeType: string
}): DuplicateGroupDetail {
  const db = getDb()

  const rows = db.prepare(`
    SELECT
      di.id, di.name, di.mime_type, di.size_bytes, di.modified_time_ms,
      di.md5_checksum, di.sha256_checksum, di.can_trash, di.can_delete
    FROM file_fingerprints fp
    JOIN drive_items di ON di.id = fp.file_id
    WHERE fp.name_norm = ? AND fp.size_bytes = ? AND fp.mime_type = ?
      AND di.trashed = 0 AND di.is_removed = 0
    ORDER BY di.modified_time_ms DESC
  `).all(args.nameNorm, args.sizeBytes, args.mimeType) as Array<{
    id: string
    name: string
    mime_type: string
    size_bytes: number | null
    modified_time_ms: number | null
    md5_checksum: string | null
    sha256_checksum: string | null
    can_trash: number | null
    can_delete: number | null
  }>

  // Check confidence
  let confidence: 'medium' | 'high' = 'medium'
  const checksums = rows.filter((r) => r.md5_checksum).map((r) => r.md5_checksum)
  if (checksums.length >= 2 && new Set(checksums).size === 1) {
    confidence = 'high'
  }

  return {
    nameNorm: args.nameNorm,
    sizeBytes: args.sizeBytes,
    mimeType: args.mimeType,
    confidence,
    files: rows.map((r) => ({
      id: r.id,
      name: r.name,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      modifiedTimeMs: r.modified_time_ms,
      parentPath: getParentPath(r.id),
      md5Checksum: r.md5_checksum,
      sha256Checksum: r.sha256_checksum,
      canTrash: r.can_trash,
      canDelete: r.can_delete
    }))
  }
}

/**
 * List files above a size threshold, sorted by size descending.
 */
export function listLargeFiles(args?: {
  minSizeBytes?: number
  limit?: number
  offset?: number
}): LargeFileResult {
  const db = getDb()
  const minSize = args?.minSizeBytes ?? 104_857_600 // 100 MB default
  const limit = args?.limit ?? 100
  const offset = args?.offset ?? 0

  const countRow = db.prepare(`
    SELECT COUNT(*) as cnt FROM drive_items
    WHERE size_bytes >= ?
      AND trashed = 0 AND is_removed = 0
      AND mime_type != 'application/vnd.google-apps.folder'
      AND mime_type != 'application/vnd.google-apps.shortcut'
  `).get(minSize) as { cnt: number }

  const rows = db.prepare(`
    SELECT id, name, mime_type, size_bytes, modified_time_ms
    FROM drive_items
    WHERE size_bytes >= ?
      AND trashed = 0 AND is_removed = 0
      AND mime_type != 'application/vnd.google-apps.folder'
      AND mime_type != 'application/vnd.google-apps.shortcut'
    ORDER BY size_bytes DESC
    LIMIT ? OFFSET ?
  `).all(minSize, limit, offset) as Array<{
    id: string
    name: string
    mime_type: string
    size_bytes: number
    modified_time_ms: number | null
  }>

  return {
    totalCount: countRow.cnt,
    files: rows.map((r) => ({
      id: r.id,
      name: r.name,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      modifiedTimeMs: r.modified_time_ms,
      parentPath: getParentPath(r.id)
    }))
  }
}

/**
 * Aggregate storage by MIME type category.
 */
export function getStorageBreakdown(): StorageCategory[] {
  const db = getDb()

  const rows = db.prepare(`
    SELECT
      CASE
        WHEN mime_type LIKE 'image/%' THEN 'Images'
        WHEN mime_type LIKE 'video/%' THEN 'Videos'
        WHEN mime_type LIKE 'audio/%' THEN 'Audio'
        WHEN mime_type LIKE 'application/pdf'
          OR mime_type LIKE 'application/vnd.google-apps.document'
          OR mime_type LIKE 'application/vnd.google-apps.spreadsheet'
          OR mime_type LIKE 'application/vnd.google-apps.presentation'
          OR mime_type LIKE 'application/vnd.openxmlformats%'
          OR mime_type LIKE 'application/msword%'
          OR mime_type LIKE 'text/%'
          THEN 'Documents'
        WHEN mime_type LIKE 'application/zip'
          OR mime_type LIKE 'application/x-rar%'
          OR mime_type LIKE 'application/x-tar'
          OR mime_type LIKE 'application/gzip'
          OR mime_type LIKE 'application/x-7z%'
          THEN 'Archives'
        WHEN mime_type LIKE 'application/vnd.google-apps.folder' THEN 'Folders'
        ELSE 'Other'
      END as category,
      SUM(COALESCE(size_bytes, 0)) as total_size,
      COUNT(*) as file_count
    FROM drive_items
    WHERE trashed = 0 AND is_removed = 0
    GROUP BY category
    ORDER BY total_size DESC
  `).all() as Array<{ category: string; total_size: number; file_count: number }>

  return rows.map((r) => ({
    category: r.category,
    totalSize: r.total_size,
    fileCount: r.file_count
  }))
}

/**
 * List files ordered by modified_time descending, with optional date range filter.
 */
export function listTimeline(args?: {
  fromMs?: number
  toMs?: number
  limit?: number
  offset?: number
}): TimelineEntry[] {
  const db = getDb()
  const limit = args?.limit ?? 100
  const offset = args?.offset ?? 0
  const fromMs = args?.fromMs ?? 0
  const toMs = args?.toMs ?? Date.now() + 86_400_000

  const rows = db.prepare(`
    SELECT id, name, mime_type, size_bytes, modified_time_ms
    FROM drive_items
    WHERE modified_time_ms >= ? AND modified_time_ms <= ?
      AND trashed = 0 AND is_removed = 0
      AND mime_type != 'application/vnd.google-apps.folder'
    ORDER BY modified_time_ms DESC
    LIMIT ? OFFSET ?
  `).all(fromMs, toMs, limit, offset) as Array<{
    id: string
    name: string
    mime_type: string
    size_bytes: number | null
    modified_time_ms: number
  }>

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    modifiedTimeMs: r.modified_time_ms
  }))
}

/**
 * Group modified items by day for histogram/chart data.
 */
export function getTimelineHistogram(days?: number): HistogramEntry[] {
  const db = getDb()
  const d = days ?? 90
  const cutoffMs = Date.now() - d * 86_400_000

  const rows = db.prepare(`
    SELECT
      strftime('%Y-%m-%d', modified_time_ms / 1000, 'unixepoch') as day,
      COUNT(*) as count
    FROM drive_items
    WHERE modified_time_ms >= ?
      AND trashed = 0 AND is_removed = 0
    GROUP BY day
    ORDER BY day ASC
  `).all(cutoffMs) as Array<{ day: string; count: number }>

  return rows.map((r) => ({
    day: r.day,
    count: r.count
  }))
}
