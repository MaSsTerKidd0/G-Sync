# Changelog

All notable changes to G-Sync are documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
and the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

## [Unreleased]

## [1.1.0] — 2026-04-26

### Removed
- **Google Photos tab.** Google's March 2025 policy change limited the Photos
  Library API so third-party apps can no longer enumerate a user's full library.
  The replacement (Photos Picker API) has fundamentally different UX and is
  deferred to a future release. The `photoslibrary.readonly` OAuth scope is no
  longer requested.

### Fixed
- **Synced files no longer spuriously re-queue for upload** when their content
  is unchanged. The `upsertSyncedFile` SQL had a no-op `CASE` branch that always
  evaluated to `'pending'` regardless of hash equality.
- **Conflict status is preserved across local edits.** Files marked
  `'conflict'` are no longer silently reverted to `'pending'` when the watcher
  picks up another change to the same file. The conflict marker now sticks
  until explicitly resolved.
- **Removed access-token fragments from log output** in the Photos API client.
  Even partial bearer tokens should never be logged in production. Remaining
  diagnostic output is gated behind `GSYNC_DEBUG=1`.
- **Cleaned up indentation** inside the Photos API client (cosmetic, but it
  was making code review harder).

### Added
- **Expanded MIME-type map** for synced-folder uploads:
  HEIC, HEIF, MOV, MKV, M4A, M4V, AVI, FLAC, AAC, OGG, WMA, AVIF, BMP, TIFF,
  YAML, TOML. Files in these formats now upload with the correct `Content-Type`
  so Drive can generate previews — previously they were sent as
  `application/octet-stream` and showed up in Drive without a thumbnail.
  Major win for iPhone camera-roll uploads.
- **Force re-login on first launch after a scope change.** A new
  `last_login_version` setting tracks which app version minted the stored
  tokens; when the OAuth scope set changes between releases, existing tokens
  are wiped on the next status check and the user is asked to re-consent.

### Notes for users upgrading from v1.0.0
- You will be signed out and asked to log in again on first launch. This is
  intentional — your previous tokens still carried the now-removed Photos
  scope, and we replace them rather than keep stale grants.
- The "Photos" item is gone from the sidebar. All your image and video files
  remain visible inside **My Drive**.

## [1.0.0] — 2026-04-26

First public practice release. Local-only — not yet OAuth-verified with
Google. See `BACKLOG.md` for the v1.0.0 known limitations.

### Added
- Google Drive sync engine (snapshot → catch-up → incremental polling).
- **Syncable Folders**: two-way local ↔ Drive folder sync via chokidar.
- File explorer with virtualized list/grid, drag-and-drop, inline rename.
- Trash-first delete flow, dedicated Trash view, capability guards.
- Sharing tab + share dialog. Account profile menu with storage plan info.
- Smart cleanup tools: duplicate finder, large-file browser, storage breakdown.
- Star/unstar, single-file & multi-select zip downloads.
- Light / dark / system themes (Google-style palette).
- Skeleton loaders, durable ops queue with retry/backoff, rate-limited Drive
  client (Bottleneck @ 10 req/s with exponential backoff on 429/5xx).

[Unreleased]: https://github.com/MaSsTerKidd0/G-Sync/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/MaSsTerKidd0/G-Sync/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/MaSsTerKidd0/G-Sync/releases/tag/v1.0.0
