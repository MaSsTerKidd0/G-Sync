import { getDb } from './database'

export function runMigrations(): void {
  const db = getDb()
  const currentVersion = db.pragma('user_version', { simple: true }) as number
  console.log('[db] Current schema version:', currentVersion)

  if (currentVersion < 1) {
    migrateV1()
  }
  if (currentVersion < 2) {
    migrateV2()
  }
  if (currentVersion < 3) {
    migrateV3()
  }
  if (currentVersion < 4) {
    migrateV4()
  }
  if (currentVersion < 5) {
    migrateV5()
  }
  if (currentVersion < 6) {
    migrateV6()
  }
  if (currentVersion < 7) {
    migrateV7()
  }

  console.log('[db] Migrations complete — schema version:', db.pragma('user_version', { simple: true }))
}

function migrateV1(): void {
  const db = getDb()
  console.log('[db] Applying migration v1: Phase 2 schema')

  db.transaction(() => {
    // ── drive_items: unified files + folders table ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS drive_items (
        id                          TEXT PRIMARY KEY,
        drive_id                    TEXT,
        name                        TEXT NOT NULL COLLATE NOCASE,
        mime_type                   TEXT NOT NULL,
        is_folder                   INTEGER NOT NULL DEFAULT 0,
        parent_count                INTEGER NOT NULL DEFAULT 0,

        trashed                     INTEGER NOT NULL DEFAULT 0,
        explicitly_trashed          INTEGER NOT NULL DEFAULT 0,

        created_time_ms             INTEGER,
        modified_time_ms            INTEGER,
        viewed_by_me_time_ms        INTEGER,
        shared_with_me_time_ms      INTEGER,

        size_bytes                  INTEGER,
        resource_key                TEXT,

        shortcut_target_id          TEXT,
        shortcut_target_resource_key TEXT,

        can_move_within_drive       INTEGER,
        can_delete                  INTEGER,
        can_trash                   INTEGER,

        is_removed                  INTEGER NOT NULL DEFAULT 0,
        removed_time_ms             INTEGER,

        local_dirty                 INTEGER NOT NULL DEFAULT 0
      )
    `)

    // ── item_parents: supports multiple parents ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS item_parents (
        child_id    TEXT NOT NULL,
        parent_id   TEXT NOT NULL,
        is_primary  INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (child_id, parent_id),
        FOREIGN KEY (child_id)  REFERENCES drive_items(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES drive_items(id) ON DELETE CASCADE
      )
    `)

    // ── permissions (populated lazily) ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS permissions (
        id                  TEXT PRIMARY KEY,
        type                TEXT NOT NULL,
        role                TEXT NOT NULL,
        email_address       TEXT,
        domain              TEXT,
        allow_file_discovery INTEGER,
        expiration_time_ms  INTEGER,
        deleted             INTEGER,
        view                TEXT
      )
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS item_permissions (
        item_id       TEXT NOT NULL,
        permission_id TEXT NOT NULL,
        PRIMARY KEY (item_id, permission_id),
        FOREIGN KEY (item_id)       REFERENCES drive_items(id)  ON DELETE CASCADE,
        FOREIGN KEY (permission_id) REFERENCES permissions(id)  ON DELETE CASCADE
      )
    `)

    // ── changes_log: audit trail ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS changes_log (
        seq             INTEGER PRIMARY KEY AUTOINCREMENT,
        scope           TEXT NOT NULL,
        change_type     TEXT NOT NULL,
        file_id         TEXT,
        drive_id        TEXT,
        removed         INTEGER NOT NULL DEFAULT 0,
        change_time_ms  INTEGER,
        applied_at_ms   INTEGER NOT NULL,
        raw_json        TEXT
      )
    `)

    // ── sync_state: crash-safe checkpointing ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_state (
        scope                     TEXT PRIMARY KEY,
        phase                     TEXT NOT NULL,
        snapshot_started_at_ms    INTEGER,
        snapshot_completed_at_ms  INTEGER,

        start_page_token          TEXT,
        resume_page_token         TEXT,

        last_success_at_ms        INTEGER,
        last_error_at_ms          INTEGER,
        last_error_code           TEXT,
        last_error_message        TEXT
      )
    `)

    // ── pending_ops: optimistic UI queue (future-proofing for Phase 4) ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS pending_ops (
        op_id             TEXT PRIMARY KEY,
        op_type           TEXT NOT NULL,
        file_id           TEXT NOT NULL,
        payload_json      TEXT NOT NULL,
        rollback_json     TEXT NOT NULL,
        status            TEXT NOT NULL,
        attempt_count     INTEGER NOT NULL DEFAULT 0,
        next_retry_at_ms  INTEGER,
        last_error_code   TEXT,
        last_error_message TEXT,
        created_at_ms     INTEGER NOT NULL,
        updated_at_ms     INTEGER NOT NULL,
        FOREIGN KEY (file_id) REFERENCES drive_items(id) ON DELETE CASCADE
      )
    `)

    // ── Indexes ──
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_item_parents_parent
        ON item_parents(parent_id);

      CREATE INDEX IF NOT EXISTS idx_item_parents_child
        ON item_parents(child_id);

      CREATE INDEX IF NOT EXISTS idx_drive_items_name_nocase
        ON drive_items(name COLLATE NOCASE);

      CREATE INDEX IF NOT EXISTS idx_drive_items_modified_time
        ON drive_items(modified_time_ms);

      CREATE INDEX IF NOT EXISTS idx_drive_items_active_modified
        ON drive_items(modified_time_ms)
        WHERE trashed = 0 AND is_removed = 0;
    `)

    db.pragma('user_version = 1')
  })()

  console.log('[db] Migration v1 applied')
}

function migrateV2(): void {
  const db = getDb()
  console.log('[db] Applying migration v2: Phase 3 thumbnail + explorer columns')

  db.transaction(() => {
    // ── Add thumbnail & icon columns to drive_items ──
    db.exec(`ALTER TABLE drive_items ADD COLUMN icon_link TEXT`)
    db.exec(`ALTER TABLE drive_items ADD COLUMN has_thumbnail INTEGER NOT NULL DEFAULT 0`)
    db.exec(`ALTER TABLE drive_items ADD COLUMN thumbnail_version TEXT`)

    // ── Composite index for keyset pagination on (parent_id, child sorted by name) ──
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_item_parents_parent_child
      ON item_parents(parent_id, child_id);
    `)

    // ── Composite index for keyset by size ──
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_items_size
      ON drive_items(size_bytes);
    `)

    db.pragma('user_version = 2')
  })()

  console.log('[db] Migration v2 applied')
}

function migrateV3(): void {
  const db = getDb()
  console.log('[db] Applying migration v3: Phase 4 durable ops queue + optimistic markers')

  db.transaction(() => {
    // ── Drop the Phase 2 placeholder pending_ops table and recreate with full schema ──
    db.exec(`DROP TABLE IF EXISTS pending_ops`)

    db.exec(`
      CREATE TABLE IF NOT EXISTS pending_ops (
        op_id              TEXT PRIMARY KEY,
        created_at_ms      INTEGER NOT NULL,
        updated_at_ms      INTEGER NOT NULL,

        -- Ordering & grouping
        user_seq           INTEGER NOT NULL,
        batch_id           TEXT,

        -- Operation intent
        op_type            TEXT NOT NULL,
        file_id            TEXT NOT NULL,

        -- Drive API request shape
        request_json       TEXT NOT NULL,

        -- Optimistic + rollback
        optimistic_json    TEXT NOT NULL,
        rollback_json      TEXT NOT NULL,

        -- State machine
        status             TEXT NOT NULL,
        locked_by          TEXT,
        lock_expires_at_ms INTEGER,

        -- Retry control
        attempt_count      INTEGER NOT NULL DEFAULT 0,
        next_retry_at_ms   INTEGER NOT NULL DEFAULT 0,
        last_error_code    TEXT,
        last_error_message TEXT,

        -- Remote correlation
        remote_http_status INTEGER,
        remote_response_json TEXT
      )
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pending_ops_status_retry
      ON pending_ops(status, next_retry_at_ms, user_seq)
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pending_ops_file
      ON pending_ops(file_id)
    `)

    // ── Add optimistic markers to drive_items ──
    // local_dirty already exists from v1, add pending_op_id and last_local_change_ms
    db.exec(`ALTER TABLE drive_items ADD COLUMN pending_op_id TEXT`)
    db.exec(`ALTER TABLE drive_items ADD COLUMN last_local_change_ms INTEGER`)

    db.pragma('user_version = 3')
  })()

  console.log('[db] Migration v3 applied')
}

function migrateV4(): void {
  const db = getDb()
  console.log('[db] Applying migration v4: Phase 5 checksums, fingerprints, hashes, cleanup review')

  db.transaction(() => {
    // ── Add checksum columns to drive_items ──
    db.exec(`ALTER TABLE drive_items ADD COLUMN md5_checksum TEXT`)
    db.exec(`ALTER TABLE drive_items ADD COLUMN sha256_checksum TEXT`)
    db.exec(`ALTER TABLE drive_items ADD COLUMN sha1_checksum TEXT`)

    // ── file_fingerprints: normalized metadata for duplicate grouping ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS file_fingerprints (
        file_id             TEXT PRIMARY KEY,
        name_norm           TEXT NOT NULL,
        size_bytes          INTEGER,
        mime_type           TEXT NOT NULL,
        is_shortcut         INTEGER NOT NULL DEFAULT 0,
        shortcut_target_id  TEXT,
        updated_at_ms       INTEGER NOT NULL,
        FOREIGN KEY (file_id) REFERENCES drive_items(id) ON DELETE CASCADE
      )
    `)

    // ── file_hashes: checksum records (from Drive or local) ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS file_hashes (
        file_id         TEXT NOT NULL,
        algo            TEXT NOT NULL,
        source          TEXT NOT NULL,
        digest_hex      TEXT NOT NULL,
        computed_at_ms  INTEGER NOT NULL,
        bytes_hashed    INTEGER,
        PRIMARY KEY (file_id, algo, source),
        FOREIGN KEY (file_id) REFERENCES drive_items(id) ON DELETE CASCADE
      )
    `)

    // ── cleanup_review: review session for batch cleanup ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS cleanup_review (
        review_id         TEXT PRIMARY KEY,
        kind              TEXT NOT NULL,
        status            TEXT NOT NULL DEFAULT 'draft',
        query_params_json TEXT,
        created_at_ms     INTEGER NOT NULL,
        updated_at_ms     INTEGER NOT NULL
      )
    `)

    // ── cleanup_review_items: per-file decisions within a review ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS cleanup_review_items (
        review_id   TEXT NOT NULL,
        file_id     TEXT NOT NULL,
        decision    TEXT NOT NULL DEFAULT 'skip',
        notes       TEXT,
        PRIMARY KEY (review_id, file_id),
        FOREIGN KEY (review_id) REFERENCES cleanup_review(review_id) ON DELETE CASCADE,
        FOREIGN KEY (file_id)   REFERENCES drive_items(id) ON DELETE CASCADE
      )
    `)

    // ── Partial indexes for fast queries ──
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_items_size_active
      ON drive_items(size_bytes)
      WHERE size_bytes IS NOT NULL AND trashed = 0 AND is_removed = 0
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_fp_name_size
      ON file_fingerprints(name_norm, size_bytes)
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_hash_algo_digest
      ON file_hashes(algo, digest_hex)
    `)

    db.pragma('user_version = 4')
  })()

  console.log('[db] Migration v4 applied')
}

function migrateV5(): void {
  const db = getDb()
  console.log('[db] Applying migration v5: Phase 6 folder_rollups for graph view')

  db.transaction(() => {
    // ── folder_rollups: cached descendant aggregates for graph clustering + treemap ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS folder_rollups (
        folder_id       TEXT PRIMARY KEY,
        total_items     INTEGER NOT NULL DEFAULT 0,
        total_bytes     INTEGER NOT NULL DEFAULT 0,
        computed_at_ms  INTEGER NOT NULL,
        FOREIGN KEY (folder_id) REFERENCES drive_items(id) ON DELETE CASCADE
      )
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_rollups_bytes
      ON folder_rollups(total_bytes DESC)
    `)

    db.pragma('user_version = 5')
  })()

  console.log('[db] Migration v5 applied')
}

function migrateV6(): void {
  const db = getDb()
  console.log('[db] Applying migration v6: starred column + settings table')

  db.transaction(() => {
    // ── Add starred column to drive_items ──
    db.exec(`ALTER TABLE drive_items ADD COLUMN starred INTEGER NOT NULL DEFAULT 0`)

    // ── Partial index for fast starred queries ──
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_drive_items_starred
      ON drive_items(starred)
      WHERE starred = 1 AND trashed = 0 AND is_removed = 0
    `)

    // ── Settings key-value table ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)

    // ── Seed default settings ──
    db.exec(`
      INSERT OR IGNORE INTO settings (key, value) VALUES
        ('polling_interval_ms', '30000'),
        ('keep_signed_in', 'true'),
        ('ignore_hidden_files', 'false'),
        ('notify_on_sync_complete', 'true')
    `)

    db.pragma('user_version = 6')
  })()

  console.log('[db] Migration v6 applied')
}

function migrateV7(): void {
  const db = getDb()
  console.log('[db] Applying migration v7: synced_folders + synced_files tables')

  db.transaction(() => {
    // ── synced_folders: tracks local folders being synced to Google Drive ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS synced_folders (
        id                TEXT PRIMARY KEY,
        local_path        TEXT NOT NULL UNIQUE,
        drive_folder_id   TEXT,
        drive_folder_name TEXT,
        status            TEXT NOT NULL DEFAULT 'idle',
        last_sync_ms      INTEGER,
        last_error        TEXT,
        created_at_ms     INTEGER NOT NULL
      )
    `)

    // ── synced_files: individual file sync tracking per folder ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS synced_files (
        id                TEXT PRIMARY KEY,
        folder_id         TEXT NOT NULL,
        relative_path     TEXT NOT NULL,
        local_hash        TEXT,
        local_modified_ms INTEGER,
        local_size_bytes  INTEGER,
        drive_file_id     TEXT,
        drive_modified_ms INTEGER,
        drive_hash        TEXT,
        sync_status       TEXT NOT NULL DEFAULT 'pending',
        last_error        TEXT,
        UNIQUE(folder_id, relative_path),
        FOREIGN KEY (folder_id) REFERENCES synced_folders(id) ON DELETE CASCADE
      )
    `)

    // ── Indexes ──
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_synced_files_folder
      ON synced_files(folder_id);

      CREATE INDEX IF NOT EXISTS idx_synced_files_status
      ON synced_files(sync_status);
    `)

    db.pragma('user_version = 7')
  })()

  console.log('[db] Migration v7 applied')
}
