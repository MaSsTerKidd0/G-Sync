# G-Sync — Claude Code Project Guide

## Overview
Google Drive sync desktop app built with **Electron 39 + React 19 + TypeScript 5.9 + Tailwind CSS 4**.
Bundled with **electron-vite**. Local DB via **better-sqlite3** (WAL mode). Rate-limited Drive API via **Bottleneck**.

## Architecture

```
src/
├── main/                     # Electron main process
│   ├── index.ts              # App entry, IPC handlers, window creation
│   ├── auth/                 # OAuth 2.0 PKCE (googleOAuth.ts, tokenStore.ts)
│   ├── db/                   # SQLite: database.ts, migrations.ts, queryLayer.ts,
│   │                         #   syncWriter.ts, syncState.ts, settingsStore.ts, backup.ts
│   ├── drive/                # Drive API client (driveApi.ts) + rateLimiter.ts (Bottleneck)
│   ├── sync/                 # syncEngine.ts — snapshot → catchup → incremental polling
│   ├── ops/                  # Durable ops queue (opsQueue.ts, opsWorker.ts)
│   ├── download/             # zipDownloader.ts (archiver)
│   ├── cleanup/              # Smart tools: duplicate groups, large files, storage breakdown
│   ├── thumbnails/           # Proxied thumbnail fetcher
│   ├── ipc/                  # validate.ts — input assertion helpers
│   └── security/             # selfAudit.ts
├── preload/
│   └── index.ts              # contextBridge → window.gsync.{auth,sync,db,explorer,ops,cleanup,settings}
└── renderer/src/
    ├── App.tsx               # Root: auth, sync, view routing, patch notes modal
    ├── types/explorer.ts     # DriveItemDTO, DriveItemRow, rowToDTO, SelectionState
    ├── context/ThemeContext   # light / dark / system
    ├── hooks/                # useExplorerData (SWR), useSelection, useThumbnail, useOpsStatus
    └── components/
        ├── layout/           # Sidebar, TopBar, StatusBar, DetailsPanel
        ├── explorer/         # ExplorerRoot, ListView, GridView, ContextMenu, ConfirmDialog,
        │                     #   DroppableBreadcrumb, DragOverlayContent, InlineRename,
        │                     #   OpsStatusBar, OpsPanel
        ├── cleanup/          # CleanupDashboard, DuplicatesTab, LargeFilesTab, StorageTab
        ├── PatchNotesModal.tsx
        └── SettingsPanel.tsx
```

## Key Patterns
- **IPC bridge**: All renderer ↔ main communication through `window.gsync.*` (typed in preload/index.ts)
- **DB migrations**: Incremental `migrateV1()..migrateV6()` in migrations.ts; bump `user_version` pragma
- **Settings KV store**: `settings` table with `getSetting(key)`/`setSetting(key,val)`; defaults in DEFAULTS
- **Sync pipeline**: `syncEngine.start()` → snapshot (files.list) → catchup (changes.list) → incremental polling
- **Ops queue**: Durable pending_ops table, background worker with retry/backoff, optimistic UI updates
- **Rate limiter**: Bottleneck at 10 req/sec + exponential backoff on 429/5xx
- **Virtualization**: TanStack Virtual for ListView (44px rows) and GridView (200×180 cards)
- **DnD**: @dnd-kit/core for drag-and-drop move operations
- **Portals**: ContextMenu + modals render via `createPortal(jsx, document.body)`

## Build Commands
```bash
npx electron-vite build          # Build (no typecheck)
npm run build                    # Typecheck + build
npm run dev                      # Dev mode with HMR
```

## Current Version: 1.0.0
Phases 1-10 complete. See TASKS.md for current session work.

## Coding Standards
- TypeScript strict mode; no `any` unless unavoidable
- Tailwind CSS 4 utility classes (with `@tailwindcss/vite` plugin)
- lucide-react for icons
- Prefer `useCallback`/`useMemo` for prop stability
- IPC handlers validate args via `assert*` helpers from `ipc/validate.ts`
- Fire-and-forget pattern for non-critical Drive API sync-backs (e.g., star toggle)
