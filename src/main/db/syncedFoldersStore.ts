/**
 * Phase 11: Synced Folders Store — CRUD + queries for synced_folders and synced_files tables.
 */

import { randomUUID } from 'crypto'
import { getDb } from './database'

// ── Types ──

export interface SyncedFolder {
  id: string
  local_path: string
  drive_folder_id: string | null
  drive_folder_name: string | null
  status: 'idle' | 'syncing' | 'synced' | 'error'
  last_sync_ms: number | null
  last_error: string | null
  created_at_ms: number
}

export interface SyncedFile {
  id: string
  folder_id: string
  relative_path: string
  local_hash: string | null
  local_modified_ms: number | null
  local_size_bytes: number | null
  drive_file_id: string | null
  drive_modified_ms: number | null
  drive_hash: string | null
  sync_status: 'pending' | 'synced' | 'conflict' | 'error' | 'deleted'
  last_error: string | null
}

// ── Folder CRUD ──

export function addSyncedFolder(localPath: string): SyncedFolder {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()

  db.prepare(`
    INSERT INTO synced_folders (id, local_path, status, created_at_ms)
    VALUES (?, ?, 'idle', ?)
  `).run(id, localPath, now)

  return {
    id,
    local_path: localPath,
    drive_folder_id: null,
    drive_folder_name: null,
    status: 'idle',
    last_sync_ms: null,
    last_error: null,
    created_at_ms: now
  }
}

export function removeSyncedFolder(id: string): void {
  const db = getDb()
  // CASCADE deletes synced_files rows automatically
  db.prepare('DELETE FROM synced_folders WHERE id = ?').run(id)
}

export function listSyncedFolders(): SyncedFolder[] {
  const db = getDb()
  return db.prepare('SELECT * FROM synced_folders ORDER BY created_at_ms ASC').all() as SyncedFolder[]
}

export function getSyncedFolder(id: string): SyncedFolder | null {
  const db = getDb()
  return (db.prepare('SELECT * FROM synced_folders WHERE id = ?').get(id) as SyncedFolder) ?? null
}

export function updateFolderStatus(
  id: string,
  status: SyncedFolder['status'],
  lastError?: string | null
): void {
  const db = getDb()
  const now = Date.now()
  if (lastError !== undefined) {
    db.prepare(
      'UPDATE synced_folders SET status = ?, last_error = ?, last_sync_ms = ? WHERE id = ?'
    ).run(status, lastError, now, id)
  } else {
    db.prepare(
      'UPDATE synced_folders SET status = ?, last_sync_ms = ? WHERE id = ?'
    ).run(status, now, id)
  }
}

export function updateFolderDriveInfo(
  id: string,
  driveFolderId: string,
  driveFolderName: string
): void {
  const db = getDb()
  db.prepare(
    'UPDATE synced_folders SET drive_folder_id = ?, drive_folder_name = ? WHERE id = ?'
  ).run(driveFolderId, driveFolderName, id)
}

// ── File CRUD ──

export function upsertSyncedFile(
  folderId: string,
  relativePath: string,
  localHash: string | null,
  localModifiedMs: number | null,
  localSizeBytes: number | null
): void {
  const db = getDb()
  const id = randomUUID()
  db.prepare(`
    INSERT INTO synced_files (id, folder_id, relative_path, local_hash, local_modified_ms, local_size_bytes, sync_status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
    ON CONFLICT(folder_id, relative_path) DO UPDATE SET
      local_hash = excluded.local_hash,
      local_modified_ms = excluded.local_modified_ms,
      local_size_bytes = excluded.local_size_bytes,
      sync_status = CASE
        WHEN synced_files.drive_file_id IS NOT NULL AND synced_files.local_hash != excluded.local_hash
        THEN 'pending'
        ELSE 'pending'
      END,
      last_error = NULL
  `).run(id, folderId, relativePath, localHash, localModifiedMs, localSizeBytes)
}

export function getSyncedFile(folderId: string, relativePath: string): SyncedFile | null {
  const db = getDb()
  return (
    db.prepare('SELECT * FROM synced_files WHERE folder_id = ? AND relative_path = ?')
      .get(folderId, relativePath) as SyncedFile
  ) ?? null
}

export function updateSyncedFileAfterUpload(
  folderId: string,
  relativePath: string,
  driveFileId: string,
  driveModifiedMs: number,
  driveHash: string | null
): void {
  const db = getDb()
  db.prepare(`
    UPDATE synced_files
    SET drive_file_id = ?, drive_modified_ms = ?, drive_hash = ?, sync_status = 'synced', last_error = NULL
    WHERE folder_id = ? AND relative_path = ?
  `).run(driveFileId, driveModifiedMs, driveHash, folderId, relativePath)
}

export function markSyncedFileError(
  folderId: string,
  relativePath: string,
  error: string
): void {
  const db = getDb()
  db.prepare(`
    UPDATE synced_files SET sync_status = 'error', last_error = ?
    WHERE folder_id = ? AND relative_path = ?
  `).run(error, folderId, relativePath)
}

export function markSyncedFileConflict(
  folderId: string,
  relativePath: string
): void {
  const db = getDb()
  db.prepare(`
    UPDATE synced_files SET sync_status = 'conflict'
    WHERE folder_id = ? AND relative_path = ?
  `).run(folderId, relativePath)
}

export function markSyncedFileDeleted(
  folderId: string,
  relativePath: string
): void {
  const db = getDb()
  db.prepare(`
    UPDATE synced_files SET sync_status = 'deleted'
    WHERE folder_id = ? AND relative_path = ?
  `).run(folderId, relativePath)
}

export function deleteSyncedFile(folderId: string, relativePath: string): void {
  const db = getDb()
  db.prepare('DELETE FROM synced_files WHERE folder_id = ? AND relative_path = ?').run(folderId, relativePath)
}

export function listPendingFiles(folderId: string): SyncedFile[] {
  const db = getDb()
  return db.prepare(
    "SELECT * FROM synced_files WHERE folder_id = ? AND sync_status = 'pending' ORDER BY relative_path"
  ).all(folderId) as SyncedFile[]
}

export function listConflictFiles(folderId: string): SyncedFile[] {
  const db = getDb()
  return db.prepare(
    "SELECT * FROM synced_files WHERE folder_id = ? AND sync_status = 'conflict' ORDER BY relative_path"
  ).all(folderId) as SyncedFile[]
}

export function countFilesByStatus(folderId: string): Record<string, number> {
  const db = getDb()
  const rows = db.prepare(
    'SELECT sync_status, COUNT(*) as count FROM synced_files WHERE folder_id = ? GROUP BY sync_status'
  ).all(folderId) as Array<{ sync_status: string; count: number }>
  const result: Record<string, number> = {}
  for (const row of rows) {
    result[row.sync_status] = row.count
  }
  return result
}
