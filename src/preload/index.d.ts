interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
  size?: string
  parents?: string[]
}

interface DriveItemRow {
  id: string
  drive_id: string | null
  name: string
  mime_type: string
  is_folder: number
  parent_count: number
  trashed: number
  explicitly_trashed: number
  created_time_ms: number | null
  modified_time_ms: number | null
  size_bytes: number | null
  resource_key: string | null
  is_removed: number
}

interface SyncStatus {
  phase: string
  itemsProcessed: number
  pagesProcessed: number
  lastSuccessAt: number | null
  lastError: string | null
}

interface FolderChildrenResult {
  items: DriveItemRow[]
  totalCount: number
}

interface GsyncApi {
  auth: {
    login: () => Promise<{ success: boolean; error?: string }>
    status: () => Promise<{ connected: boolean; encryptionWarning?: string }>
    disconnect: () => Promise<void>
  }
  drive: {
    listFiles: () => Promise<{ files: DriveFile[] }>
  }
  sync: {
    start: () => Promise<{ success: boolean; error?: string }>
    stop: () => Promise<void>
    status: () => Promise<SyncStatus>
    onPhaseChanged: (cb: (phase: string) => void) => () => void
    onProgress: (cb: (data: { itemsProcessed: number; pagesProcessed: number }) => void) => () => void
    onError: (cb: (err: { code: string; message: string }) => void) => () => void
  }
  db: {
    rootItems: (limit?: number, offset?: number) => Promise<FolderChildrenResult>
    children: (parentId: string, limit?: number, offset?: number) => Promise<FolderChildrenResult>
    search: (query: string, limit?: number) => Promise<DriveItemRow[]>
    recentFiles: (limit?: number) => Promise<DriveItemRow[]>
    itemById: (id: string) => Promise<DriveItemRow | null>
    breadcrumbs: (itemId: string) => Promise<DriveItemRow[]>
    counts: () => Promise<{ totalFiles: number; totalFolders: number; totalRemoved: number }>
  }
}

interface Window {
  gsync: GsyncApi
}
