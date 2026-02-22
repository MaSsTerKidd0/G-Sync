import { EventEmitter } from 'events'
import { listFilesPage, getStartPageToken, listChangesPage } from '../drive/driveApi'
import { throttledDriveCall } from '../drive/rateLimiter'
import { upsertFileBatch, applyChangesBatch } from '../db/syncWriter'
import {
  ensureSyncState,
  updateSnapshotStarted,
  updateSnapshotResumeToken,
  updateSnapshotCompleted,
  updateCatchupToken,
  updateIncrementalReady,
  updateSyncSuccess,
  updateSyncError,
  getSyncState,
  type SyncPhase
} from '../db/syncState'
import { getPollingIntervalMs, getNotifyOnSyncComplete } from '../db/settingsStore'

export interface SyncStatus {
  phase: SyncPhase
  itemsProcessed: number
  pagesProcessed: number
  lastSuccessAt: number | null
  lastError: string | null
}

const SCOPE = 'user'

class SyncEngine extends EventEmitter {
  private _aborted = false
  private _pollTimer: ReturnType<typeof setTimeout> | null = null
  private _running = false
  private _itemsProcessed = 0
  private _pagesProcessed = 0

  getStatus(): SyncStatus {
    const state = getSyncState(SCOPE)
    return {
      phase: state?.phase ?? 'idle',
      itemsProcessed: this._itemsProcessed,
      pagesProcessed: this._pagesProcessed,
      lastSuccessAt: state?.last_success_at_ms ?? null,
      lastError: state?.last_error_message ?? null
    }
  }

  /**
   * Start the full sync pipeline: snapshot -> catch-up -> incremental polling.
   * Safe to call multiple times — will no-op if already running.
   */
  async start(): Promise<void> {
    if (this._running) return
    this._running = true
    this._aborted = false
    this._itemsProcessed = 0
    this._pagesProcessed = 0

    try {
      const state = ensureSyncState(SCOPE)

      if (state.phase === 'idle' || state.phase === 'snapshot') {
        await this.runSnapshot()
        if (this._aborted) return
      }

      if (!this._aborted) {
        const postSnap = getSyncState(SCOPE)
        if (postSnap?.phase === 'catchup') {
          await this.runCatchUp()
          if (this._aborted) return
        }
      }

      if (!this._aborted) {
        this.startPolling()
      }
    } catch (err) {
      this.handleError(err)
    }
  }

  stop(): void {
    this._aborted = true
    this._running = false
    if (this._pollTimer) {
      clearTimeout(this._pollTimer)
      this._pollTimer = null
    }
    console.log('[sync] Stopped')
    this.emit('sync:phaseChanged', 'idle')
  }

  /**
   * Trigger an immediate incremental poll.
   * - If idle, starts full sync pipeline.
   * - If incremental, resets poll timer and polls immediately.
   * - If snapshot/catchup, no-op (already syncing).
   */
  async triggerSync(): Promise<void> {
    const state = getSyncState(SCOPE)
    if (!state || state.phase === 'idle') {
      await this.start()
      return
    }
    if (state.phase === 'incremental' && this._running) {
      // Cancel existing timer and poll immediately
      if (this._pollTimer) {
        clearTimeout(this._pollTimer)
        this._pollTimer = null
      }
      await this.poll()
    }
    // If snapshot/catchup, no-op — already syncing
  }

  // ── Snapshot ──

  private async runSnapshot(): Promise<void> {
    console.log('[sync] Starting snapshot...')
    this.emit('sync:phaseChanged', 'snapshot')

    const state = ensureSyncState(SCOPE)
    let pageToken: string | undefined

    // If resuming a partial snapshot, use the stored resume token
    if (state.phase === 'snapshot' && state.resume_page_token) {
      pageToken = state.resume_page_token
      console.log('[sync] Resuming snapshot from stored page token')
    } else {
      // Fresh snapshot: capture startPageToken BEFORE listing
      const startToken = await throttledDriveCall(() => getStartPageToken())
      updateSnapshotStarted(SCOPE, startToken)
      console.log('[sync] Captured startPageToken:', startToken)
    }

    // Paginate through files.list
    do {
      if (this._aborted) return

      const page = await throttledDriveCall(() =>
        listFilesPage({ pageSize: 1000, pageToken })
      )

      if (page.incompleteSearch) {
        console.warn('[sync] incompleteSearch=true — results may be partial')
      }

      const count = upsertFileBatch(page.files)
      this._itemsProcessed += count
      this._pagesProcessed++
      this.emit('sync:progress', {
        itemsProcessed: this._itemsProcessed,
        pagesProcessed: this._pagesProcessed
      })

      pageToken = page.nextPageToken

      // Checkpoint the resume token after each page
      if (pageToken) {
        updateSnapshotResumeToken(SCOPE, pageToken)
      }

      console.log(
        `[sync] Snapshot page ${this._pagesProcessed}: ${count} items (total: ${this._itemsProcessed})`
      )
    } while (pageToken)

    updateSnapshotCompleted(SCOPE)
    console.log('[sync] Snapshot complete — total items:', this._itemsProcessed)
    this.emit('sync:phaseChanged', 'catchup')
  }

  // ── Catch-up (reconcile changes that occurred during snapshot) ──

  private async runCatchUp(): Promise<void> {
    console.log('[sync] Running catch-up...')
    this.emit('sync:phaseChanged', 'catchup')

    const state = getSyncState(SCOPE)
    if (!state?.start_page_token) {
      throw new Error('No start_page_token for catch-up — state is inconsistent')
    }

    let pageToken: string | undefined = state.resume_page_token ?? state.start_page_token

    do {
      if (this._aborted) return

      const page = await throttledDriveCall(() =>
        listChangesPage({ pageToken: pageToken!, pageSize: 1000 })
      )

      const applied = applyChangesBatch(page.changes, SCOPE)
      this._itemsProcessed += applied
      this._pagesProcessed++
      this.emit('sync:progress', {
        itemsProcessed: this._itemsProcessed,
        pagesProcessed: this._pagesProcessed
      })

      if (page.nextPageToken) {
        pageToken = page.nextPageToken
        updateCatchupToken(SCOPE, pageToken)
      } else {
        // End of changes — store new start token and transition to incremental
        const newToken = page.newStartPageToken!
        updateIncrementalReady(SCOPE, newToken)
        pageToken = undefined
        console.log('[sync] Catch-up complete — ready for incremental polling')
      }
    } while (pageToken)

    this.emit('sync:phaseChanged', 'incremental')
  }

  // ── Incremental polling ──

  private startPolling(): void {
    const intervalMs = getPollingIntervalMs()
    console.log('[sync] Starting incremental polling (every', intervalMs / 1000, 's)')
    this.emit('sync:phaseChanged', 'incremental')

    // Emit sync:completed for notification
    if (getNotifyOnSyncComplete()) {
      this.emit('sync:completed')
    }

    this.poll()
  }

  private async poll(): Promise<void> {
    if (this._aborted) return

    try {
      const state = getSyncState(SCOPE)
      if (!state?.start_page_token) {
        console.error('[sync] No start_page_token for polling')
        return
      }

      let pageToken: string | undefined = state.start_page_token
      let changesInPoll = 0

      do {
        if (this._aborted) return

        const page = await throttledDriveCall(() =>
          listChangesPage({ pageToken: pageToken!, pageSize: 1000 })
        )

        const applied = applyChangesBatch(page.changes, SCOPE)
        changesInPoll += applied

        if (page.nextPageToken) {
          pageToken = page.nextPageToken
        } else {
          const newToken = page.newStartPageToken!
          updateSyncSuccess(SCOPE, newToken)
          pageToken = undefined
        }
      } while (pageToken)

      if (changesInPoll > 0) {
        console.log(`[sync] Poll applied ${changesInPoll} changes`)
        this.emit('sync:progress', {
          itemsProcessed: this._itemsProcessed + changesInPoll,
          pagesProcessed: this._pagesProcessed
        })
        this._itemsProcessed += changesInPoll
      }
    } catch (err) {
      this.handleError(err)
    }

    // Schedule next poll — re-reads interval from settings each cycle
    if (!this._aborted) {
      this._pollTimer = setTimeout(() => this.poll(), getPollingIntervalMs())
    }
  }

  // ── Error handling ──

  private handleError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err)
    const code = (err as { status?: number }).status
      ? `HTTP_${(err as { status: number }).status}`
      : 'UNKNOWN'

    console.error('[sync] Error:', code, message)
    updateSyncError(SCOPE, code, message)
    this.emit('error', { code, message })
  }
}

// Singleton instance
export const syncEngine = new SyncEngine()
