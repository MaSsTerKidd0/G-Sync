/**
 * Conflict resolution orchestrator for synced folders.
 *
 * Given a conflict row (sync_status='conflict'), applies the user's chosen
 * action by performing the necessary disk + Drive operations and then
 * flipping the DB state through resolveConflict().
 *
 * Why a separate module: the store layer is intentionally pure SQL — it
 * doesn't reach into the filesystem or Drive. This module is the seam where
 * those side effects happen so resolution remains testable in isolation.
 */

import { readFile, writeFile, stat } from 'fs/promises'
import { dirname, basename, join, extname } from 'path'
import { createHash } from 'crypto'
import {
  getSyncedFolder,
  getSyncedFile,
  resolveConflict,
  upsertSyncedFile,
  type ConflictAction
} from '../db/syncedFoldersStore'
import { downloadFileBuffer, getFileMetadata } from '../drive/driveApi'
import { throttledDriveCall } from '../drive/rateLimiter'

/**
 * Build the local conflict-suffix path. Matches the convention Drive itself
 * uses for client-side conflict files: `report.docx` → `report (local conflict).docx`.
 * Multi-extension files (e.g. `archive.tar.gz`) keep the full extension trail.
 */
function buildConflictPath(relativePath: string): string {
  const dir = dirname(relativePath)
  const name = basename(relativePath)
  const ext = extname(name)
  const stem = ext ? name.slice(0, -ext.length) : name
  const conflictName = `${stem} (local conflict)${ext}`
  return dir === '.' ? conflictName : join(dir, conflictName).replace(/\\/g, '/')
}

/**
 * Compute MD5 of a Buffer. Used so we can stamp the freshly-written file's
 * row with an accurate local_hash and avoid a redundant chokidar→hash cycle.
 */
function md5(buffer: Buffer): string {
  return createHash('md5').update(buffer).digest('hex')
}

export interface ResolveConflictArgs {
  folderId: string
  relativePath: string
  action: ConflictAction
}

export interface ResolveConflictResult {
  success: boolean
  error?: string
  /** When action='keep-both', the relative path of the new sibling file. */
  conflictPath?: string
}

/**
 * Apply a conflict resolution. Caller (IPC) should validate that the row
 * actually exists in 'conflict' state before invoking.
 */
export async function applyConflictResolution(
  args: ResolveConflictArgs
): Promise<ResolveConflictResult> {
  const { folderId, relativePath, action } = args

  const folder = getSyncedFolder(folderId)
  if (!folder) return { success: false, error: 'Folder not found' }

  const file = getSyncedFile(folderId, relativePath)
  if (!file) return { success: false, error: 'File not found' }
  if (file.sync_status !== 'conflict') {
    return { success: false, error: `File is not in conflict state (status=${file.sync_status})` }
  }
  if (!file.drive_file_id) {
    return { success: false, error: 'Conflict file has no Drive ID — cannot resolve' }
  }

  const absLocalPath = join(folder.local_path, relativePath)

  try {
    if (action === 'keep-local') {
      // Simple path: flip the row to 'pending' and let the worker upload.
      // Drive keeps prior revisions in its built-in version history so the
      // user hasn't truly lost the remote state.
      resolveConflict(folderId, relativePath, 'keep-local')
      return { success: true }
    }

    if (action === 'keep-remote') {
      // Download remote bytes and overwrite the local file. We re-fetch
      // metadata to pick up the latest mimeType in case it changed since
      // the conflict was first detected.
      const remoteMeta = await throttledDriveCall(() => getFileMetadata(file.drive_file_id!))
      const buffer = await throttledDriveCall(() =>
        downloadFileBuffer(file.drive_file_id!, remoteMeta.mimeType ?? 'application/octet-stream')
      )
      await writeFile(absLocalPath, buffer)

      // Stamp the row so it matches what's now on disk + remote.
      const localStat = await stat(absLocalPath)
      upsertSyncedFile(
        folderId,
        relativePath,
        md5(buffer),
        localStat.mtimeMs,
        localStat.size
      )
      // Now flip out of 'conflict' (upsert above preserves conflict; explicit
      // resolveConflict moves to 'synced').
      resolveConflict(folderId, relativePath, 'keep-remote')
      return { success: true }
    }

    if (action === 'keep-both') {
      // Read the local content first (so the user's edits survive). Then
      // overwrite the original path with remote, and write the saved local
      // content to a sibling path with a "(local conflict)" suffix.
      const localBuffer = await readFile(absLocalPath)

      const remoteMeta = await throttledDriveCall(() => getFileMetadata(file.drive_file_id!))
      const remoteBuffer = await throttledDriveCall(() =>
        downloadFileBuffer(file.drive_file_id!, remoteMeta.mimeType ?? 'application/octet-stream')
      )

      // Original path → remote content → row marked 'synced' (remote wins).
      await writeFile(absLocalPath, remoteBuffer)
      const originalStat = await stat(absLocalPath)
      upsertSyncedFile(
        folderId,
        relativePath,
        md5(remoteBuffer),
        originalStat.mtimeMs,
        originalStat.size
      )
      resolveConflict(folderId, relativePath, 'keep-both')

      // New sibling path → user's local content → row queued as 'pending'.
      const conflictRel = buildConflictPath(relativePath)
      const conflictAbs = join(folder.local_path, conflictRel)
      await writeFile(conflictAbs, localBuffer)
      const conflictStat = await stat(conflictAbs)
      upsertSyncedFile(
        folderId,
        conflictRel,
        md5(localBuffer),
        conflictStat.mtimeMs,
        conflictStat.size
      )

      return { success: true, conflictPath: conflictRel }
    }

    return { success: false, error: `Unknown action: ${action}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
