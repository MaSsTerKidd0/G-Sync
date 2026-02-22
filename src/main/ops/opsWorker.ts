/**
 * Phase 4: Background Operations Worker
 *
 * Single-writer loop that:
 * 1. Reclaims expired leases (crash recovery)
 * 2. Claims next eligible pending op with a lease
 * 3. Executes the Drive API call
 * 4. Commits success/failure/rollback in a transaction
 *
 * Runs on a configurable tick interval (default 1s).
 * The worker is started/stopped from the main process.
 */

import { EventEmitter } from 'events'
import { getDb } from '../db/database'
import { updateFile, deleteFile, classifyDriveError, type DriveApiError } from '../drive/driveApi'
import { upsertFileBatch } from '../db/syncWriter'
import { rollbackOp, type OpRecord } from './opsQueue'

// ── Constants ──

const WORKER_ID = `worker-${process.pid}`
const LEASE_DURATION_MS = 30_000 // 30s lease
const TICK_INTERVAL_MS = 1_000 // 1s between ticks
const MAX_ATTEMPTS = 8 // up to ~256s max backoff

// ── Backoff ──

/**
 * Truncated exponential backoff with jitter per Drive's guidance.
 * Formula: min(2^attempt * 1000 + random(0..1000), 300_000)
 */
function computeBackoffMs(attemptCount: number): number {
  const base = Math.min(1000 * Math.pow(2, attemptCount), 300_000)
  const jitter = Math.floor(Math.random() * 1000)
  return base + jitter
}

// ── Worker Class ──

export class OpsWorker extends EventEmitter {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false
  private processing = false

  start(): void {
    if (this.running) return
    this.running = true
    console.log('[opsWorker] Starting worker loop')

    // Immediately reclaim any expired leases from a previous crash
    this.reclaimExpiredLeases()

    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        console.error('[opsWorker] tick error:', err)
      })
    }, TICK_INTERVAL_MS)

    // Run first tick immediately
    this.tick().catch((err) => {
      console.error('[opsWorker] initial tick error:', err)
    })
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    console.log('[opsWorker] Stopped')
  }

  get isRunning(): boolean {
    return this.running
  }

  /**
   * On startup, reset any in_flight ops with expired leases back to pending.
   */
  private reclaimExpiredLeases(): void {
    try {
      const db = getDb()
      const now = Date.now()
      const result = db.prepare(`
        UPDATE pending_ops
        SET status = 'pending',
            locked_by = NULL,
            lock_expires_at_ms = NULL,
            updated_at_ms = ?
        WHERE status = 'in_flight'
          AND lock_expires_at_ms < ?
      `).run(now, now)

      if (result.changes > 0) {
        console.log(`[opsWorker] Reclaimed ${result.changes} expired lease(s)`)
      }
    } catch (err) {
      console.error('[opsWorker] reclaimExpiredLeases error:', err)
    }
  }

  /**
   * Main worker tick: claim one op, execute, commit result.
   * Only processes one op per tick to keep DB writes serialized.
   */
  private async tick(): Promise<void> {
    if (!this.running || this.processing) return
    this.processing = true

    try {
      const op = this.claimNextOp()
      if (!op) return // nothing to do

      // Execute the Drive API call (HTTP) — outside any DB transaction
      const result = await this.executeDriveOp(op)

      // Commit the outcome
      this.commitResult(op, result)

      // Emit events for the renderer
      this.emit('ops:changed', { opId: op.opId, status: result.status })
    } catch (err) {
      console.error('[opsWorker] tick error:', err)
    } finally {
      this.processing = false
    }
  }

  /**
   * Atomically claim the next eligible pending op.
   */
  private claimNextOp(): OpRecord | null {
    const db = getDb()
    const now = Date.now()

    // Also reclaim any expired leases inline
    db.prepare(`
      UPDATE pending_ops
      SET status = 'pending',
          locked_by = NULL,
          lock_expires_at_ms = NULL,
          updated_at_ms = ?
      WHERE status = 'in_flight'
        AND lock_expires_at_ms < ?
    `).run(now, now)

    // Claim one op
    const claim = db.transaction(() => {
      const row = db
        .prepare(
          `SELECT op_id FROM pending_ops
           WHERE status = 'pending'
             AND next_retry_at_ms <= ?
           ORDER BY user_seq
           LIMIT 1`
        )
        .get(now) as { op_id: string } | undefined

      if (!row) return null

      const updated = db.prepare(`
        UPDATE pending_ops
        SET status = 'in_flight',
            locked_by = ?,
            lock_expires_at_ms = ?,
            updated_at_ms = ?
        WHERE op_id = ?
          AND status = 'pending'
      `).run(WORKER_ID, now + LEASE_DURATION_MS, now, row.op_id)

      if (updated.changes !== 1) return null

      return db.prepare('SELECT * FROM pending_ops WHERE op_id = ?').get(row.op_id) as Record<
        string,
        unknown
      >
    })

    const rawOp = claim()
    if (!rawOp) return null

    return {
      opId: rawOp.op_id as string,
      createdAtMs: rawOp.created_at_ms as number,
      updatedAtMs: rawOp.updated_at_ms as number,
      userSeq: rawOp.user_seq as number,
      batchId: (rawOp.batch_id as string) ?? null,
      opType: rawOp.op_type as OpRecord['opType'],
      fileId: rawOp.file_id as string,
      requestJson: rawOp.request_json as string,
      optimisticJson: rawOp.optimistic_json as string,
      rollbackJson: rawOp.rollback_json as string,
      status: rawOp.status as OpRecord['status'],
      lockedBy: (rawOp.locked_by as string) ?? null,
      lockExpiresAtMs: (rawOp.lock_expires_at_ms as number) ?? null,
      attemptCount: rawOp.attempt_count as number,
      nextRetryAtMs: rawOp.next_retry_at_ms as number,
      lastErrorCode: (rawOp.last_error_code as string) ?? null,
      lastErrorMessage: (rawOp.last_error_message as string) ?? null,
      remoteHttpStatus: (rawOp.remote_http_status as number) ?? null,
      remoteResponseJson: (rawOp.remote_response_json as string) ?? null
    }
  }

  /**
   * Execute the Drive API call for an op.
   */
  private async executeDriveOp(
    op: OpRecord
  ): Promise<{
    ok: boolean
    retryable: boolean
    status: string
    code?: string
    message?: string
    httpStatus?: number
    responseJson?: string
  }> {
    try {
      const request = JSON.parse(op.requestJson)

      switch (op.opType) {
        case 'move': {
          const result = await updateFile({
            fileId: request.fileId,
            addParents: request.addParents,
            removeParents: request.removeParents
          })
          return {
            ok: true,
            retryable: false,
            status: 'succeeded',
            httpStatus: 200,
            responseJson: JSON.stringify(result)
          }
        }

        case 'rename': {
          const result = await updateFile({
            fileId: request.fileId,
            body: request.body
          })
          return {
            ok: true,
            retryable: false,
            status: 'succeeded',
            httpStatus: 200,
            responseJson: JSON.stringify(result)
          }
        }

        case 'trash':
        case 'untrash': {
          const result = await updateFile({
            fileId: request.fileId,
            body: request.body
          })
          return {
            ok: true,
            retryable: false,
            status: 'succeeded',
            httpStatus: 200,
            responseJson: JSON.stringify(result)
          }
        }

        case 'delete': {
          await deleteFile(request.fileId)
          return {
            ok: true,
            retryable: false,
            status: 'succeeded',
            httpStatus: 204
          }
        }

        default:
          return {
            ok: false,
            retryable: false,
            status: 'failed',
            code: 'UNKNOWN_OP_TYPE',
            message: `Unknown op_type: ${op.opType}`
          }
      }
    } catch (err: unknown) {
      const driveErr = err as DriveApiError
      if (driveErr.status) {
        const classification = classifyDriveError(driveErr)

        // Special case: 404 on delete means already deleted — treat as success
        if (op.opType === 'delete' && driveErr.status === 404) {
          return { ok: true, retryable: false, status: 'succeeded', httpStatus: 404 }
        }

        return {
          ok: false,
          retryable: classification.retryable,
          status: classification.retryable ? 'pending' : 'needs_user',
          code: classification.code,
          message: driveErr.message,
          httpStatus: driveErr.status,
          responseJson: driveErr.body
        }
      }

      // Non-HTTP error (network, etc.) — treat as transient
      return {
        ok: false,
        retryable: true,
        status: 'pending',
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : String(err)
      }
    }
  }

  /**
   * Commit the result of a Drive API call back to the database.
   */
  private commitResult(
    op: OpRecord,
    result: {
      ok: boolean
      retryable: boolean
      status: string
      code?: string
      message?: string
      httpStatus?: number
      responseJson?: string
    }
  ): void {
    const db = getDb()
    const now = Date.now()

    if (result.ok) {
      // ── Success: mark op succeeded, clear dirty markers, upsert fresh metadata ──
      db.transaction(() => {
        db.prepare(`
          UPDATE pending_ops
          SET status = 'succeeded',
              locked_by = NULL,
              lock_expires_at_ms = NULL,
              attempt_count = attempt_count + 1,
              remote_http_status = ?,
              remote_response_json = ?,
              updated_at_ms = ?
          WHERE op_id = ?
        `).run(result.httpStatus ?? null, result.responseJson ?? null, now, op.opId)

        // Clear dirty markers on the file
        db.prepare(`
          UPDATE drive_items
          SET local_dirty = 0,
              pending_op_id = NULL,
              last_local_change_ms = ?
          WHERE id = ?
            AND pending_op_id = ?
        `).run(now, op.fileId, op.opId)

        // If we got a full file resource back, upsert it to get the freshest metadata
        if (result.responseJson && op.opType !== 'delete') {
          try {
            const file = JSON.parse(result.responseJson)
            if (file && file.id) {
              upsertFileBatch([file])
            }
          } catch {
            // ignore parse errors — the op is still marked succeeded
          }
        }
      })()

      this.emit('ops:progress', {
        opId: op.opId,
        opType: op.opType,
        fileId: op.fileId,
        status: 'succeeded'
      })
    } else if (result.retryable) {
      // ── Transient failure: increment attempt, compute backoff, return to pending ──
      const newAttempt = op.attemptCount + 1
      if (newAttempt >= MAX_ATTEMPTS) {
        // Max retries exceeded — escalate to needs_user
        db.prepare(`
          UPDATE pending_ops
          SET status = 'needs_user',
              locked_by = NULL,
              lock_expires_at_ms = NULL,
              attempt_count = ?,
              last_error_code = ?,
              last_error_message = ?,
              remote_http_status = ?,
              remote_response_json = ?,
              updated_at_ms = ?
          WHERE op_id = ?
        `).run(
          newAttempt,
          result.code ?? null,
          result.message ?? null,
          result.httpStatus ?? null,
          result.responseJson ?? null,
          now,
          op.opId
        )

        this.emit('ops:error', {
          opId: op.opId,
          opType: op.opType,
          fileId: op.fileId,
          code: result.code,
          message: `Max retries exceeded: ${result.message}`
        })
      } else {
        const backoffMs = computeBackoffMs(newAttempt)
        db.prepare(`
          UPDATE pending_ops
          SET status = 'pending',
              locked_by = NULL,
              lock_expires_at_ms = NULL,
              attempt_count = ?,
              next_retry_at_ms = ?,
              last_error_code = ?,
              last_error_message = ?,
              remote_http_status = ?,
              updated_at_ms = ?
          WHERE op_id = ?
        `).run(
          newAttempt,
          now + backoffMs,
          result.code ?? null,
          result.message ?? null,
          result.httpStatus ?? null,
          now,
          op.opId
        )
      }
    } else {
      // ── Permanent failure: mark needs_user or rollback ──
      // For delete ops, auto-rollback on permanent failure
      // For move/rename/trash, mark needs_user so user can decide
      if (op.opType === 'delete') {
        // Auto-rollback deletes
        try {
          rollbackOp(op.opId)
        } catch {
          // If rollback itself fails, mark failed
          db.prepare(`
            UPDATE pending_ops
            SET status = 'failed',
                locked_by = NULL,
                lock_expires_at_ms = NULL,
                attempt_count = attempt_count + 1,
                last_error_code = ?,
                last_error_message = ?,
                remote_http_status = ?,
                remote_response_json = ?,
                updated_at_ms = ?
            WHERE op_id = ?
          `).run(
            result.code ?? null,
            result.message ?? null,
            result.httpStatus ?? null,
            result.responseJson ?? null,
            now,
            op.opId
          )
        }
      } else {
        // needs_user for move/rename/trash — keep optimistic state, let user decide
        db.prepare(`
          UPDATE pending_ops
          SET status = 'needs_user',
              locked_by = NULL,
              lock_expires_at_ms = NULL,
              attempt_count = attempt_count + 1,
              last_error_code = ?,
              last_error_message = ?,
              remote_http_status = ?,
              remote_response_json = ?,
              updated_at_ms = ?
          WHERE op_id = ?
        `).run(
          result.code ?? null,
          result.message ?? null,
          result.httpStatus ?? null,
          result.responseJson ?? null,
          now,
          op.opId
        )
      }

      this.emit('ops:error', {
        opId: op.opId,
        opType: op.opType,
        fileId: op.fileId,
        code: result.code,
        message: result.message
      })
    }
  }
}

// ── Singleton ──

export const opsWorker = new OpsWorker()
