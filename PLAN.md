# Plan: Subscription & Storage Plans

## Overview
Add a "Subscription & Storage" section to the Settings panel that shows the user's current Google Drive plan, storage usage, and links to upgrade via Google One.

## Steps

### Step 1 — Drive API: Add `about.get` endpoint (`driveApi.ts`)
- Add `DriveAboutInfo` interface (user + storageQuota shape)
- Add `getAboutInfo()` function using `driveGet<DriveAboutInfo>('/about', { fields: '...' })`
- Add `StoragePlanInfo` interface (renderer-friendly: planName, limitBytes, usageBytes, etc.)
- Add `resolveStoragePlan()` pure function: maps `storageQuota.limit` → plan name
  - 15 GB → Free, 100 GB → Basic, 200 GB → Standard, 2 TB → Premium
  - `undefined` limit → "Unlimited (Workspace)", unknown values → "Custom"

### Step 2 — IPC handler (`index.ts`)
- Import `getAboutInfo`, `resolveStoragePlan` from driveApi
- Add `ipcMain.handle('drive:getStoragePlan', async () => { ... })` — no args, returns `StoragePlanInfo`

### Step 3 — Preload bridge (`preload/index.ts`)
- Add `getStoragePlan` to the `drive` namespace:
  ```ts
  getStoragePlan: (): Promise<StoragePlanBridge> => ipcRenderer.invoke('drive:getStoragePlan')
  ```
- `StoragePlanBridge`: { planName, limitBytes, usageBytes, usageInDriveBytes, usageInDriveTrashBytes, userName, userEmail, userPhoto? }

### Step 4 — Settings UI (`SettingsPanel.tsx`)
Add a **"Subscription & Storage"** section as the **first section** (before Appearance). Contains:

1. **Account row** — user photo (circle), display name, email
2. **Current plan** — Crown icon + plan name (e.g., "Google One Basic — 100 GB")
3. **Storage usage bar** — horizontal bar with percentage, color-coded:
   - Green (<70%), Amber (70-90%), Red (>90%)
   - Shows "X.X GB of Y GB used"
4. **Usage breakdown** — two-column: Drive usage + Trash usage
5. **Plan tiers grid** — only shown for Free/Basic/Standard users. Shows available upgrade tiers with storage amounts
6. **"Manage Storage" button** — opens `https://one.google.com/about/plans` in default browser (uses existing `shell.openExternal` via `setWindowOpenHandler`)

Loading state: spinner while fetching.
Error state: "Connect to Google Drive to view storage info" when not authenticated or API fails.

## Files Modified
| File | Change |
|------|--------|
| `src/main/drive/driveApi.ts` | Add `getAboutInfo()`, `resolveStoragePlan()`, types |
| `src/main/index.ts` | Add `drive:getStoragePlan` IPC handler |
| `src/preload/index.ts` | Add `getStoragePlan` to drive namespace |
| `src/renderer/src/components/SettingsPanel.tsx` | Add Subscription & Storage section |
