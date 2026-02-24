# Current Session Tasks

## Phase 12: Trash-First Delete Flow + Trash View + Capability Guards ✅
- [x] Add `canDelete`/`canTrash` to `DriveItemDTO`, `DriveItemRow`, and `rowToDTO()`
- [x] Update `ContextMenu` — remove "Delete permanently" from normal view, add capability guards, add trash-view actions (Restore, Delete permanently, Empty Trash)
- [x] Add Trash nav item to Sidebar with live count badge
- [x] Add `'trash'` to `ActiveView` type in App.tsx + Sidebar.tsx, route to `ExplorerRoot` with `showTrashed`
- [x] Update `ExplorerRoot` — `showTrashed` prop, trash header with "Empty Trash" button, info banner, Restore action bar, capability-gated permanent delete, keyboard shortcut changes
- [x] Add `emptyTrash()` Drive API function (`DELETE /files/trash`)
- [x] Add `getTrashedItemCount()` and `markAllTrashedAsRemoved()` to queryLayer
- [x] Add IPC handlers: `ops:emptyTrash`, `db:trashedCount`
- [x] Add preload bridge: `ops.emptyTrash()`, `db.trashedCount()`
- [x] Add type definitions in env.d.ts
- [x] Build verified (0 errors)

## Previous — OpsPanel UI Improvements ✅
- [x] Restyle "Close" as a proper button
- [x] Add "Clear" button to purge completed/rolled-back ops
- [x] Wire `ops:clearCompleted` through full IPC stack

## Previous — Phase 11 ✅
- [x] Skeleton loaders for ListView, GridView, ExplorerRoot
- [x] DB migration v7: synced_folders + synced_files
- [x] syncedFoldersStore.ts, folderWatcher.ts, folderSyncWorker.ts
- [x] driveApi.ts additions
- [x] IPC handlers + preload bridge + Sidebar Synced Folders dropdown
