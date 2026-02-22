import { app, shell, BrowserWindow, ipcMain, Notification } from 'electron'
import { join } from 'path'
import { existsSync, unlinkSync, statSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { config } from 'dotenv'
import icon from '../../resources/icon.png?asset'
import { startLogin, getAuthStatus, disconnect, refreshAccessToken } from './auth/googleOAuth'
import { loadTokens, isTokenExpired, getTokenSecurityInfo } from './auth/tokenStore'
import { listFiles } from './drive/driveApi'
import { initDatabase, closeDatabase } from './db/database'
import { runMigrations } from './db/migrations'
import { syncEngine } from './sync/syncEngine'
import {
  getChildrenOfFolder,
  getRootItems,
  searchByName,
  getRecentFiles,
  getItemById,
  getBreadcrumbs,
  getItemCounts,
  getStarredItems,
  listFolderPage,
  type SortBy,
  type SortDir
} from './db/queryLayer'
import { resetStmts } from './db/syncWriter'
import { getThumbnail, clearThumbnailCache } from './thumbnails/thumbnailProxy'
import {
  initUserSeq,
  enqueueMove,
  enqueueRename,
  enqueueTrash,
  enqueueDelete,
  getOp,
  listOps,
  getOpCounts,
  retryOp,
  cancelOp,
  rollbackOp,
  purgeCompletedOps,
  type OpStatus,
  type EnqueueMoveArgs,
  type EnqueueRenameArgs,
  type EnqueueTrashArgs,
  type EnqueueDeleteArgs
} from './ops/opsQueue'
import { opsWorker } from './ops/opsWorker'
import {
  findDuplicateGroups,
  getDuplicateGroupDetails,
  listLargeFiles,
  getStorageBreakdown,
  listTimeline,
  getTimelineHistogram
} from './cleanup/cleanupQueries'
import {
  createReview,
  setReviewDecision,
  setReviewDecisions,
  getReview,
  enqueueReviewActions,
  cancelReview,
  type ReviewKind,
  type ReviewDecision
} from './cleanup/cleanupReview'
import {
  assertNonEmptyString,
  assertStringArray,
  assertBoolean,
  assertOneOf,
  assertMaxLength,
  assertOptionalPositiveInt,
  clampMax
} from './ipc/validate'
import { auditMainWindow, logAuditResults } from './security/selfAudit'
import { createBackup, listBackups } from './db/backup'
import { getSetting, setSetting, getAllSettings, getKeepSignedIn } from './db/settingsStore'
import { clearTokens } from './auth/tokenStore'

// Load .env ONCE — try cwd first (dev mode), then app path (production).
const cwd = config()
if (cwd.error) {
  config({ path: join(app.getAppPath(), '.env') })
}

// Validate critical env vars early
if (!process.env.GSYNC_GOOGLE_CLIENT_ID) {
  console.error(
    '[G-Sync] GSYNC_GOOGLE_CLIENT_ID is missing!\n' +
    '  → Copy .env.example to .env and fill in your Google OAuth credentials.\n' +
    '  → See README.md for Google Cloud setup instructions.'
  )
}

let mainWindow: BrowserWindow | null = null

/**
 * Safely send an IPC message to the renderer.
 * Guards against the "Object has been destroyed" error that occurs when
 * webContents is accessed after the BrowserWindow begins closing.
 */
function sendToRenderer(channel: string, ...args: unknown[]): void {
  try {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(channel, ...args)
    }
  } catch (err) {
    // Window was destroyed between the guard check and the send call —
    // this is benign during shutdown, so just log it.
    console.warn('[ipc] Failed to send to renderer (window destroyed):', channel, err)
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 700,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
    // Phase 7: runtime security self-audit
    logAuditResults(auditMainWindow(mainWindow!))
  })

  // Null out the reference when the window is closed so that
  // sendToRenderer() and optional-chaining guards work correctly.
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
  // ── Auth handlers (Phase 1) ──

  ipcMain.handle('auth:login', async () => {
    try {
      await startLogin()
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[IPC] auth:login error:', message)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('auth:status', () => {
    const status = getAuthStatus()
    const tokenSecurity = getTokenSecurityInfo()
    return {
      connected: status.connected,
      encryptionWarning: tokenSecurity.warning ?? undefined
    }
  })

  ipcMain.handle('auth:disconnect', () => {
    syncEngine.stop()
    clearThumbnailCache()
    disconnect()
  })

  // ── Legacy Drive handler (Phase 1 compat) ──

  ipcMain.handle('drive:listFiles', async () => {
    try {
      return await listFiles(20)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[IPC] drive:listFiles error:', message)
      throw new Error(message)
    }
  })

  // ── Sync handlers (Phase 2) ──

  ipcMain.handle('sync:start', async () => {
    try {
      await syncEngine.start()
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('sync:stop', () => {
    syncEngine.stop()
  })

  ipcMain.handle('sync:status', () => {
    return syncEngine.getStatus()
  })

  // ── DB query handlers (Phase 2) ──

  ipcMain.handle('db:rootItems', (_e, limit?: number, offset?: number) => {
    return getRootItems(limit ?? 100, offset ?? 0)
  })

  ipcMain.handle('db:children', (_e, parentId: string, limit?: number, offset?: number) => {
    return getChildrenOfFolder(parentId, limit ?? 100, offset ?? 0)
  })

  ipcMain.handle('db:search', (_e, query: string, limit?: number) => {
    assertNonEmptyString(query, 'query')
    return searchByName(query, clampMax(limit, 1000, 200))
  })

  ipcMain.handle('db:recentFiles', (_e, limit?: number) => {
    return getRecentFiles(limit ?? 50)
  })

  ipcMain.handle('db:itemById', (_e, id: string) => {
    return getItemById(id)
  })

  ipcMain.handle('db:breadcrumbs', (_e, itemId: string) => {
    return getBreadcrumbs(itemId)
  })

  ipcMain.handle('db:counts', () => {
    return getItemCounts()
  })

  // ── Phase 3: Explorer query handlers ──

  ipcMain.handle(
    'explorer:listFolderPage',
    (_e, args: {
      parentId: string
      sortBy: SortBy
      sortDir: SortDir
      limit: number
      cursor?: { sortValue: string | number; id: string }
      q?: string
      showTrashed?: boolean
    }) => {
      assertNonEmptyString(args?.parentId, 'parentId')
      assertOneOf(args?.sortBy, ['name', 'modifiedTime', 'size'] as const, 'sortBy')
      assertOneOf(args?.sortDir, ['asc', 'desc'] as const, 'sortDir')
      args.limit = clampMax(args.limit, 500, 100)
      return listFolderPage(args)
    }
  )

  // ── Phase 3: Thumbnail proxy ──

  ipcMain.handle(
    'explorer:getThumbnail',
    async (_e, args: { fileId: string; thumbnailVersion?: string | null }) => {
      try {
        return await getThumbnail(args.fileId, args.thumbnailVersion)
      } catch (err) {
        console.warn('[IPC] getThumbnail error:', err)
        return null
      }
    }
  )

  // ── Phase 4: Operations queue handlers ──

  ipcMain.handle('ops:enqueueMove', (_e, args: EnqueueMoveArgs) => {
    assertStringArray(args?.fileIds, 'fileIds')
    assertNonEmptyString(args?.toParentId, 'toParentId')
    if (args.fromParentId !== null) assertNonEmptyString(args.fromParentId, 'fromParentId')
    const result = enqueueMove(args)
    sendToRenderer('explorer:dbChanged', { reason: 'dbChanged' })
    sendToRenderer('ops:changed', { type: 'enqueued', opIds: result.opIds })
    return result
  })

  ipcMain.handle('ops:enqueueRename', (_e, args: EnqueueRenameArgs) => {
    assertNonEmptyString(args?.fileId, 'fileId')
    assertNonEmptyString(args?.newName, 'newName')
    assertMaxLength(args.newName, 1024, 'newName')
    const result = enqueueRename(args)
    sendToRenderer('explorer:dbChanged', { reason: 'dbChanged' })
    sendToRenderer('ops:changed', { type: 'enqueued', opIds: [result.opId] })
    return result
  })

  ipcMain.handle('ops:enqueueTrash', (_e, args: EnqueueTrashArgs) => {
    assertStringArray(args?.fileIds, 'fileIds')
    assertBoolean(args?.trashed, 'trashed')
    const result = enqueueTrash(args)
    sendToRenderer('explorer:dbChanged', { reason: 'dbChanged' })
    sendToRenderer('ops:changed', { type: 'enqueued', opIds: result.opIds })
    return result
  })

  ipcMain.handle('ops:enqueueDelete', (_e, args: EnqueueDeleteArgs) => {
    assertStringArray(args?.fileIds, 'fileIds')
    const result = enqueueDelete(args)
    sendToRenderer('explorer:dbChanged', { reason: 'dbChanged' })
    sendToRenderer('ops:changed', { type: 'enqueued', opIds: result.opIds })
    return result
  })

  ipcMain.handle('ops:getOp', (_e, opId: string) => {
    return getOp(opId)
  })

  ipcMain.handle(
    'ops:listOps',
    (_e, args: { status?: OpStatus; limit: number; offset: number }) => {
      return listOps(args)
    }
  )

  ipcMain.handle('ops:getCounts', () => {
    return getOpCounts()
  })

  ipcMain.handle('ops:retry', (_e, opId: string) => {
    assertNonEmptyString(opId, 'opId')
    retryOp(opId)
    sendToRenderer('ops:changed', { type: 'retried', opIds: [opId] })
  })

  ipcMain.handle('ops:cancel', (_e, opId: string) => {
    assertNonEmptyString(opId, 'opId')
    cancelOp(opId)
    sendToRenderer('ops:changed', { type: 'cancelled', opIds: [opId] })
  })

  ipcMain.handle('ops:rollback', (_e, opId: string) => {
    assertNonEmptyString(opId, 'opId')
    rollbackOp(opId)
    sendToRenderer('explorer:dbChanged', { reason: 'dbChanged' })
    sendToRenderer('ops:changed', { type: 'rolledBack', opIds: [opId] })
  })

  ipcMain.handle('ops:startWorker', () => {
    opsWorker.start()
  })

  ipcMain.handle('ops:stopWorker', () => {
    opsWorker.stop()
  })

  // ── Phase 5: Cleanup / Smart Tools handlers ──

  ipcMain.handle('cleanup:listDuplicateGroups', (_e, args?: {
    minGroupSize?: number; limit?: number; offset?: number
  }) => {
    return findDuplicateGroups(args)
  })

  ipcMain.handle('cleanup:getDuplicateGroupDetails', (_e, args: {
    nameNorm: string; sizeBytes: number; mimeType: string
  }) => {
    return getDuplicateGroupDetails(args)
  })

  ipcMain.handle('cleanup:listLargeFiles', (_e, args?: {
    minSizeBytes?: number; limit?: number; offset?: number
  }) => {
    return listLargeFiles(args)
  })

  ipcMain.handle('cleanup:getStorageBreakdown', () => {
    return getStorageBreakdown()
  })

  ipcMain.handle('cleanup:listTimeline', (_e, args?: {
    fromMs?: number; toMs?: number; limit?: number; offset?: number
  }) => {
    return listTimeline(args)
  })

  ipcMain.handle('cleanup:getTimelineHistogram', (_e, days?: number) => {
    return getTimelineHistogram(days)
  })

  ipcMain.handle('cleanup:createReview', (_e, args: {
    kind: ReviewKind; queryParamsJson?: string
  }) => {
    assertOneOf(args?.kind, ['duplicates', 'large-files', 'timeline'] as const, 'kind')
    return createReview(args.kind, args.queryParamsJson)
  })

  ipcMain.handle('cleanup:setReviewDecision', (_e, args: {
    reviewId: string; fileId: string; decision: ReviewDecision; notes?: string
  }) => {
    setReviewDecision(args.reviewId, args.fileId, args.decision, args.notes)
  })

  ipcMain.handle('cleanup:setReviewDecisions', (_e, args: {
    reviewId: string
    decisions: Array<{ fileId: string; decision: ReviewDecision; notes?: string }>
  }) => {
    setReviewDecisions(args.reviewId, args.decisions)
  })

  ipcMain.handle('cleanup:getReview', (_e, reviewId: string) => {
    return getReview(reviewId)
  })

  ipcMain.handle('cleanup:enqueueReviewActions', (_e, args: {
    reviewId: string; batchSize?: number
  }) => {
    assertNonEmptyString(args?.reviewId, 'reviewId')
    assertOptionalPositiveInt(args?.batchSize, 'batchSize')
    const result = enqueueReviewActions(args.reviewId, args.batchSize)
    sendToRenderer('explorer:dbChanged', { reason: 'dbChanged' })
    sendToRenderer('ops:changed', { type: 'enqueued', opIds: result.opIds })
    return result
  })

  ipcMain.handle('cleanup:cancelReview', (_e, reviewId: string) => {
    cancelReview(reviewId)
  })

  // ── Phase 7: Settings / Data Management handlers ──

  ipcMain.handle('settings:createBackup', async () => {
    const path = await createBackup()
    return { path }
  })

  ipcMain.handle('settings:listBackups', () => {
    return listBackups()
  })

  ipcMain.handle('settings:resetLocalData', () => {
    // Stop all background work
    syncEngine.stop()
    opsWorker.stop()
    clearThumbnailCache()
    disconnect() // clear auth tokens

    // Tear down DB
    resetStmts()
    closeDatabase()

    // Delete DB files
    const dbPath = join(app.getPath('userData'), 'gsync-metadata.db')
    const walPath = dbPath + '-wal'
    const shmPath = dbPath + '-shm'
    for (const f of [dbPath, walPath, shmPath]) {
      try {
        if (existsSync(f)) unlinkSync(f)
      } catch {
        // ignore
      }
    }

    // Re-initialize fresh
    initDatabase()
    runMigrations()
    initUserSeq()
    opsWorker.start()
  })

  ipcMain.handle('settings:getSecurityInfo', () => {
    const tokenSec = getTokenSecurityInfo()
    const dbPath = join(app.getPath('userData'), 'gsync-metadata.db')
    let dbSizeBytes = 0
    try {
      dbSizeBytes = statSync(dbPath).size
    } catch {
      // file may not exist yet
    }

    return {
      tokenEncrypted: tokenSec.isEncrypted,
      encryptionBackend: tokenSec.backend,
      warning: tokenSec.warning,
      dbPath,
      dbSizeBytes
    }
  })

  ipcMain.handle('settings:getAppInfo', () => {
    return {
      version: app.getVersion(),
      electronVersion: process.versions.electron,
      platform: process.platform
    }
  })

  ipcMain.handle('settings:openDataFolder', () => {
    shell.openPath(app.getPath('userData'))
  })

  // ── Phase 9: User preferences (settings KV store) ──

  ipcMain.handle('settings:get', (_e, key: string) => {
    assertNonEmptyString(key, 'key')
    return getSetting(key)
  })

  ipcMain.handle('settings:set', (_e, key: string, value: string) => {
    assertNonEmptyString(key, 'key')
    assertNonEmptyString(value, 'value')
    setSetting(key, value)
  })

  ipcMain.handle('settings:getAll', () => {
    return getAllSettings()
  })

  // ── Phase 9: Starred items query ──

  ipcMain.handle('db:starredItems', (_e, limit?: number) => {
    return getStarredItems(clampMax(limit, 200, 50))
  })

  // ── Phase 9: Manual sync trigger ──

  ipcMain.handle('sync:triggerSync', async () => {
    try {
      await syncEngine.triggerSync()
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  })
}

// Forward sync events to the renderer via the safe sender
function wireSyncEvents(): void {
  syncEngine.on('sync:phaseChanged', (phase) => {
    sendToRenderer('sync:phaseChanged', phase)
  })

  syncEngine.on('sync:progress', (progress) => {
    sendToRenderer('sync:progress', progress)
    // Phase 3: notify explorer that DB data has changed
    sendToRenderer('explorer:dbChanged', { reason: 'syncProgress' })
  })

  syncEngine.on('error', (err) => {
    sendToRenderer('sync:error', err)
  })

  // Phase 9: Desktop notification on sync completion
  syncEngine.on('sync:completed', () => {
    if (Notification.isSupported()) {
      new Notification({
        title: 'G-Sync',
        body: 'Sync complete — your Drive is up to date.'
      }).show()
    }
  })
}

// Phase 4: Wire ops worker events to the renderer
function wireOpsWorkerEvents(): void {
  opsWorker.on('ops:changed', (payload) => {
    sendToRenderer('ops:changed', payload)
    sendToRenderer('explorer:dbChanged', { reason: 'dbChanged' })
  })

  opsWorker.on('ops:progress', (payload) => {
    sendToRenderer('ops:progress', payload)
    sendToRenderer('explorer:dbChanged', { reason: 'dbChanged' })
  })

  opsWorker.on('ops:error', (payload) => {
    sendToRenderer('ops:error', payload)
  })
}

async function tryRefreshOnStartup(): Promise<void> {
  const tokens = loadTokens()
  if (tokens && tokens.refresh_token && isTokenExpired(tokens)) {
    console.log('[startup] Access token expired, refreshing...')
    try {
      const refreshed = await refreshAccessToken()
      if (refreshed) {
        console.log('[startup] Token refreshed successfully')
      } else {
        // Check if tokens were cleared (e.g. invalid_grant / revoked consent)
        const remaining = loadTokens()
        if (!remaining) {
          console.warn('[startup] Auth revoked — user must re-authenticate')
        } else {
          console.warn('[startup] Token refresh returned null but tokens still present (transient failure)')
        }
      }
    } catch (err) {
      console.error('[startup] Token refresh failed:', err)
    }
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.gsync')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize database
  initDatabase()
  runMigrations()

  registerIpcHandlers()
  wireSyncEvents()
  wireOpsWorkerEvents()

  // Phase 4: initialize the monotonic user_seq from DB
  initUserSeq()
  // Start the background ops worker
  opsWorker.start()

  await tryRefreshOnStartup()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Phase 7: async-aware shutdown with backup before DB close.
// Uses event.preventDefault() + re-entrant guard so that the
// async backup completes before the process exits.
let isQuitting = false

app.on('before-quit', (event) => {
  if (isQuitting) return // re-entrant call after backup completes

  event.preventDefault()
  isQuitting = true

  // ── Synchronous teardown ──
  opsWorker.stop()
  opsWorker.removeAllListeners()
  syncEngine.stop()
  syncEngine.removeAllListeners()

  try {
    purgeCompletedOps()
  } catch {
    // ignore — DB may already be closing
  }

  resetStmts()

  // Phase 9: Check "keep signed in" BEFORE closing the DB
  let shouldClearTokens = false
  try {
    shouldClearTokens = !getKeepSignedIn()
  } catch {
    // DB may already be closing — default to keeping tokens
  }

  // ── Async backup, then close DB and quit ──
  createBackup()
    .then((path) => console.log('[shutdown] Backup created:', path))
    .catch((err) => console.warn('[shutdown] Backup failed (non-fatal):', err))
    .finally(() => {
      closeDatabase()
      if (shouldClearTokens) {
        clearTokens()
        console.log('[shutdown] Tokens cleared (keep-signed-in disabled)')
      }
      app.quit()
    })
})
