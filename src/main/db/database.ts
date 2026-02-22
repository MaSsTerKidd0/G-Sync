import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

let db: Database.Database | null = null

const DB_FILENAME = 'gsync-metadata.db'

function getDbPath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, DB_FILENAME)
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized — call initDatabase() first')
  }
  return db
}

export function initDatabase(): Database.Database {
  if (db) return db

  const dbPath = getDbPath()
  console.log('[db] Opening database at:', dbPath)

  db = new Database(dbPath)

  // Performance & reliability PRAGMAs
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.pragma('cache_size = -20000') // 20 MB cache

  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
    console.log('[db] Database closed')
  }
}
