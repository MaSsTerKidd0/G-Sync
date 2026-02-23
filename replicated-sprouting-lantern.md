# Phase 10 Implementation Plan — Versioning, Star Toggle, Downloads

## Overview

Three feature groups: (1) app versioning + patch notes modal, (2) interactive star/unstar, (3) single-file + multi-select zip download.

---

## Step 1: Version Bump + Settings Store Key

**Files:** `package.json`, `src/main/db/settingsStore.ts`

- Bump `"version"` in `package.json` from `"0.1.0"` to `"1.0.0"`.
- Add `last_seen_version` to `DEFAULTS` in `settingsStore.ts` with default `"0.0.0"` (so the modal shows on first run).

---

## Step 2: Patch Notes Modal Component

**New file:** `src/renderer/src/components/PatchNotesModal.tsx`

- A modal (portal to `document.body`) styled identically to the existing `ConfirmDialog` — backdrop + centered card.
- Displays a version badge (`v1.0.0`) and release notes content (hardcoded markdown-like JSX for v1.0.0 highlights).
- "Don't show until next update" checkbox (checked by default).
- "Got it" dismiss button.
- On dismiss: if checkbox is checked, calls `window.gsync.settings.set('last_seen_version', currentVersion)`.
- Props: `version: string`, `onDismiss: () => void`.

---

## Step 3: Wire Patch Notes into App.tsx

**File:** `src/renderer/src/App.tsx`

- On mount (after auth check), fetch `settings.get('last_seen_version')` and `settings.getAppInfo()`.
- Compare `lastSeenVersion !== appInfo.version` → show `PatchNotesModal`.
- State: `showPatchNotes: boolean`, dismissed via callback that hides modal and writes setting.

---

## Step 4: Star Toggle — DB Update IPC

**Files:** `src/main/db/queryLayer.ts`, `src/main/index.ts`, `src/preload/index.ts`

- **queryLayer.ts**: Add `updateStarred(fileId: string, starred: boolean): void` — runs `UPDATE drive_items SET starred = ? WHERE id = ?`.
- **index.ts**: Add IPC handler `db:updateStarred` — validates args, calls `updateStarred()`, emits `explorer:dbChanged`.
- **preload/index.ts**: Add `db.updateStarred(fileId: string, starred: boolean)` bridge method.

---

## Step 5: Star Toggle — Drive API Sync-back

**File:** `src/main/drive/driveApi.ts`

- The existing `updateFile()` already supports PATCH with arbitrary `body`. Star/unstar is `{ starred: true/false }` — no new function needed.
- In the `db:updateStarred` IPC handler (index.ts), after updating local DB, fire-and-forget an `updateFile({ fileId, body: { starred } })` call to sync the change back to Google Drive. Log errors but don't block the UI.

---

## Step 6: Star Toggle — UI Integration

**Files:** `src/renderer/src/components/explorer/ListView.tsx`, `GridView.tsx`, `ContextMenu.tsx`, `ExplorerRoot.tsx`, `src/renderer/src/components/layout/DetailsPanel.tsx`

### ListView.tsx & GridView.tsx:
- Import `Star` icon from lucide-react.
- Add a star icon button to each row/card — shows filled amber for `item.starred`, outline gray otherwise.
- On click (with `e.stopPropagation()`), calls a new `onToggleStar(itemId, !item.starred)` callback prop.

### ContextMenu.tsx:
- Add a "Star" / "Unstar" menu item (based on focused item's `starred` state).
- New prop: `isFocusedStarred: boolean`, `onToggleStar: () => void`.

### ExplorerRoot.tsx:
- Add `handleToggleStar(itemId, starred)` callback that calls `window.gsync.db.updateStarred(itemId, starred)`.
- Pass it down to ListView, GridView, and ContextMenu.

### DetailsPanel.tsx:
- Add a clickable star icon next to the file name.
- New prop: `onToggleStar?: (itemId: string, starred: boolean) => void`.
- Wired from `App.tsx` (or through ExplorerRoot's existing `onSelectedItemChange` pattern).

---

## Step 7: Download — Drive API `downloadFile()`

**File:** `src/main/drive/driveApi.ts`

- Add new function `downloadFileContent(fileId: string): Promise<{ stream: ReadableStream, size?: number }>` — actually, since Node.js `fetch` in Electron returns a `Response`, we'll return the `Response` object directly.
- Actually, better approach: `downloadFileBuffer(fileId: string): Promise<Buffer>` using `res.arrayBuffer()` → `Buffer.from()`. For files under ~200MB this is fine; large files would need streaming but that's future work.
- Endpoint: `GET /drive/v3/files/{fileId}?alt=media&supportsAllDrives=true` with auth headers.
- Google Workspace files (Docs/Sheets/Slides) use `export` endpoint instead: `GET /drive/v3/files/{fileId}/export?mimeType=application/pdf` (export as PDF).
- Wrap with `throttledDriveCall()` for rate limiting.

---

## Step 8: Download — Single File IPC + Save Dialog

**Files:** `src/main/index.ts`, `src/preload/index.ts`

- **index.ts**: New IPC handler `ops:downloadFile`:
  1. Takes `{ fileId: string, fileName: string, mimeType: string }`.
  2. Shows `dialog.showSaveDialog()` with `defaultPath: fileName` and appropriate file filter.
  3. If user picks a path, calls `downloadFileBuffer(fileId)` (or export for Google Workspace files).
  4. Writes buffer to disk with `fs.writeFile()`.
  5. Returns `{ success: true, path }` or `{ success: false, error }`.
  6. Sends progress events via `sendToRenderer('download:progress', ...)` (start/complete/error).
- **preload/index.ts**: Add `ops.downloadFile(args)` bridge method + `ops.onDownloadProgress` listener.

---

## Step 9: Download — Multi-Select Zip Archive

**Dependencies:** Install `archiver` package (`npm install archiver` + `npm install -D @types/archiver`).

**File:** `src/main/download/zipDownloader.ts` (new file)

- Function `downloadAsZip(items: Array<{fileId, fileName, mimeType}>, destPath: string): Promise<void>`:
  1. Creates a write stream to `destPath`.
  2. Creates an `archiver('zip', { zlib: { level: 5 } })` instance.
  3. Pipes archiver to write stream.
  4. For each item: downloads buffer via `downloadFileBuffer()`, appends to archive as `archiver.append(buffer, { name: fileName })`.
  5. Finalizes archive.
  6. Emits progress events (item count / total).

**File:** `src/main/index.ts`

- New IPC handler `ops:downloadZip`:
  1. Takes `{ items: Array<{fileId, fileName, mimeType}> }`.
  2. Shows `dialog.showSaveDialog()` with filter `*.zip`.
  3. Calls `downloadAsZip()`.
  4. Returns result.

**File:** `src/preload/index.ts`

- Add `ops.downloadZip(args)` bridge method.

---

## Step 10: Download — UI Integration

**Files:** `ContextMenu.tsx`, `ExplorerRoot.tsx`, `ListView.tsx`, `GridView.tsx`

### ContextMenu.tsx:
- Add "Download" menu item (enabled when `selectedCount >= 1`).
- For single file: calls `onDownload()`. For multiple: calls `onDownloadZip()`.
- New prop: `onDownload: () => void`.

### ExplorerRoot.tsx:
- Add `handleDownload()` callback:
  - If 1 item selected and it's a file: calls `window.gsync.ops.downloadFile(...)`.
  - If multiple selected: gathers file info, calls `window.gsync.ops.downloadZip(...)`.
  - Folders in multi-select: skip for now (note: Google Drive API doesn't support folder download directly; would need recursive fetch — mark as future enhancement).
- Pass `onDownload` to ContextMenu.

### Selection Action Bar (new inline component in ExplorerRoot):
- When `selection.selectedIds.size > 0`, show a floating action bar above the content area.
- Shows: `"X selected"` + "Download Selected" button + "Clear Selection" button.
- Positioned as a sticky bar below the breadcrumbs area.

---

## Step 11: Build & Verify

- Run `npm install archiver && npm install -D @types/archiver`.
- Run `npx electron-vite build` to verify zero TypeScript errors.

---

## File Summary

| # | File | Action |
|---|------|--------|
| 1 | `package.json` | Bump to 1.0.0 |
| 2 | `src/main/db/settingsStore.ts` | Add `last_seen_version` default |
| 3 | `src/renderer/src/components/PatchNotesModal.tsx` | **NEW** — modal component |
| 4 | `src/renderer/src/App.tsx` | Wire patch notes modal |
| 5 | `src/main/db/queryLayer.ts` | Add `updateStarred()` |
| 6 | `src/main/drive/driveApi.ts` | Add `downloadFileBuffer()` + `exportFileBuffer()` |
| 7 | `src/main/index.ts` | Add `db:updateStarred`, `ops:downloadFile`, `ops:downloadZip` handlers |
| 8 | `src/preload/index.ts` | Add bridge methods for star, download, downloadZip |
| 9 | `src/main/download/zipDownloader.ts` | **NEW** — zip archive utility |
| 10 | `src/renderer/src/components/explorer/ContextMenu.tsx` | Add Star + Download items |
| 11 | `src/renderer/src/components/explorer/ListView.tsx` | Add star icon button |
| 12 | `src/renderer/src/components/explorer/GridView.tsx` | Add star icon button |
| 13 | `src/renderer/src/components/explorer/ExplorerRoot.tsx` | Wire star toggle, download, selection bar |
| 14 | `src/renderer/src/components/layout/DetailsPanel.tsx` | Add star toggle |
| 15 | `src/renderer/src/App.tsx` | Wire star callback to DetailsPanel |
