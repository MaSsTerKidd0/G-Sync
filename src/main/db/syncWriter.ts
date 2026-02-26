import type Database from 'better-sqlite3'
import { getDb } from './database'
import type { DriveFile, DriveChange } from '../drive/driveApi'

// ── Helpers ──

function rfc3339ToMs(iso: string | undefined): number | null {
  if (!iso) return null
  const ms = new Date(iso).getTime()
  return isNaN(ms) ? null : ms
}

function boolToInt(v: boolean | undefined): number | null {
  return v === undefined ? null : v ? 1 : 0
}

// ── Prepared statements (cached per-connection) ──

let _stmts: ReturnType<typeof prepareStatements> | null = null

function prepareStatements(db: Database.Database) {
  const upsertItem = db.prepare(`
    INSERT INTO drive_items (
      id, drive_id, name, mime_type, is_folder,
      starred, owned_by_me,
      trashed, explicitly_trashed,
      created_time_ms, modified_time_ms, viewed_by_me_time_ms, shared_with_me_time_ms,
      size_bytes, resource_key,
      md5_checksum, sha256_checksum, sha1_checksum,
      icon_link, has_thumbnail, thumbnail_version,
      shortcut_target_id, shortcut_target_resource_key,
      can_move_within_drive, can_delete, can_trash,
      is_removed, removed_time_ms
    )
    VALUES (
      @id, @drive_id, @name, @mime_type, @is_folder,
      @starred, @owned_by_me,
      @trashed, @explicitly_trashed,
      @created_time_ms, @modified_time_ms, @viewed_by_me_time_ms, @shared_with_me_time_ms,
      @size_bytes, @resource_key,
      @md5_checksum, @sha256_checksum, @sha1_checksum,
      @icon_link, @has_thumbnail, @thumbnail_version,
      @shortcut_target_id, @shortcut_target_resource_key,
      @can_move_within_drive, @can_delete, @can_trash,
      0, NULL
    )
    ON CONFLICT(id) DO UPDATE SET
      drive_id                    = excluded.drive_id,
      name                        = excluded.name,
      mime_type                   = excluded.mime_type,
      is_folder                   = excluded.is_folder,
      starred                     = excluded.starred,
      owned_by_me                 = excluded.owned_by_me,
      trashed                     = excluded.trashed,
      explicitly_trashed          = excluded.explicitly_trashed,
      created_time_ms             = excluded.created_time_ms,
      modified_time_ms            = excluded.modified_time_ms,
      viewed_by_me_time_ms        = excluded.viewed_by_me_time_ms,
      shared_with_me_time_ms      = excluded.shared_with_me_time_ms,
      size_bytes                  = excluded.size_bytes,
      resource_key                = excluded.resource_key,
      md5_checksum                = excluded.md5_checksum,
      sha256_checksum             = excluded.sha256_checksum,
      sha1_checksum               = excluded.sha1_checksum,
      icon_link                   = excluded.icon_link,
      has_thumbnail               = excluded.has_thumbnail,
      thumbnail_version           = excluded.thumbnail_version,
      shortcut_target_id          = excluded.shortcut_target_id,
      shortcut_target_resource_key = excluded.shortcut_target_resource_key,
      can_move_within_drive       = excluded.can_move_within_drive,
      can_delete                  = excluded.can_delete,
      can_trash                   = excluded.can_trash,
      is_removed                  = 0,
      removed_time_ms             = NULL
  `)

  const deleteParents = db.prepare(`DELETE FROM item_parents WHERE child_id = @child_id`)

  const insertParent = db.prepare(`
    INSERT OR IGNORE INTO item_parents (child_id, parent_id, is_primary)
    VALUES (@child_id, @parent_id, 1)
  `)

  const markRemoved = db.prepare(`
    UPDATE drive_items SET is_removed = 1, removed_time_ms = @removed_time_ms
    WHERE id = @id
  `)

  const deleteRemovedParents = db.prepare(`DELETE FROM item_parents WHERE child_id = @child_id`)

  const insertChangeLog = db.prepare(`
    INSERT INTO changes_log (scope, change_type, file_id, drive_id, removed, change_time_ms, applied_at_ms, raw_json)
    VALUES (@scope, @change_type, @file_id, @drive_id, @removed, @change_time_ms, @applied_at_ms, @raw_json)
  `)

  const updateParentCount = db.prepare(`
    UPDATE drive_items SET parent_count = (
      SELECT COUNT(*) FROM item_parents WHERE child_id = @id
    ) WHERE id = @id
  `)

  // Placeholder row for parent IDs that haven't been synced yet.
  // The real upsert will overwrite this when the parent arrives.
  const ensureParentExists = db.prepare(`
    INSERT OR IGNORE INTO drive_items (id, name, mime_type, is_folder)
    VALUES (@id, '[loading...]', 'application/vnd.google-apps.folder', 1)
  `)

  // Phase 5: Fingerprint upsert — maintained atomically during sync
  const upsertFingerprint = db.prepare(`
    INSERT INTO file_fingerprints (file_id, name_norm, size_bytes, mime_type, is_shortcut, shortcut_target_id, updated_at_ms)
    VALUES (@file_id, @name_norm, @size_bytes, @mime_type, @is_shortcut, @shortcut_target_id, @updated_at_ms)
    ON CONFLICT(file_id) DO UPDATE SET
      name_norm          = excluded.name_norm,
      size_bytes         = excluded.size_bytes,
      mime_type          = excluded.mime_type,
      is_shortcut        = excluded.is_shortcut,
      shortcut_target_id = excluded.shortcut_target_id,
      updated_at_ms      = excluded.updated_at_ms
  `)

  // Phase 5: Drive hash upsert — stores checksums from Drive API
  const upsertDriveHash = db.prepare(`
    INSERT INTO file_hashes (file_id, algo, source, digest_hex, computed_at_ms, bytes_hashed)
    VALUES (@file_id, @algo, 'drive', @digest_hex, @computed_at_ms, @bytes_hashed)
    ON CONFLICT(file_id, algo, source) DO UPDATE SET
      digest_hex     = excluded.digest_hex,
      computed_at_ms = excluded.computed_at_ms,
      bytes_hashed   = excluded.bytes_hashed
  `)

  // Phase 5: Remove fingerprint when file is removed
  const deleteFingerprint = db.prepare(`DELETE FROM file_fingerprints WHERE file_id = @file_id`)

  return {
    upsertItem,
    deleteParents,
    insertParent,
    markRemoved,
    deleteRemovedParents,
    insertChangeLog,
    updateParentCount,
    ensureParentExists,
    upsertFingerprint,
    upsertDriveHash,
    deleteFingerprint
  }
}

function getStmts() {
  if (!_stmts) {
    _stmts = prepareStatements(getDb())
  }
  return _stmts
}

export function resetStmts(): void {
  _stmts = null
}

// ── Public write operations ──

/** Normalize a file name for duplicate grouping: trim, collapse whitespace, lowercase */
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

function fileToParams(file: DriveFile) {
  const isFolder = file.mimeType === 'application/vnd.google-apps.folder' ? 1 : 0
  return {
    id: file.id,
    drive_id: file.driveId ?? null,
    name: file.name,
    mime_type: file.mimeType,
    is_folder: isFolder,
    starred: boolToInt(file.starred) ?? 0,
    owned_by_me: boolToInt(file.ownedByMe),
    trashed: boolToInt(file.trashed) ?? 0,
    explicitly_trashed: boolToInt(file.explicitlyTrashed) ?? 0,
    created_time_ms: rfc3339ToMs(file.createdTime),
    modified_time_ms: rfc3339ToMs(file.modifiedTime),
    viewed_by_me_time_ms: rfc3339ToMs(file.viewedByMeTime),
    shared_with_me_time_ms: rfc3339ToMs(file.sharedWithMeTime),
    size_bytes: file.size ? parseInt(file.size, 10) : null,
    resource_key: file.resourceKey ?? null,
    md5_checksum: file.md5Checksum ?? null,
    sha256_checksum: file.sha256Checksum ?? null,
    sha1_checksum: file.sha1Checksum ?? null,
    icon_link: file.iconLink ?? null,
    has_thumbnail: boolToInt(file.hasThumbnail) ?? 0,
    thumbnail_version: file.thumbnailVersion ?? null,
    shortcut_target_id: file.shortcutDetails?.targetId ?? null,
    shortcut_target_resource_key: file.shortcutDetails?.targetResourceKey ?? null,
    can_move_within_drive: boolToInt(file.capabilities?.canMoveItemWithinDrive),
    can_delete: boolToInt(file.capabilities?.canDelete),
    can_trash: boolToInt(file.capabilities?.canTrash)
  }
}

/** Upsert fingerprint + Drive hashes for a file (Phase 5) */
function upsertFingerprintAndHashes(file: DriveFile, stmts: ReturnType<typeof prepareStatements>): void {
  const isFolder = file.mimeType === 'application/vnd.google-apps.folder'
  const isShortcut = file.mimeType === 'application/vnd.google-apps.shortcut'

  // Skip folders — they have no meaningful fingerprint for dedup
  if (isFolder) return

  const now = Date.now()
  const sizeBytes = file.size ? parseInt(file.size, 10) : null

  stmts.upsertFingerprint.run({
    file_id: file.id,
    name_norm: normalizeName(file.name),
    size_bytes: sizeBytes,
    mime_type: file.mimeType,
    is_shortcut: isShortcut ? 1 : 0,
    shortcut_target_id: file.shortcutDetails?.targetId ?? null,
    updated_at_ms: now
  })

  // Persist Drive-provided checksums into file_hashes
  if (file.md5Checksum) {
    stmts.upsertDriveHash.run({
      file_id: file.id,
      algo: 'md5',
      digest_hex: file.md5Checksum,
      computed_at_ms: now,
      bytes_hashed: sizeBytes
    })
  }
  if (file.sha1Checksum) {
    stmts.upsertDriveHash.run({
      file_id: file.id,
      algo: 'sha1',
      digest_hex: file.sha1Checksum,
      computed_at_ms: now,
      bytes_hashed: sizeBytes
    })
  }
  if (file.sha256Checksum) {
    stmts.upsertDriveHash.run({
      file_id: file.id,
      algo: 'sha256',
      digest_hex: file.sha256Checksum,
      computed_at_ms: now,
      bytes_hashed: sizeBytes
    })
  }
}

/**
 * Upsert a batch of files and their parent edges inside a single transaction.
 * Returns number of items processed.
 */
export function upsertFileBatch(files: DriveFile[]): number {
  const db = getDb()
  const stmts = getStmts()

  const run = db.transaction((batch: DriveFile[]) => {
    // Defer FK checks — parents may arrive in a later page than their children
    db.pragma('defer_foreign_keys = ON')

    for (const file of batch) {
      stmts.upsertItem.run(fileToParams(file))

      // Phase 5: maintain fingerprints + hashes atomically with item upsert
      upsertFingerprintAndHashes(file, stmts)

      // Replace parent edges
      stmts.deleteParents.run({ child_id: file.id })
      if (file.parents) {
        for (const parentId of file.parents) {
          // Parent may not exist yet in drive_items (arrives in later page).
          // Create a placeholder row so the FK is satisfied within this txn,
          // which will be overwritten by the real upsert when the parent arrives.
          stmts.ensureParentExists.run({ id: parentId })
          stmts.insertParent.run({ child_id: file.id, parent_id: parentId })
        }
      }
      stmts.updateParentCount.run({ id: file.id })
    }
    return batch.length
  })

  return run(files)
}

/**
 * Apply a batch of Change objects from changes.list.
 * Returns number of changes applied.
 */
export function applyChangesBatch(changes: DriveChange[], scope: string): number {
  const db = getDb()
  const stmts = getStmts()
  const now = Date.now()

  const run = db.transaction((batch: DriveChange[]) => {
    db.pragma('defer_foreign_keys = ON')
    let applied = 0
    for (const change of batch) {
      if (change.changeType !== 'file') continue

      if (change.removed && change.fileId) {
        // Mark removed + clear parent edges + remove fingerprint
        stmts.markRemoved.run({
          id: change.fileId,
          removed_time_ms: rfc3339ToMs(change.time) ?? now
        })
        stmts.deleteRemovedParents.run({ child_id: change.fileId })
        stmts.deleteFingerprint.run({ file_id: change.fileId })
      } else if (change.file) {
        // Upsert file metadata + parent edges
        stmts.upsertItem.run(fileToParams(change.file))
        // Phase 5: maintain fingerprints + hashes atomically
        upsertFingerprintAndHashes(change.file, stmts)
        stmts.deleteParents.run({ child_id: change.file.id })
        if (change.file.parents) {
          for (const parentId of change.file.parents) {
            db.prepare(`
              INSERT OR IGNORE INTO drive_items (id, name, mime_type, is_folder)
              VALUES (?, '[loading...]', 'application/vnd.google-apps.folder', 1)
            `).run(parentId)
            stmts.insertParent.run({ child_id: change.file.id, parent_id: parentId })
          }
        }
        stmts.updateParentCount.run({ id: change.file.id })
      }

      // Log the change
      stmts.insertChangeLog.run({
        scope,
        change_type: change.changeType,
        file_id: change.fileId ?? null,
        drive_id: change.driveId ?? null,
        removed: change.removed ? 1 : 0,
        change_time_ms: rfc3339ToMs(change.time),
        applied_at_ms: now,
        raw_json: null // skip raw JSON to save space
      })

      applied++
    }
    return applied
  })

  return run(changes)
}
