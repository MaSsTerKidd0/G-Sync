/// <reference types="vite/client" />

// Phase 3: Augment Window with gsync API types
interface DriveItemRowBridge {
  id: string
  drive_id: string | null
  name: string
  mime_type: string
  is_folder: number
  parent_count: number
  trashed: number
  size_bytes: number | null
  modified_time_ms: number | null
  icon_link: string | null
  has_thumbnail: number
  thumbnail_version: string | null
  is_removed: number
}

interface PageResultBridge {
  items: DriveItemRowBridge[]
  totalCount: number
  nextCursor?: { sortValue: string | number; id: string }
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

interface GsyncApi {
  auth: {
    login(): Promise<{ success: boolean; error?: string }>
    status(): Promise<{ connected: boolean; encryptionWarning?: string }>
    disconnect(): Promise<void>
  }
  drive: {
    listFiles(): Promise<{
      files: Array<{
        id: string
        name: string
        mimeType: string
        modifiedTime?: string
        size?: string
        parents?: string[]
      }>
    }>
  }
  sync: {
    start(): Promise<{ success: boolean; error?: string }>
    stop(): Promise<void>
    status(): Promise<{
      phase: string
      itemsProcessed: number
      pagesProcessed: number
      lastSuccessAt: number | null
      lastError: string | null
    }>
    onPhaseChanged(cb: (phase: string) => void): () => void
    onProgress(cb: (data: { itemsProcessed: number; pagesProcessed: number }) => void): () => void
    onError(cb: (err: { code: string; message: string }) => void): () => void
  }
  db: {
    rootItems(limit?: number, offset?: number): Promise<{
      items: DriveItemRowBridge[]
      totalCount: number
    }>
    children(parentId: string, limit?: number, offset?: number): Promise<{
      items: DriveItemRowBridge[]
      totalCount: number
    }>
    search(query: string, limit?: number): Promise<DriveItemRowBridge[]>
    recentFiles(limit?: number): Promise<DriveItemRowBridge[]>
    itemById(id: string): Promise<DriveItemRowBridge | null>
    breadcrumbs(itemId: string): Promise<DriveItemRowBridge[]>
    counts(): Promise<{ totalFiles: number; totalFolders: number; totalRemoved: number }>
  }
  explorer: {
    listFolderPage(args: {
      parentId: string
      sortBy: 'name' | 'modifiedTime' | 'size'
      sortDir: 'asc' | 'desc'
      limit: number
      cursor?: { sortValue: string | number; id: string }
      q?: string
      showTrashed?: boolean
    }): Promise<PageResultBridge>
    getThumbnail(args: {
      fileId: string
      thumbnailVersion?: string | null
    }): Promise<{ mimeType: string; bytesBase64: string } | null>
    onDbChanged(cb: (evt: { reason: 'dbChanged' | 'syncProgress' }) => void): () => void
  }
  ops: {
    enqueueMove(args: {
      fileIds: string[]
      fromParentId: string | null
      toParentId: string
    }): Promise<{ opIds: string[] }>
    enqueueRename(args: {
      fileId: string
      newName: string
    }): Promise<{ opId: string }>
    enqueueTrash(args: {
      fileIds: string[]
      trashed: boolean
    }): Promise<{ opIds: string[] }>
    enqueueDelete(args: {
      fileIds: string[]
    }): Promise<{ opIds: string[] }>
    getOp(opId: string): Promise<OpRecordBridge | null>
    listOps(args: {
      status?: string
      limit: number
      offset: number
    }): Promise<OpRecordBridge[]>
    getCounts(): Promise<Record<string, number>>
    retry(opId: string): Promise<void>
    cancel(opId: string): Promise<void>
    rollback(opId: string): Promise<void>
    startWorker(): Promise<void>
    stopWorker(): Promise<void>
    onOpsChanged(cb: (payload: { type: string; opIds: string[] }) => void): () => void
    onOpsProgress(cb: (payload: { opId: string; opType: string; fileId: string; status: string }) => void): () => void
    onOpsError(cb: (payload: { opId: string; opType: string; fileId: string; code: string; message: string }) => void): () => void
  }
  cleanup: {
    listDuplicateGroups(args?: {
      minGroupSize?: number; limit?: number; offset?: number
    }): Promise<DuplicateGroupBridge[]>
    getDuplicateGroupDetails(args: {
      nameNorm: string; sizeBytes: number; mimeType: string
    }): Promise<DuplicateGroupDetailBridge>
    listLargeFiles(args?: {
      minSizeBytes?: number; limit?: number; offset?: number
    }): Promise<LargeFileResultBridge>
    getStorageBreakdown(): Promise<StorageCategoryBridge[]>
    listTimeline(args?: {
      fromMs?: number; toMs?: number; limit?: number; offset?: number
    }): Promise<TimelineEntryBridge[]>
    getTimelineHistogram(days?: number): Promise<HistogramEntryBridge[]>
    createReview(args: {
      kind: string; queryParamsJson?: string
    }): Promise<{ reviewId: string }>
    setReviewDecision(args: {
      reviewId: string; fileId: string; decision: string; notes?: string
    }): Promise<void>
    setReviewDecisions(args: {
      reviewId: string
      decisions: Array<{ fileId: string; decision: string; notes?: string }>
    }): Promise<void>
    getReview(reviewId: string): Promise<ReviewBridge | null>
    enqueueReviewActions(args: {
      reviewId: string; batchSize?: number
    }): Promise<{ batchId: string; opIds: string[] }>
    cancelReview(reviewId: string): Promise<void>
  }
  settings: {
    createBackup(): Promise<{ path: string }>
    listBackups(): Promise<Array<{ path: string; sizeBytes: number; createdAt: number }>>
    resetLocalData(): Promise<void>
    getSecurityInfo(): Promise<{
      tokenEncrypted: boolean
      encryptionBackend: string | null
      warning: string | null
      dbPath: string
      dbSizeBytes: number
    }>
    getAppInfo(): Promise<{
      version: string
      electronVersion: string
      platform: string
    }>
    openDataFolder(): Promise<void>
  }
}

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

interface Window {
  gsync: GsyncApi
}
