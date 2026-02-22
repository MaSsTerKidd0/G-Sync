/**
 * Phase 9: Settings key-value store backed by the `settings` SQLite table.
 *
 * Provides typed access to user preferences such as polling interval,
 * notification toggles, and the keep-signed-in flag.
 */

import { getDb } from './database'

// Default values — used when the key is missing from the DB
const DEFAULTS: Record<string, string> = {
  polling_interval_ms: '30000',
  keep_signed_in: 'true',
  ignore_hidden_files: 'false',
  notify_on_sync_complete: 'true'
}

export function getSetting(key: string): string | null {
  const db = getDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? DEFAULTS[key] ?? null
}

export function setSetting(key: string, value: string): void {
  const db = getDb()
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}

export function getAllSettings(): Record<string, string> {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{
    key: string
    value: string
  }>
  const result: Record<string, string> = { ...DEFAULTS }
  for (const row of rows) {
    result[row.key] = row.value
  }
  return result
}

// ── Typed convenience helpers ──

export function getPollingIntervalMs(): number {
  return parseInt(getSetting('polling_interval_ms') ?? '30000', 10)
}

export function getKeepSignedIn(): boolean {
  return getSetting('keep_signed_in') !== 'false'
}

export function getIgnoreHiddenFiles(): boolean {
  return getSetting('ignore_hidden_files') === 'true'
}

export function getNotifyOnSyncComplete(): boolean {
  return getSetting('notify_on_sync_complete') !== 'false'
}
