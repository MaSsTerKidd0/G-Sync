/**
 * Phase 11: Folder Sync Worker — uploads local files to Google Drive.
 *
 * Processes synced_files with sync_status = 'pending'.
 * Creates Drive folders as needed, uploads via multipart, detects conflicts.
 */

import { EventEmitter } from 'events'
import { readFile } from 'fs/promises'
import { join } from 'path'
import {
  createDriveFolder,
  uploadFile,
  updateFileContent,
  getFileMetadata,
  type DriveFile
} from '../drive/driveApi'
import { throttledDriveCall } from '../drive/rateLimiter'
import {
  getSyncedFolder,
  updateFolderStatus,
  updateFolderDriveInfo,
  listPendingFiles,
  updateSyncedFileAfterUpload,
  markSyncedFileError,
  markSyncedFileConflict,
  type SyncedFile,
  type SyncedFolder
} from '../db/syncedFoldersStore'

export interface FolderSyncProgress {
  folderId: string
  current: number
  total: number
  fileName: string
}

export class FolderSyncWorker extends EventEmitter {
  private _syncingFolders = new Set<string>()

  /**
   * Sync a folder: ensure Drive folder exists, then upload all pending files.
   */
  async syncFolder(folderId: string): Promise<void> {
    // Prevent concurrent syncs of the same folder
    if (this._syncingFolders.has(folderId)) {
      console.warn(`[folderSync] Already syncing folder ${folderId}`)
      return
    }

    this._syncingFolders.add(folderId)

    try {
      const folder = getSyncedFolder(folderId)
      if (!folder) {
        console.error(`[folderSync] Folder ${folderId} not found`)
        return
      }

      updateFolderStatus(folderId, 'syncing')
      this.emit('folder:statusChanged', { folderId, status: 'syncing' })

      // Step 1: Ensure Drive folder exists
      let driveFolderId = folder.drive_folder_id
      if (!driveFolderId) {
        driveFolderId = await this.ensureDriveFolder(folder)
      }

      if (!driveFolderId) {
        updateFolderStatus(folderId, 'error', 'Failed to create Drive folder')
        this.emit('folder:statusChanged', { folderId, status: 'error' })
        return
      }

      // Step 2: Process pending files
      const pendingFiles = listPendingFiles(folderId)
      const total = pendingFiles.length

      if (total === 0) {
        updateFolderStatus(folderId, 'synced')
        this.emit('folder:statusChanged', { folderId, status: 'synced' })
        return
      }

      let current = 0
      for (const file of pendingFiles) {
        current++
        const fileName = file.relative_path.split('/').pop() ?? file.relative_path

        this.emit('folder:syncProgress', {
          folderId,
          current,
          total,
          fileName
        } satisfies FolderSyncProgress)

        try {
          await this.syncSingleFile(file, folder.local_path, driveFolderId)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.error(`[folderSync] Error syncing ${file.relative_path}:`, message)
          markSyncedFileError(folderId, file.relative_path, message)
        }
      }

      // Determine final status
      const remaining = listPendingFiles(folderId)
      if (remaining.length === 0) {
        updateFolderStatus(folderId, 'synced')
        this.emit('folder:statusChanged', { folderId, status: 'synced' })
      } else {
        updateFolderStatus(folderId, 'error', `${remaining.length} files failed to sync`)
        this.emit('folder:statusChanged', { folderId, status: 'error' })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[folderSync] Fatal error syncing folder ${folderId}:`, message)
      updateFolderStatus(folderId, 'error', message)
      this.emit('folder:statusChanged', { folderId, status: 'error' })
    } finally {
      this._syncingFolders.delete(folderId)
    }
  }

  /**
   * Ensure the Google Drive folder exists; create it if necessary.
   */
  private async ensureDriveFolder(folder: SyncedFolder): Promise<string | null> {
    try {
      // Use the local folder's basename as the Drive folder name
      const folderName = folder.local_path.replace(/\\/g, '/').split('/').filter(Boolean).pop()
        ?? 'G-Sync Folder'

      const driveFolder = await throttledDriveCall(() =>
        createDriveFolder(folderName)
      )

      updateFolderDriveInfo(folder.id, driveFolder.id, driveFolder.name)
      console.log(`[folderSync] Created Drive folder: ${driveFolder.name} (${driveFolder.id})`)
      return driveFolder.id
    } catch (err) {
      console.error('[folderSync] Failed to create Drive folder:', err)
      return null
    }
  }

  /**
   * Sync a single file to Google Drive.
   */
  private async syncSingleFile(
    file: SyncedFile,
    localBasePath: string,
    driveFolderId: string
  ): Promise<void> {
    const localFilePath = join(localBasePath, file.relative_path)

    // Read local file
    let buffer: Buffer
    try {
      buffer = await readFile(localFilePath)
    } catch (err) {
      // File may have been deleted between queuing and syncing
      console.warn(`[folderSync] Cannot read ${file.relative_path}:`, err)
      markSyncedFileError(file.folder_id, file.relative_path, 'File not readable')
      return
    }

    // Determine MIME type
    const mimeType = guessMimeType(file.relative_path)

    if (file.drive_file_id) {
      // File already exists on Drive — check for conflicts
      try {
        const remote = await throttledDriveCall(() =>
          getFileMetadata(file.drive_file_id!)
        )

        const remoteModifiedMs = remote.modifiedTime
          ? new Date(remote.modifiedTime).getTime()
          : 0

        // Conflict: remote was modified after our last known sync
        if (file.drive_modified_ms && remoteModifiedMs > file.drive_modified_ms) {
          console.warn(`[folderSync] Conflict detected for ${file.relative_path}`)
          markSyncedFileConflict(file.folder_id, file.relative_path)
          return
        }
      } catch {
        // If we can't fetch metadata (e.g., 404), treat as new upload
      }

      // Update existing file
      const updated = await throttledDriveCall(() =>
        updateFileContent({
          fileId: file.drive_file_id!,
          mimeType,
          buffer
        })
      )

      const modifiedMs = updated.modifiedTime
        ? new Date(updated.modifiedTime).getTime()
        : Date.now()

      updateSyncedFileAfterUpload(
        file.folder_id,
        file.relative_path,
        updated.id,
        modifiedMs,
        updated.md5Checksum ?? null
      )
    } else {
      // New file — upload to Drive
      const fileName = file.relative_path.split('/').pop() ?? file.relative_path

      const created = await throttledDriveCall(() =>
        uploadFile({
          name: fileName,
          parentId: driveFolderId,
          mimeType,
          buffer
        })
      )

      const modifiedMs = created.modifiedTime
        ? new Date(created.modifiedTime).getTime()
        : Date.now()

      updateSyncedFileAfterUpload(
        file.folder_id,
        file.relative_path,
        created.id,
        modifiedMs,
        created.md5Checksum ?? null
      )
    }
  }

  /**
   * Check if a folder is currently being synced.
   */
  isSyncing(folderId: string): boolean {
    return this._syncingFolders.has(folderId)
  }
}

/**
 * Simple MIME type guesser based on file extension.
 */
function guessMimeType(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop() ?? ''
  const map: Record<string, string> = {
    // Documents
    txt: 'text/plain',
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    ts: 'application/typescript',
    json: 'application/json',
    xml: 'application/xml',
    csv: 'text/csv',
    md: 'text/markdown',
    pdf: 'application/pdf',
    // Office
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Images
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    ico: 'image/x-icon',
    // Audio/Video
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    mp4: 'video/mp4',
    webm: 'video/webm',
    // Archives
    zip: 'application/zip',
    gz: 'application/gzip',
    tar: 'application/x-tar',
    rar: 'application/vnd.rar',
    '7z': 'application/x-7z-compressed'
  }
  return map[ext] ?? 'application/octet-stream'
}

// Singleton instance
export const folderSyncWorker = new FolderSyncWorker()
