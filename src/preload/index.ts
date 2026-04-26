import { contextBridge, ipcRenderer } from 'electron'

// ── Types (shared between preload and renderer) ──

type SortBy = 'name' | 'modifiedTime' | 'size'
type SortDir = 'asc' | 'desc'

interface DriveItemRow {
  id: string
  drive_id: string | null
  name: string
  mime_type: string
  is_folder: number
  parent_count: number
  starred: number
  trashed: number
  size_bytes: number | null
  modified_time_ms: number | null
  icon_link: string | null
  has_thumbnail: number
  thumbnail_version: string | null
  is_removed: number
  owned_by_me: number | null
  shared: number
  owner_name: string | null
  owner_email: string | null
  can_delete: number | null
  can_trash: number | null
  can_edit: number | null
  can_share: number | null
}

interface PageResult {
  items: DriveItemRow[]
  totalCount: number
  nextCursor?: { sortValue: string | number; id: string }
}

// Phase 4: Op record bridge type
interface OpRecordBridge {
  opId: string
  createdAtMs: number
  updatedAtMs: number
  userSeq: number
  batchId: string | null
  opType: string
  fileId: string
  requestJson: string
  optimisticJson: string
  rollbackJson: string
  status: string
  lockedBy: string | null
  lockExpiresAtMs: number | null
  attemptCount: number
  nextRetryAtMs: number
  lastErrorCode: string | null
  lastErrorMessage: string | null
  remoteHttpStatus: number | null
  remoteResponseJson: string | null
}

// Phase 5: Cleanup bridge types
interface DuplicateGroupBridge {
  nameNorm: string
  sizeBytes: number
  mimeType: string
  confidence: 'medium' | 'high'
  fileCount: number
  fileIds: string[]
  totalSize: number
}

interface DuplicateGroupDetailBridge {
  nameNorm: string
  sizeBytes: number
  mimeType: string
  confidence: 'medium' | 'high'
  files: Array<{
    id: string
    name: string
    mimeType: string
    sizeBytes: number | null
    modifiedTimeMs: number | null
    parentPath: string
    md5Checksum: string | null
    sha256Checksum: string | null
    canTrash: number | null
    canDelete: number | null
  }>
}

interface LargeFileResultBridge {
  files: Array<{
    id: string
    name: string
    mimeType: string
    sizeBytes: number
    modifiedTimeMs: number | null
    parentPath: string
  }>
  totalCount: number
}

interface StorageCategoryBridge {
  category: string
  totalSize: number
  fileCount: number
}

interface TimelineEntryBridge {
  id: string
  name: string
  mimeType: string
  sizeBytes: number | null
  modifiedTimeMs: number
}

interface HistogramEntryBridge {
  day: string
  count: number
}

interface ReviewItemBridge {
  fileId: string
  decision: string
  notes: string | null
}

interface ReviewBridge {
  reviewId: string
  kind: string
  status: string
  queryParamsJson: string | null
  createdAtMs: number
  updatedAtMs: number
  items: ReviewItemBridge[]
}

const gsyncApi = {
  auth: {
    login: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('auth:login'),
    status: (): Promise<{ connected: boolean; encryptionWarning?: string }> =>
      ipcRenderer.invoke('auth:status'),
    disconnect: (): Promise<void> => ipcRenderer.invoke('auth:disconnect')
  },
  drive: {
    listFiles: (): Promise<{
      files: Array<{
        id: string
        name: string
        mimeType: string
        modifiedTime?: string
        size?: string
        parents?: string[]
      }>
    }> => ipcRenderer.invoke('drive:listFiles'),

    getStoragePlan: (): Promise<{
      planName: string
      limitBytes: number | null
      usageBytes: number
      usageInDriveBytes: number
      usageInDriveTrashBytes: number
      userName: string
      userEmail: string
      userPhoto?: string
    }> => ipcRenderer.invoke('drive:getStoragePlan'),

    copyFile: (args: {
      fileId: string
      name?: string
    }): Promise<{ success: boolean; fileId?: string; name?: string; error?: string }> =>
      ipcRenderer.invoke('drive:copyFile', args),

    listPermissions: (args: {
      fileId: string
    }): Promise<{
      success: boolean
      permissions: Array<{
        id: string
        type: string
        role: string
        emailAddress?: string
        displayName?: string
        photoLink?: string
        deleted?: boolean
      }>
      error?: string
    }> => ipcRenderer.invoke('drive:listPermissions', args),

    shareFile: (args: {
      fileId: string
      email: string
      role: string
    }): Promise<{
      success: boolean
      permission?: {
        id: string
        type: string
        role: string
        emailAddress?: string
        displayName?: string
      }
      error?: string
    }> => ipcRenderer.invoke('drive:shareFile', args),

    unshareFile: (args: {
      fileId: string
      permissionId: string
    }): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('drive:unshareFile', args)
  },
  sync: {
    start: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('sync:start'),
    stop: (): Promise<void> => ipcRenderer.invoke('sync:stop'),
    status: (): Promise<{
      phase: string
      itemsProcessed: number
      pagesProcessed: number
      lastSuccessAt: number | null
      lastError: string | null
    }> => ipcRenderer.invoke('sync:status'),
    onPhaseChanged: (cb: (phase: string) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, phase: string): void => cb(phase)
      ipcRenderer.on('sync:phaseChanged', handler)
      return () => ipcRenderer.removeListener('sync:phaseChanged', handler)
    },
    onProgress: (
      cb: (data: { itemsProcessed: number; pagesProcessed: number }) => void
    ): (() => void) => {
      const handler = (
        _e: Electron.IpcRendererEvent,
        data: { itemsProcessed: number; pagesProcessed: number }
      ): void => cb(data)
      ipcRenderer.on('sync:progress', handler)
      return () => ipcRenderer.removeListener('sync:progress', handler)
    },
    onError: (cb: (err: { code: string; message: string }) => void): (() => void) => {
      const handler = (
        _e: Electron.IpcRendererEvent,
        err: { code: string; message: string }
      ): void => cb(err)
      ipcRenderer.on('sync:error', handler)
      return () => ipcRenderer.removeListener('sync:error', handler)
    },
    triggerSync: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('sync:triggerSync')
  },
  db: {
    rootItems: (
      limit?: number,
      offset?: number
    ): Promise<{
      items: DriveItemRow[]
      totalCount: number
    }> => ipcRenderer.invoke('db:rootItems', limit, offset),
    children: (
      parentId: string,
      limit?: number,
      offset?: number
    ): Promise<{
      items: DriveItemRow[]
      totalCount: number
    }> => ipcRenderer.invoke('db:children', parentId, limit, offset),
    search: (query: string, limit?: number): Promise<DriveItemRow[]> =>
      ipcRenderer.invoke('db:search', query, limit),
    recentFiles: (limit?: number): Promise<DriveItemRow[]> =>
      ipcRenderer.invoke('db:recentFiles', limit),
    itemById: (id: string): Promise<DriveItemRow | null> =>
      ipcRenderer.invoke('db:itemById', id),
    breadcrumbs: (itemId: string): Promise<DriveItemRow[]> =>
      ipcRenderer.invoke('db:breadcrumbs', itemId),
    counts: (): Promise<{ totalFiles: number; totalFolders: number; totalRemoved: number }> =>
      ipcRenderer.invoke('db:counts'),
    starredItems: (limit?: number): Promise<DriveItemRow[]> =>
      ipcRenderer.invoke('db:starredItems', limit),
    updateStarred: (fileId: string, starred: boolean): Promise<void> =>
      ipcRenderer.invoke('db:updateStarred', { fileId, starred }),
    trashedCount: (): Promise<number> =>
      ipcRenderer.invoke('db:trashedCount'),
    sharedWithMeCount: (): Promise<number> =>
      ipcRenderer.invoke('db:sharedWithMeCount'),
    sharedWithMeItems: (limit?: number): Promise<DriveItemRow[]> =>
      ipcRenderer.invoke('db:sharedWithMeItems', limit),
    mediaCount: (): Promise<number> =>
      ipcRenderer.invoke('db:mediaCount')
  },

  // ── Phase 3: Explorer API ──

  explorer: {
    listFolderPage: (args: {
      parentId: string
      sortBy: SortBy
      sortDir: SortDir
      limit: number
      cursor?: { sortValue: string | number; id: string }
      q?: string
      showTrashed?: boolean
      showShared?: boolean
      showMedia?: boolean
    }): Promise<PageResult> => ipcRenderer.invoke('explorer:listFolderPage', args),

    getThumbnail: (args: {
      fileId: string
      thumbnailVersion?: string | null
    }): Promise<{ mimeType: string; bytesBase64: string } | null> =>
      ipcRenderer.invoke('explorer:getThumbnail', args),

    onDbChanged: (
      cb: (evt: { reason: 'dbChanged' | 'syncProgress' }) => void
    ): (() => void) => {
      const handler = (
        _e: Electron.IpcRendererEvent,
        evt: { reason: 'dbChanged' | 'syncProgress' }
      ): void => cb(evt)
      ipcRenderer.on('explorer:dbChanged', handler)
      return () => ipcRenderer.removeListener('explorer:dbChanged', handler)
    }
  },

  // ── Phase 4: Operations API ──

  ops: {
    enqueueMove: (args: {
      fileIds: string[]
      fromParentId: string | null
      toParentId: string
    }): Promise<{ opIds: string[] }> => ipcRenderer.invoke('ops:enqueueMove', args),

    enqueueRename: (args: {
      fileId: string
      newName: string
    }): Promise<{ opId: string }> => ipcRenderer.invoke('ops:enqueueRename', args),

    enqueueTrash: (args: {
      fileIds: string[]
      trashed: boolean
    }): Promise<{ opIds: string[] }> => ipcRenderer.invoke('ops:enqueueTrash', args),

    enqueueDelete: (args: {
      fileIds: string[]
    }): Promise<{ opIds: string[] }> => ipcRenderer.invoke('ops:enqueueDelete', args),

    getOp: (opId: string): Promise<OpRecordBridge | null> =>
      ipcRenderer.invoke('ops:getOp', opId),

    listOps: (args: {
      status?: string
      limit: number
      offset: number
    }): Promise<OpRecordBridge[]> => ipcRenderer.invoke('ops:listOps', args),

    getCounts: (): Promise<Record<string, number>> =>
      ipcRenderer.invoke('ops:getCounts'),

    retry: (opId: string): Promise<void> =>
      ipcRenderer.invoke('ops:retry', opId),

    cancel: (opId: string): Promise<void> =>
      ipcRenderer.invoke('ops:cancel', opId),

    rollback: (opId: string): Promise<void> =>
      ipcRenderer.invoke('ops:rollback', opId),

    startWorker: (): Promise<void> =>
      ipcRenderer.invoke('ops:startWorker'),

    stopWorker: (): Promise<void> =>
      ipcRenderer.invoke('ops:stopWorker'),

    clearCompleted: (): Promise<number> =>
      ipcRenderer.invoke('ops:clearCompleted'),

    emptyTrash: (): Promise<void> =>
      ipcRenderer.invoke('ops:emptyTrash'),

    onOpsChanged: (
      cb: (payload: { type: string; opIds: string[] }) => void
    ): (() => void) => {
      const handler = (
        _e: Electron.IpcRendererEvent,
        payload: { type: string; opIds: string[] }
      ): void => cb(payload)
      ipcRenderer.on('ops:changed', handler)
      return () => ipcRenderer.removeListener('ops:changed', handler)
    },

    onOpsProgress: (
      cb: (payload: { opId: string; opType: string; fileId: string; status: string }) => void
    ): (() => void) => {
      const handler = (
        _e: Electron.IpcRendererEvent,
        payload: { opId: string; opType: string; fileId: string; status: string }
      ): void => cb(payload)
      ipcRenderer.on('ops:progress', handler)
      return () => ipcRenderer.removeListener('ops:progress', handler)
    },

    onOpsError: (
      cb: (payload: { opId: string; opType: string; fileId: string; code: string; message: string }) => void
    ): (() => void) => {
      const handler = (
        _e: Electron.IpcRendererEvent,
        payload: { opId: string; opType: string; fileId: string; code: string; message: string }
      ): void => cb(payload)
      ipcRenderer.on('ops:error', handler)
      return () => ipcRenderer.removeListener('ops:error', handler)
    },

    // Phase 10: Download operations
    downloadFile: (args: {
      fileId: string
      fileName: string
      mimeType: string
    }): Promise<{ success: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke('ops:downloadFile', args),

    downloadZip: (args: {
      items: Array<{ fileId: string; fileName: string; mimeType: string }>
    }): Promise<{ success: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke('ops:downloadZip', args),

    onDownloadProgress: (
      cb: (payload: { phase: string; fileName: string; current?: number; total?: number; error?: string }) => void
    ): (() => void) => {
      const handler = (
        _e: Electron.IpcRendererEvent,
        payload: { phase: string; fileName: string; current?: number; total?: number; error?: string }
      ): void => cb(payload)
      ipcRenderer.on('download:progress', handler)
      return () => ipcRenderer.removeListener('download:progress', handler)
    }
  },

  // ── Phase 5: Cleanup / Smart Tools API ──

  cleanup: {
    listDuplicateGroups: (args?: {
      minGroupSize?: number; limit?: number; offset?: number
    }): Promise<DuplicateGroupBridge[]> =>
      ipcRenderer.invoke('cleanup:listDuplicateGroups', args),

    getDuplicateGroupDetails: (args: {
      nameNorm: string; sizeBytes: number; mimeType: string
    }): Promise<DuplicateGroupDetailBridge> =>
      ipcRenderer.invoke('cleanup:getDuplicateGroupDetails', args),

    listLargeFiles: (args?: {
      minSizeBytes?: number; limit?: number; offset?: number
    }): Promise<LargeFileResultBridge> =>
      ipcRenderer.invoke('cleanup:listLargeFiles', args),

    getStorageBreakdown: (): Promise<StorageCategoryBridge[]> =>
      ipcRenderer.invoke('cleanup:getStorageBreakdown'),

    listTimeline: (args?: {
      fromMs?: number; toMs?: number; limit?: number; offset?: number
    }): Promise<TimelineEntryBridge[]> =>
      ipcRenderer.invoke('cleanup:listTimeline', args),

    getTimelineHistogram: (days?: number): Promise<HistogramEntryBridge[]> =>
      ipcRenderer.invoke('cleanup:getTimelineHistogram', days),

    createReview: (args: {
      kind: string; queryParamsJson?: string
    }): Promise<{ reviewId: string }> =>
      ipcRenderer.invoke('cleanup:createReview', args),

    setReviewDecision: (args: {
      reviewId: string; fileId: string; decision: string; notes?: string
    }): Promise<void> =>
      ipcRenderer.invoke('cleanup:setReviewDecision', args),

    setReviewDecisions: (args: {
      reviewId: string
      decisions: Array<{ fileId: string; decision: string; notes?: string }>
    }): Promise<void> =>
      ipcRenderer.invoke('cleanup:setReviewDecisions', args),

    getReview: (reviewId: string): Promise<ReviewBridge | null> =>
      ipcRenderer.invoke('cleanup:getReview', reviewId),

    enqueueReviewActions: (args: {
      reviewId: string; batchSize?: number
    }): Promise<{ batchId: string; opIds: string[] }> =>
      ipcRenderer.invoke('cleanup:enqueueReviewActions', args),

    cancelReview: (reviewId: string): Promise<void> =>
      ipcRenderer.invoke('cleanup:cancelReview', reviewId)
  },

  // ── Phase 7: Settings / Data Management API ──

  settings: {
    createBackup: (): Promise<{ path: string }> =>
      ipcRenderer.invoke('settings:createBackup'),

    listBackups: (): Promise<Array<{ path: string; sizeBytes: number; createdAt: number }>> =>
      ipcRenderer.invoke('settings:listBackups'),

    resetLocalData: (): Promise<void> =>
      ipcRenderer.invoke('settings:resetLocalData'),

    getSecurityInfo: (): Promise<{
      tokenEncrypted: boolean
      encryptionBackend: string | null
      warning: string | null
      dbPath: string
      dbSizeBytes: number
    }> => ipcRenderer.invoke('settings:getSecurityInfo'),

    getAppInfo: (): Promise<{
      version: string
      electronVersion: string
      platform: string
    }> => ipcRenderer.invoke('settings:getAppInfo'),

    openDataFolder: (): Promise<void> =>
      ipcRenderer.invoke('settings:openDataFolder'),

    // Phase 9: User preferences
    get: (key: string): Promise<string | null> =>
      ipcRenderer.invoke('settings:get', key),

    set: (key: string, value: string): Promise<void> =>
      ipcRenderer.invoke('settings:set', key, value),

    getAll: (): Promise<Record<string, string>> =>
      ipcRenderer.invoke('settings:getAll')
  },

  // ── Phase 11: Synced Folders API ──

  folders: {
    list: (): Promise<Array<{
      id: string
      local_path: string
      drive_folder_id: string | null
      drive_folder_name: string | null
      status: string
      last_sync_ms: number | null
      last_error: string | null
      created_at_ms: number
    }>> => ipcRenderer.invoke('folders:list'),

    add: (): Promise<{
      success: boolean
      folder?: {
        id: string
        local_path: string
        status: string
      }
      error?: string
    }> => ipcRenderer.invoke('folders:add'),

    remove: (folderId: string): Promise<void> =>
      ipcRenderer.invoke('folders:remove', folderId),

    sync: (folderId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('folders:sync', folderId),

    onStatusChanged: (
      cb: (payload: { folderId: string; status: string }) => void
    ): (() => void) => {
      const handler = (
        _e: Electron.IpcRendererEvent,
        payload: { folderId: string; status: string }
      ): void => cb(payload)
      ipcRenderer.on('folder:statusChanged', handler)
      return () => ipcRenderer.removeListener('folder:statusChanged', handler)
    },

    onSyncProgress: (
      cb: (payload: { folderId: string; current: number; total: number; fileName: string }) => void
    ): (() => void) => {
      const handler = (
        _e: Electron.IpcRendererEvent,
        payload: { folderId: string; current: number; total: number; fileName: string }
      ): void => cb(payload)
      ipcRenderer.on('folder:syncProgress', handler)
      return () => ipcRenderer.removeListener('folder:syncProgress', handler)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('gsync', gsyncApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.gsync = gsyncApi
}
