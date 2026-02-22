/**
 * Phase 5: Cleanup review workflow.
 *
 * Users create a review session, mark files with decisions (keep/trash/delete/skip),
 * then enqueue the decisions as Phase 4 durable ops. Reviews provide a safety
 * layer — nothing happens until the user explicitly enqueues.
 */

import { randomUUID } from 'crypto'
import { getDb } from '../db/database'
import { enqueueTrash, enqueueDelete } from '../ops/opsQueue'

// ── Types ──

export type ReviewKind = 'duplicates' | 'large_files' | 'manual'
export type ReviewStatus = 'draft' | 'queued' | 'completed' | 'cancelled'
export type ReviewDecision = 'keep' | 'trash' | 'delete' | 'skip'

export interface ReviewItem {
  fileId: string
  decision: ReviewDecision
  notes: string | null
}

export interface ReviewRecord {
  reviewId: string
  kind: ReviewKind
  status: ReviewStatus
  queryParamsJson: string | null
  createdAtMs: number
  updatedAtMs: number
  items: ReviewItem[]
}

// ── Public functions ──

/**
 * Create a new cleanup review session.
 */
export function createReview(
  kind: ReviewKind,
  queryParamsJson?: string
): { reviewId: string } {
  const db = getDb()
  const reviewId = randomUUID()
  const now = Date.now()

  db.prepare(`
    INSERT INTO cleanup_review (review_id, kind, status, query_params_json, created_at_ms, updated_at_ms)
    VALUES (?, ?, 'draft', ?, ?, ?)
  `).run(reviewId, kind, queryParamsJson ?? null, now, now)

  return { reviewId }
}

/**
 * Set a per-file decision within a review.
 */
export function setReviewDecision(
  reviewId: string,
  fileId: string,
  decision: ReviewDecision,
  notes?: string
): void {
  const db = getDb()
  const now = Date.now()

  db.prepare(`
    INSERT INTO cleanup_review_items (review_id, file_id, decision, notes)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(review_id, file_id) DO UPDATE SET
      decision = excluded.decision,
      notes    = excluded.notes
  `).run(reviewId, fileId, decision, notes ?? null)

  // Touch review timestamp
  db.prepare(`UPDATE cleanup_review SET updated_at_ms = ? WHERE review_id = ?`).run(now, reviewId)
}

/**
 * Set decisions for multiple files at once (batch version).
 */
export function setReviewDecisions(
  reviewId: string,
  decisions: Array<{ fileId: string; decision: ReviewDecision; notes?: string }>
): void {
  const db = getDb()
  const now = Date.now()

  const upsert = db.prepare(`
    INSERT INTO cleanup_review_items (review_id, file_id, decision, notes)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(review_id, file_id) DO UPDATE SET
      decision = excluded.decision,
      notes    = excluded.notes
  `)

  const run = db.transaction(() => {
    for (const d of decisions) {
      upsert.run(reviewId, d.fileId, d.decision, d.notes ?? null)
    }
    db.prepare(`UPDATE cleanup_review SET updated_at_ms = ? WHERE review_id = ?`).run(now, reviewId)
  })

  run()
}

/**
 * Get a review with all its items.
 */
export function getReview(reviewId: string): ReviewRecord | null {
  const db = getDb()

  const review = db.prepare(`
    SELECT review_id, kind, status, query_params_json, created_at_ms, updated_at_ms
    FROM cleanup_review
    WHERE review_id = ?
  `).get(reviewId) as {
    review_id: string
    kind: string
    status: string
    query_params_json: string | null
    created_at_ms: number
    updated_at_ms: number
  } | undefined

  if (!review) return null

  const items = db.prepare(`
    SELECT file_id, decision, notes
    FROM cleanup_review_items
    WHERE review_id = ?
  `).all(reviewId) as Array<{
    file_id: string
    decision: string
    notes: string | null
  }>

  return {
    reviewId: review.review_id,
    kind: review.kind as ReviewKind,
    status: review.status as ReviewStatus,
    queryParamsJson: review.query_params_json,
    createdAtMs: review.created_at_ms,
    updatedAtMs: review.updated_at_ms,
    items: items.map((i) => ({
      fileId: i.file_id,
      decision: i.decision as ReviewDecision,
      notes: i.notes
    }))
  }
}

/**
 * Enqueue all trash/delete decisions from a review into the Phase 4 ops queue.
 * Returns the batch_id and op IDs for tracking.
 */
export function enqueueReviewActions(
  reviewId: string,
  batchSize?: number
): { batchId: string; opIds: string[] } {
  const db = getDb()
  const bs = batchSize ?? 200

  // Verify review exists and is in draft status
  const review = db.prepare(`
    SELECT status FROM cleanup_review WHERE review_id = ?
  `).get(reviewId) as { status: string } | undefined

  if (!review) throw new Error(`Review ${reviewId} not found`)
  if (review.status !== 'draft') throw new Error(`Review ${reviewId} is not in draft status (current: ${review.status})`)

  // Get items with actionable decisions
  const trashItems = db.prepare(`
    SELECT file_id FROM cleanup_review_items
    WHERE review_id = ? AND decision = 'trash'
  `).all(reviewId) as Array<{ file_id: string }>

  const deleteItems = db.prepare(`
    SELECT file_id FROM cleanup_review_items
    WHERE review_id = ? AND decision = 'delete'
  `).all(reviewId) as Array<{ file_id: string }>

  const allOpIds: string[] = []

  // Enqueue trash ops in batches
  for (let i = 0; i < trashItems.length; i += bs) {
    const chunk = trashItems.slice(i, i + bs)
    const result = enqueueTrash({
      fileIds: chunk.map((item) => item.file_id),
      trashed: true
    })
    allOpIds.push(...result.opIds)
  }

  // Enqueue delete ops in batches
  for (let i = 0; i < deleteItems.length; i += bs) {
    const chunk = deleteItems.slice(i, i + bs)
    const result = enqueueDelete({
      fileIds: chunk.map((item) => item.file_id)
    })
    allOpIds.push(...result.opIds)
  }

  // Update review status
  const now = Date.now()
  const batchId = randomUUID()
  db.prepare(`
    UPDATE cleanup_review SET status = 'queued', updated_at_ms = ? WHERE review_id = ?
  `).run(now, reviewId)

  return { batchId, opIds: allOpIds }
}

/**
 * Cancel a review — marks it as cancelled.
 * Does NOT cancel already-enqueued ops (those are managed via the ops queue).
 */
export function cancelReview(reviewId: string): void {
  const db = getDb()
  const now = Date.now()

  const result = db.prepare(`
    UPDATE cleanup_review SET status = 'cancelled', updated_at_ms = ?
    WHERE review_id = ? AND status IN ('draft', 'queued')
  `).run(now, reviewId)

  if (result.changes === 0) {
    throw new Error(`Review ${reviewId} not found or already completed/cancelled`)
  }
}
