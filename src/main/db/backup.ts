/**
 * Phase 7: Database Backup Module.
 *
 * Uses better-sqlite3's built-in .backup() API which is safe to call
 * on a live WAL-mode database. Manages rolling backups with pruning.
 */

import { getDb } from './database'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, unlinkSync, readdirSync, statSync } from 'fs'

/** Maximum number of backup files to retain */
const MAX_BACKUPS = 3

/** Subdirectory under userData for backups */
const BACKUP_DIR_NAME = 'backups'

function getBackupDir(): string {
  return join(app.getPath('userData'), BACKUP_DIR_NAME)
}

/**
 * Create a backup of the database.
 * Returns the backup file path on success, or throws on error.
 */
export async function createBackup(): Promise<string> {
  const db = getDb()
  const backupDir = getBackupDir()

  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const backupPath = join(backupDir, `gsync-metadata-${timestamp}.db`)

  await db.backup(backupPath)
  console.log('[backup] Database backed up to:', backupPath)

  // Prune old backups beyond the retention limit
  pruneOldBackups(backupDir)

  return backupPath
}

/**
 * Remove old backup files, keeping only the most recent MAX_BACKUPS.
 */
function pruneOldBackups(dir: string): void {
  try {
    const files = readdirSync(dir)
      .filter((f) => f.startsWith('gsync-metadata-') && f.endsWith('.db'))
      .map((f) => ({
        name: f,
        path: join(dir, f),
        mtime: statSync(join(dir, f)).mtimeMs
      }))
      .sort((a, b) => b.mtime - a.mtime) // newest first

    for (const file of files.slice(MAX_BACKUPS)) {
      try {
        unlinkSync(file.path)
        console.log('[backup] Pruned old backup:', file.name)
      } catch {
        // Ignore prune errors — non-critical
      }
    }
  } catch {
    // Ignore errors during pruning
  }
}

/**
 * Get info about existing backups, sorted newest first.
 */
export function listBackups(): Array<{ path: string; sizeBytes: number; createdAt: number }> {
  const backupDir = getBackupDir()
  if (!existsSync(backupDir)) return []

  try {
    return readdirSync(backupDir)
      .filter((f) => f.startsWith('gsync-metadata-') && f.endsWith('.db'))
      .map((f) => {
        const fullPath = join(backupDir, f)
        const stat = statSync(fullPath)
        return { path: fullPath, sizeBytes: stat.size, createdAt: stat.mtimeMs }
      })
      .sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}
