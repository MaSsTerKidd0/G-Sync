/**
 * Phase 11: Local file watcher using chokidar.
 *
 * Watches synced local folders for file changes (add, modify, delete).
 * Computes MD5 hashes and upserts into synced_files table.
 * Emits events so the sync worker can pick up new work.
 */

import { EventEmitter } from 'events'
import { createHash } from 'crypto'
import { readFile, stat } from 'fs/promises'
import { relative } from 'path'
import { FSWatcher, watch } from 'chokidar'
import {
  upsertSyncedFile,
  markSyncedFileDeleted,
  getSyncedFile
} from '../db/syncedFoldersStore'
import { getIgnoreHiddenFiles } from '../db/settingsStore'

/** Patterns to always ignore */
const ALWAYS_IGNORED = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.DS_Store',
  '**/Thumbs.db',
  '**/*.tmp',
  '**/*.swp',
  '**/*~'
]

interface WatcherEntry {
  folderId: string
  localPath: string
  watcher: FSWatcher
}

export interface FolderWatcherEvents {
  'folder:fileChanged': [{ folderId: string; relativePath: string; event: 'add' | 'change' | 'unlink' }]
  'folder:statusChanged': [{ folderId: string; status: string }]
  'folder:error': [{ folderId: string; error: string }]
}

export class FolderWatcher extends EventEmitter {
  private watchers = new Map<string, WatcherEntry>()
  private debounceTimers = new Map<string, NodeJS.Timeout>()

  /**
   * Start watching a local folder for file changes.
   */
  watchFolder(folderId: string, localPath: string): void {
    // Don't double-watch
    if (this.watchers.has(folderId)) {
      console.warn(`[folderWatcher] Already watching folder ${folderId}`)
      return
    }

    // chokidar v4 only accepts string globs or matcher functions in `ignored`
    const ignored: Array<string | ((path: string) => boolean)> = [...ALWAYS_IGNORED]
    if (getIgnoreHiddenFiles()) {
      // Match dot-files / dot-dirs anywhere in the path (Windows + POSIX separators)
      ignored.push((p: string) => /(^|[/\\])\../.test(p))
    }

    const watcher = watch(localPath, {
      persistent: true,
      ignoreInitial: false, // Emit 'add' for existing files on first scan
      followSymlinks: false,
      depth: 10,
      ignored,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      },
      ignorePermissionErrors: true
    })

    watcher
      .on('add', (filePath) => this.handleFileEvent(folderId, localPath, filePath, 'add'))
      .on('change', (filePath) => this.handleFileEvent(folderId, localPath, filePath, 'change'))
      .on('unlink', (filePath) => this.handleUnlink(folderId, localPath, filePath))
      .on('error', (err) => {
        console.error(`[folderWatcher] Error in ${folderId}:`, err)
        // err is typed `unknown` in chokidar v4 — narrow safely before reading .message
        const message = err instanceof Error ? err.message : String(err)
        this.emit('folder:error', { folderId, error: message })
      })
      .on('ready', () => {
        console.log(`[folderWatcher] Initial scan complete for ${folderId}`)
        this.emit('folder:statusChanged', { folderId, status: 'ready' })
      })

    this.watchers.set(folderId, { folderId, localPath, watcher })
    console.log(`[folderWatcher] Started watching: ${localPath}`)
  }

  /**
   * Stop watching a specific folder.
   */
  async unwatchFolder(folderId: string): Promise<void> {
    const entry = this.watchers.get(folderId)
    if (!entry) return

    await entry.watcher.close()
    this.watchers.delete(folderId)

    // Clear any pending debounce timers for this folder
    for (const [key, timer] of this.debounceTimers) {
      if (key.startsWith(folderId + '|')) {
        clearTimeout(timer)
        this.debounceTimers.delete(key)
      }
    }

    console.log(`[folderWatcher] Stopped watching: ${entry.localPath}`)
  }

  /**
   * Stop all watchers — called during shutdown.
   */
  async unwatchAll(): Promise<void> {
    const promises: Promise<void>[] = []
    for (const folderId of this.watchers.keys()) {
      promises.push(this.unwatchFolder(folderId))
    }
    await Promise.all(promises)
  }

  /**
   * Handle file add/change event with debouncing.
   */
  private handleFileEvent(
    folderId: string,
    localPath: string,
    filePath: string,
    event: 'add' | 'change'
  ): void {
    const relPath = relative(localPath, filePath).replace(/\\/g, '/')
    const debounceKey = `${folderId}|${relPath}`

    // Clear existing debounce timer
    const existing = this.debounceTimers.get(debounceKey)
    if (existing) clearTimeout(existing)

    // Debounce 300ms — avoids rapid-fire from editors doing save-delete-rename
    const timer = setTimeout(async () => {
      this.debounceTimers.delete(debounceKey)
      try {
        const fileStat = await stat(filePath)
        if (!fileStat.isFile()) return // Skip directories

        const hash = await this.computeMD5(filePath)
        const modifiedMs = fileStat.mtimeMs

        // Check if content actually changed (avoid re-uploading same file)
        const existing = getSyncedFile(folderId, relPath)
        if (existing && existing.local_hash === hash && existing.sync_status === 'synced') {
          return // No actual change
        }

        upsertSyncedFile(folderId, relPath, hash, modifiedMs, fileStat.size)

        this.emit('folder:fileChanged', {
          folderId,
          relativePath: relPath,
          event
        })
      } catch (err) {
        console.warn(`[folderWatcher] Error processing ${relPath}:`, err)
      }
    }, 300)

    this.debounceTimers.set(debounceKey, timer)
  }

  /**
   * Handle file deletion.
   */
  private handleUnlink(folderId: string, localPath: string, filePath: string): void {
    const relPath = relative(localPath, filePath).replace(/\\/g, '/')

    try {
      markSyncedFileDeleted(folderId, relPath)
      this.emit('folder:fileChanged', {
        folderId,
        relativePath: relPath,
        event: 'unlink'
      })
    } catch (err) {
      console.warn(`[folderWatcher] Error handling unlink ${relPath}:`, err)
    }
  }

  /**
   * Compute MD5 hash of a file.
   */
  private async computeMD5(filePath: string): Promise<string> {
    const data = await readFile(filePath)
    return createHash('md5').update(data).digest('hex')
  }

  /**
   * Check if any folders are being watched.
   */
  get isWatching(): boolean {
    return this.watchers.size > 0
  }

  /**
   * Get the list of currently watched folder IDs.
   */
  get watchedFolderIds(): string[] {
    return [...this.watchers.keys()]
  }
}

// Singleton instance
export const folderWatcher = new FolderWatcher()
