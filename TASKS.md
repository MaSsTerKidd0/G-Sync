# Current Session Tasks

## OpsPanel UI Improvements ✅
- [x] Restyle "Close" as a proper button (rounded-md, border, hover state)
- [x] Add "Clear" button to purge completed/rolled-back ops
- [x] Wire `ops:clearCompleted` IPC handler → preload → env.d.ts → useOpsStatus → ExplorerRoot → OpsPanel
- [x] Build verified (0 errors)

## Drive API 403 Permission Issue — User Action Required
- The OAuth scope is already `https://www.googleapis.com/auth/drive` (full access) — no code fix needed
- User must ensure in Google Cloud Console:
  1. Drive API is **enabled** (APIs & Services → Library → Google Drive API → Enable)
  2. OAuth consent screen has the `drive` scope listed
  3. After changes, **disconnect and re-login** in the app to get a fresh token

## Previous — Phase 11 ✅
- [x] Skeleton loaders for ListView, GridView, ExplorerRoot
- [x] DB migration v7: synced_folders + synced_files
- [x] syncedFoldersStore.ts, folderWatcher.ts, folderSyncWorker.ts
- [x] driveApi.ts additions (createDriveFolder, uploadFile, updateFileContent, getFileMetadata)
- [x] IPC handlers + preload bridge + Sidebar Synced Folders dropdown
- [x] Shutdown cleanup for watchers
