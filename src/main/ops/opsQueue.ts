/**
 * Phase 4: Durable Operations Queue (opsQueue)
 *
 * Core of the optimistic UI model. Every user action (move, rename, trash, delete)
 * is stored as a durable command in SQLite. The operation + its optimistic local
 * edit are committed in the SAME transaction, guaranteeing atomic all-or-nothing.
 *
 * Nomenclature:
 * - op_type: move | rename | trash | untrash | delete
 * - status: pending | in_flight | succeeded | failed | rolled_back | needs_user
 */

import { randomUUID } from 'crypto'
import { getDb } from '../db/database'

// ── Types ──

export type OpType = 'move' | 'rename' | 'trash' | 'untrash' | 'delete'

export type OpStatus =
  | 'pending'
  | 'in_flight'
  | 'succeeded'
  | 'failed'
  | 'rolled_back'
  | 'needs_user'

export interface OpRecord {
  opId: string
  createdAtMs: number
  updatedAtMs: number
  userSeq: number
  batchId: string | null
  opType: OpType
  fileId: string
  requestJson: string
  optimisticJson: string
  rollbackJson: string
  status: OpStatus
  lockedBy: string | null
  lockExpiresAtMs: number | null
  attemptCount: number
  nextRetryAtMs: number
  lastErrorCode: string | null
  lastErrorMessage: string | null
  remoteHttpStatus: number | null
  remoteResponseJson: string | null
}

export interface EnqueueMoveArgs {
  fileIds: string[]
  fromParentId: string | null
  toParentId: string
}

export interface EnqueueRenameArgs {
  fileId: string
  newName: string
}

export interface EnqueueTrashArgs {
  fileIds: string[]
  trashed: boolean // true=trash, false=untrash
}

export interface EnqueueDeleteArgs {
  fileIds: string[]
}

// ── Monotonic sequence counter ──
// Each device has a single monotonically increasing counter for ordering ops.
let _userSeq = 0

function nextUserSeq(): number {
  return ++_userSeq
}

/** Initialize userSeq from the max in the database on startup */
export function initUserSeq(): void {
  const db = getDb()
  const row = db.prepare('SELECT MAX(user_seq) as maxSeq FROM pending_ops').get() as
    | { maxSeq: number | null }
    | undefined
  _userSeq = row?.maxSeq ?? 0
}

// ── Core Enqueue Functions ──

/**
 * Enqueue a move operation for each file.
 * Atomic: inserts pending_op + optimistic parent swap in one SQLite transaction.
 */
export function enqueueMove(args: EnqueueMoveArgs): { opIds: string[] } {
  const db = getDb()
  const now = Date.now()
  const batchId = args.fileIds.length > 1 ? randomUUID() : null
  const opIds: string[] = []

  const run = db.transaction(() => {
    for (const fileId of args.fileIds) {
      const opId = randomUUID()
      const seq = nextUserSeq()

      // Capture current parent(s) for rollback
      const currentParents = db
        .prepare('SELECT parent_id FROM item_parents WHERE child_id = ?')
        .all(fileId) as { parent_id: string }[]

      const requestJson = JSON.stringify({
        method: 'files.update',
        fileId,
        addParents: args.toParentId,
        removeParents: args.fromParentId
      })

      const optimisticJson = JSON.stringify({
        type: 'move',
        fileId,
        newParentId: args.toParentId,
        removedParentId: args.fromParentId
      })

      const rollbackJson = JSON.stringify({
        type: 'move',
        fileId,
        previousParents: currentParents.map((p) => p.parent_id)
      })

      // 1) Insert pending op
      db.prepare(`
        INSERT INTO pending_ops (
          op_id, created_at_ms, updated_at_ms, user_seq, batch_id,
          op_type, file_id, request_json, optimistic_json, rollback_json,
          status, next_retry_at_ms
        ) VALUES (
          ?, ?, ?, ?, ?,
          'move', ?, ?, ?, ?,
          'pending', 0
        )
      `).run(opId, now, now, seq, batchId, fileId, requestJson, optimisticJson, rollbackJson)

      // 2) Optimistic local move: delete old parent, insert new parent
      if (args.fromParentId) {
        db.prepare('DELETE FROM item_parents WHERE child_id = ? AND parent_id = ?').run(
          fileId,
          args.fromParentId
        )
      }

      // Ensure target folder exists in drive_items (may be placeholder)
      db.prepare(`
        INSERT OR IGNORE INTO drive_items (id, name, mime_type, is_folder)
        VALUES (?, '[loading...]', 'application/vnd.google-apps.folder', 1)
      `).run(args.toParentId)

      db.prepare('INSERT OR IGNORE INTO item_parents (child_id, parent_id, is_primary) VALUES (?, ?, 1)').run(
        fileId,
        args.toParentId
      )

      // 3) Mark item as dirty
      db.prepare(
        'UPDATE drive_items SET local_dirty = 1, pending_op_id = ?, last_local_change_ms = ?, parent_count = (SELECT COUNT(*) FROM item_parents WHERE child_id = ?) WHERE id = ?'
      ).run(opId, now, fileId, fileId)

      opIds.push(opId)
    }
  })

  run()
  return { opIds }
}

/**
 * Enqueue a rename operation.
 */
export function enqueueRename(args: EnqueueRenameArgs): { opId: string } {
  const db = getDb()
  const now = Date.now()
  const opId = randomUUID()
  const seq = nextUserSeq()

  const run = db.transaction(() => {
    // Capture current name for rollback
    const item = db.prepare('SELECT name FROM drive_items WHERE id = ?').get(args.fileId) as
      | { name: string }
      | undefined
    const previousName = item?.name ?? ''

    const requestJson = JSON.stringify({
      method: 'files.update',
      fileId: args.fileId,
      body: { name: args.newName }
    })

    const optimisticJson = JSON.stringify({
      type: 'rename',
      fileId: args.fileId,
      newName: args.newName
    })

    const rollbackJson = JSON.stringify({
      type: 'rename',
      fileId: args.fileId,
      previousName
    })

    // 1) Insert pending op
    db.prepare(`
      INSERT INTO pending_ops (
        op_id, created_at_ms, updated_at_ms, user_seq, batch_id,
        op_type, file_id, request_json, optimistic_json, rollback_json,
        status, next_retry_at_ms
      ) VALUES (
        ?, ?, ?, ?, NULL,
        'rename', ?, ?, ?, ?,
        'pending', 0
      )
    `).run(opId, now, now, seq, args.fileId, requestJson, optimisticJson, rollbackJson)

    // 2) Optimistic local rename
    db.prepare('UPDATE drive_items SET name = ? WHERE id = ?').run(args.newName, args.fileId)

    // 3) Mark dirty
    db.prepare(
      'UPDATE drive_items SET local_dirty = 1, pending_op_id = ?, last_local_change_ms = ? WHERE id = ?'
    ).run(opId, now, args.fileId)
  })

  run()
  return { opId }
}

/**
 * Enqueue trash/untrash operations for files.
 */
export function enqueueTrash(args: EnqueueTrashArgs): { opIds: string[] } {
  const db = getDb()
  const now = Date.now()
  const opType: OpType = args.trashed ? 'trash' : 'untrash'
  const batchId = args.fileIds.length > 1 ? randomUUID() : null
  const opIds: string[] = []

  const run = db.transaction(() => {
    for (const fileId of args.fileIds) {
      const opId = randomUUID()
      const seq = nextUserSeq()

      // Capture current trashed state for rollback
      const item = db.prepare('SELECT trashed FROM drive_items WHERE id = ?').get(fileId) as
        | { trashed: number }
        | undefined
      const previousTrashed = item?.trashed ?? 0

      const requestJson = JSON.stringify({
        method: 'files.update',
        fileId,
        body: { trashed: args.trashed }
      })

      const optimisticJson = JSON.stringify({
        type: opType,
        fileId,
        trashed: args.trashed
      })

      const rollbackJson = JSON.stringify({
        type: opType,
        fileId,
        previousTrashed: previousTrashed === 1
      })

      // 1) Insert pending op
      db.prepare(`
        INSERT INTO pending_ops (
          op_id, created_at_ms, updated_at_ms, user_seq, batch_id,
          op_type, file_id, request_json, optimistic_json, rollback_json,
          status, next_retry_at_ms
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          'pending', 0
        )
      `).run(opId, now, now, seq, batchId, opType, fileId, requestJson, optimisticJson, rollbackJson)

      // 2) Optimistic local trash/untrash
      db.prepare('UPDATE drive_items SET trashed = ? WHERE id = ?').run(
        args.trashed ? 1 : 0,
        fileId
      )

      // 3) Mark dirty
      db.prepare(
        'UPDATE drive_items SET local_dirty = 1, pending_op_id = ?, last_local_change_ms = ? WHERE id = ?'
      ).run(opId, now, fileId)

      opIds.push(opId)
    }
  })

  run()
  return { opIds }
}

/**
 * Enqueue permanent delete operations for files.
 */
export function enqueueDelete(args: EnqueueDeleteArgs): { opIds: string[] } {
  const db = getDb()
  const now = Date.now()
  const batchId = args.fileIds.length > 1 ? randomUUID() : null
  const opIds: string[] = []

  const run = db.transaction(() => {
    for (const fileId of args.fileIds) {
      const opId = randomUUID()
      const seq = nextUserSeq()

      // Capture full item state for rollback (in case remote delete fails)
      const item = db.prepare('SELECT name, trashed FROM drive_items WHERE id = ?').get(fileId) as
        | { name: string; trashed: number }
        | undefined

      const parents = db
        .prepare('SELECT parent_id FROM item_parents WHERE child_id = ?')
        .all(fileId) as { parent_id: string }[]

      const requestJson = JSON.stringify({
        method: 'files.delete',
        fileId
      })

      const optimisticJson = JSON.stringify({
        type: 'delete',
        fileId
      })

      const rollbackJson = JSON.stringify({
        type: 'delete',
        fileId,
        previousName: item?.name,
        previousTrashed: (item?.trashed ?? 0) === 1,
        previousParents: parents.map((p) => p.parent_id)
      })

      // 1) Insert pending op
      db.prepare(`
        INSERT INTO pending_ops (
          op_id, created_at_ms, updated_at_ms, user_seq, batch_id,
          op_type, file_id, request_json, optimistic_json, rollback_json,
          status, next_retry_at_ms
        ) VALUES (
          ?, ?, ?, ?, ?,
          'delete', ?, ?, ?, ?,
          'pending', 0
        )
      `).run(opId, now, now, seq, batchId, fileId, requestJson, optimisticJson, rollbackJson)

      // 2) Optimistic local delete: mark removed
      db.prepare(
        'UPDATE drive_items SET is_removed = 1, removed_time_ms = ? WHERE id = ?'
      ).run(now, fileId)
      db.prepare('DELETE FROM item_parents WHERE child_id = ?').run(fileId)

      // 3) Mark dirty
      db.prepare(
        'UPDATE drive_items SET local_dirty = 1, pending_op_id = ?, last_local_change_ms = ? WHERE id = ?'
      ).run(opId, now, fileId)

      opIds.push(opId)
    }
  })

  run()
  return { opIds }
}

// ── Query / Management Functions ──

function rowToOpRecord(row: Record<string, unknown>): OpRecord {
  return {
    opId: row.op_id as string,
    createdAtMs: row.created_at_ms as number,
    updatedAtMs: row.updated_at_ms as number,
    userSeq: row.user_seq as number,
    batchId: (row.batch_id as string) ?? null,
    opType: row.op_type as OpType,
    fileId: row.file_id as string,
    requestJson: row.request_json as string,
    optimisticJson: row.optimistic_json as string,
    rollbackJson: row.rollback_json as string,
    status: row.status as OpStatus,
    lockedBy: (row.locked_by as string) ?? null,
    lockExpiresAtMs: (row.lock_expires_at_ms as number) ?? null,
    attemptCount: row.attempt_count as number,
    nextRetryAtMs: row.next_retry_at_ms as number,
    lastErrorCode: (row.last_error_code as string) ?? null,
    lastErrorMessage: (row.last_error_message as string) ?? null,
    remoteHttpStatus: (row.remote_http_status as number) ?? null,
    remoteResponseJson: (row.remote_response_json as string) ?? null
  }
}

export function getOp(opId: string): OpRecord | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM pending_ops WHERE op_id = ?').get(opId) as
    | Record<string, unknown>
    | undefined
  return row ? rowToOpRecord(row) : null
}

export function listOps(args: {
  status?: OpStatus
  limit: number
  offset: number
}): OpRecord[] {
  const db = getDb()
  if (args.status) {
    return (
      db
        .prepare(
          'SELECT * FROM pending_ops WHERE status = ? ORDER BY user_seq DESC LIMIT ? OFFSET ?'
        )
        .all(args.status, args.limit, args.offset) as Record<string, unknown>[]
    ).map(rowToOpRecord)
  }
  return (
    db
      .prepare('SELECT * FROM pending_ops ORDER BY user_seq DESC LIMIT ? OFFSET ?')
      .all(args.limit, args.offset) as Record<string, unknown>[]
  ).map(rowToOpRecord)
}

/**
 * Get count of pending ops by status.
 */
export function getOpCounts(): Record<OpStatus, number> {
  const db = getDb()
  const rows = db
    .prepare('SELECT status, COUNT(*) as cnt FROM pending_ops GROUP BY status')
    .all() as { status: OpStatus; cnt: number }[]

  const counts: Record<OpStatus, number> = {
    pending: 0,
    in_flight: 0,
    succeeded: 0,
    failed: 0,
    rolled_back: 0,
    needs_user: 0
  }

  for (const row of rows) {
    counts[row.status] = row.cnt
  }
  return counts
}

/**
 * Manually retry a failed/needs_user op — resets to pending.
 */
export function retryOp(opId: string): void {
  const db = getDb()
  const now = Date.now()
  db.prepare(`
    UPDATE pending_ops
    SET status = 'pending',
        next_retry_at_ms = 0,
        locked_by = NULL,
        lock_expires_at_ms = NULL,
        updated_at_ms = ?
    WHERE op_id = ?
      AND status IN ('failed', 'needs_user')
  `).run(now, opId)
}

/**
 * Cancel an op — mark needs_user (caller decides whether to also rollback).
 */
export function cancelOp(opId: string): void {
  const db = getDb()
  const now = Date.now()
  db.prepare(`
    UPDATE pending_ops
    SET status = 'needs_user',
        locked_by = NULL,
        lock_expires_at_ms = NULL,
        updated_at_ms = ?
    WHERE op_id = ?
      AND status IN ('pending', 'failed')
  `).run(now, opId)
}

/**
 * Rollback an op: restore the local DB state and mark rolled_back.
 */
export function rollbackOp(opId: string): void {
  const db = getDb()
  const now = Date.now()

  const run = db.transaction(() => {
    const op = db.prepare('SELECT * FROM pending_ops WHERE op_id = ?').get(opId) as
      | Record<string, unknown>
      | undefined
    if (!op) return

    const rollback = JSON.parse(op.rollback_json as string)
    const fileId = op.file_id as string

    switch (op.op_type) {
      case 'move': {
        // Restore original parents
        db.prepare('DELETE FROM item_parents WHERE child_id = ?').run(fileId)
        for (const parentId of rollback.previousParents ?? []) {
          db.prepare(
            'INSERT OR IGNORE INTO item_parents (child_id, parent_id, is_primary) VALUES (?, ?, 1)'
          ).run(fileId, parentId)
        }
        db.prepare(
          'UPDATE drive_items SET parent_count = (SELECT COUNT(*) FROM item_parents WHERE child_id = ?) WHERE id = ?'
        ).run(fileId, fileId)
        break
      }
      case 'rename': {
        db.prepare('UPDATE drive_items SET name = ? WHERE id = ?').run(
          rollback.previousName,
          fileId
        )
        break
      }
      case 'trash':
      case 'untrash': {
        db.prepare('UPDATE drive_items SET trashed = ? WHERE id = ?').run(
          rollback.previousTrashed ? 1 : 0,
          fileId
        )
        break
      }
      case 'delete': {
        // Un-remove the item
        db.prepare(
          'UPDATE drive_items SET is_removed = 0, removed_time_ms = NULL, trashed = ? WHERE id = ?'
        ).run(rollback.previousTrashed ? 1 : 0, fileId)
        // Restore parents
        for (const parentId of rollback.previousParents ?? []) {
          db.prepare(
            'INSERT OR IGNORE INTO item_parents (child_id, parent_id, is_primary) VALUES (?, ?, 1)'
          ).run(fileId, parentId)
        }
        db.prepare(
          'UPDATE drive_items SET parent_count = (SELECT COUNT(*) FROM item_parents WHERE child_id = ?) WHERE id = ?'
        ).run(fileId, fileId)
        break
      }
    }

    // Clear dirty markers
    db.prepare(
      'UPDATE drive_items SET local_dirty = 0, pending_op_id = NULL, last_local_change_ms = ? WHERE id = ?'
    ).run(now, fileId)

    // Mark op as rolled back
    db.prepare(`
      UPDATE pending_ops
      SET status = 'rolled_back',
          locked_by = NULL,
          lock_expires_at_ms = NULL,
          updated_at_ms = ?
      WHERE op_id = ?
    `).run(now, opId)
  })

  run()
}

/**
 * Clean up old succeeded/rolled_back ops (housekeeping).
 * Call periodically to prevent unbounded growth.
 */
export function purgeCompletedOps(maxAgeMs = 24 * 60 * 60 * 1000): number {
  const db = getDb()
  const cutoff = Date.now() - maxAgeMs
  const result = db
    .prepare(
      "DELETE FROM pending_ops WHERE status IN ('succeeded', 'rolled_back') AND updated_at_ms < ?"
    )
    .run(cutoff)
  return result.changes
}
