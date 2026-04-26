# G-Sync Backlog

Living document — features, fixes, and chores grouped by **target version**.
Promote items to a numbered version section once they're scheduled. Move
shipped items into `CHANGELOG.md` as part of the release commit.

> **How to use:** When you start a new branch, the item moves from a
> checkbox in this file to its own GitHub issue. When the PR merges, the
> item is removed here and added to `CHANGELOG.md` under `[Unreleased]`.

---

## v1.1.0 — Hardening *(in progress)*

- [x] Fix synced-folder no-op CASE bug (#2)
- [x] Preserve conflict status across local edits (#6)
- [x] Remove token fragments from Photos logs (#10)
- [x] Fix Photos API indentation (#11)
- [x] Expand `guessMimeType` coverage (#12)
- [x] Drop Photos tab (Google API deprecated)
- [x] Force re-login on first launch when OAuth scopes change
- [ ] Conflict resolution UI (keep-local / keep-remote / keep-both dialog)
- [ ] Selective sync rules (per-folder include/exclude patterns)

## v1.2.0 — Power user

- [ ] Command palette (Ctrl+K) — fuzzy file search and action launcher
- [ ] Multi-account support — sign in to multiple Google accounts and switch
- [ ] Activity log view — chronological feed of every sync, upload, delete
- [ ] File preview pane — images, PDF, plain text without downloading
- [ ] Google Photos via Picker API (revisit the v1.1.0 drop)

## v1.3.0 — Release readiness

- [ ] Submit Google OAuth verification (gets us off "local-only practice")
- [ ] Inno Setup installer build
- [ ] Code-signing certificate (removes SmartScreen "Unknown publisher")
- [ ] `electron-updater` auto-update channel against GitHub Releases
- [ ] CI: GitHub Actions workflow running `npm run typecheck` on every PR
- [ ] Pin Node version (`.nvmrc` + `engines` in `package.json`)

## Backlog *(unscheduled — promote when ready)*

### Sync correctness
- [ ] Drive folder reuse-by-name on synced-folder re-add (#3)
- [ ] Hash-based conflict detection instead of mtime-based (#4)
- [ ] Drive folder placement — let user pick parent folder for synced folder (#7)

### Auth / OAuth
- [ ] Validate granted scopes at runtime, surface missing scopes to UI (#8)
- [ ] Surface revoked-token state in UI, not just silent clear (#9)
- [ ] Backoff on token refresh failures (#13)

### UX / Polish
- [ ] i18n — Hebrew + English at minimum
- [ ] Bandwidth throttling / sync schedule — pause during work hours
- [ ] Folder color coding (Drive-native feature)
- [ ] Drag-and-drop upload from OS file explorer → Drive folder
- [ ] Keyboard shortcut customization

### Platform
- [ ] macOS build (electron-builder mac target + notarization)
- [ ] Linux build (AppImage / snap / deb already in `electron-builder.yml`)

---

## Known limitations carried from v1.0.0

These ship in v1.1.0 unchanged — they're tracked here to keep them visible
until they're addressed in v1.3.0.

- Not OAuth-verified with Google → "local-only practice" disclaimer in app.
- Windows-only build (no signed macOS / Linux installers yet).
- Auto-update channel disabled (`electron-builder.yml` `publish:` is commented
  out). Updates are manual until v1.3.0.
- Unsigned executable → Windows SmartScreen shows "Unknown publisher" on
  first run.
