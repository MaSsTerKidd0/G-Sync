import { getDb } from './database'

export type SyncPhase = 'idle' | 'snapshot' | 'catchup' | 'incremental'

export interface SyncStateRow {
  scope: string
  phase: SyncPhase
  snapshot_started_at_ms: number | null
  snapshot_completed_at_ms: number | null
  start_page_token: string | null
  resume_page_token: string | null
  last_success_at_ms: number | null
  last_error_at_ms: number | null
  last_error_code: string | null
  last_error_message: string | null
}

export function getSyncState(scope: string): SyncStateRow | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM sync_state WHERE scope = ?').get(scope) as SyncStateRow | undefined
  return row ?? null
}

export function ensureSyncState(scope: string): SyncStateRow {
  const db = getDb()
  db.prepare(`
    INSERT OR IGNORE INTO sync_state (scope, phase)
    VALUES (?, 'idle')
  `).run(scope)
  return getSyncState(scope)!
}

export function updateSyncPhase(scope: string, phase: SyncPhase): void {
  const db = getDb()
  db.prepare('UPDATE sync_state SET phase = ? WHERE scope = ?').run(phase, scope)
}

export function updateSnapshotStarted(scope: string, startPageToken: string): void {
  const db = getDb()
  db.prepare(`
    UPDATE sync_state
    SET phase = 'snapshot',
        snapshot_started_at_ms = ?,
        start_page_token = ?,
        resume_page_token = NULL
    WHERE scope = ?
  `).run(Date.now(), startPageToken, scope)
}

export function updateSnapshotResumeToken(scope: string, pageToken: string): void {
  const db = getDb()
  db.prepare(`
    UPDATE sync_state SET resume_page_token = ? WHERE scope = ?
  `).run(pageToken, scope)
}

export function updateSnapshotCompleted(scope: string): void {
  const db = getDb()
  db.prepare(`
    UPDATE sync_state
    SET phase = 'catchup',
        snapshot_completed_at_ms = ?,
        resume_page_token = NULL
    WHERE scope = ?
  `).run(Date.now(), scope)
}

export function updateCatchupToken(scope: string, resumeToken: string): void {
  const db = getDb()
  db.prepare(`
    UPDATE sync_state SET resume_page_token = ? WHERE scope = ?
  `).run(resumeToken, scope)
}

export function updateIncrementalReady(scope: string, newStartPageToken: string): void {
  const db = getDb()
  db.prepare(`
    UPDATE sync_state
    SET phase = 'incremental',
        start_page_token = ?,
        resume_page_token = NULL,
        last_success_at_ms = ?
    WHERE scope = ?
  `).run(newStartPageToken, Date.now(), scope)
}

export function updateSyncSuccess(scope: string, newStartPageToken: string): void {
  const db = getDb()
  db.prepare(`
    UPDATE sync_state
    SET start_page_token = ?,
        resume_page_token = NULL,
        last_success_at_ms = ?,
        last_error_at_ms = NULL,
        last_error_code = NULL,
        last_error_message = NULL
    WHERE scope = ?
  `).run(newStartPageToken, Date.now(), scope)
}

export function updateSyncError(scope: string, code: string, message: string): void {
  const db = getDb()
  db.prepare(`
    UPDATE sync_state
    SET last_error_at_ms = ?,
        last_error_code = ?,
        last_error_message = ?
    WHERE scope = ?
  `).run(Date.now(), code, message, scope)
}

export function resetSyncState(scope: string): void {
  const db = getDb()
  db.prepare('DELETE FROM sync_state WHERE scope = ?').run(scope)
}
