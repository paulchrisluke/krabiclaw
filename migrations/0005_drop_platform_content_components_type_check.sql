-- Migration number: 0005

-- platform_content_components.type was created with CHECK (type IN ('faq', 'how_to')),
-- contradicting the schema-forward decision to validate component types at the
-- app level (PLATFORM_CONTENT_COMPONENT_TYPES / assertValidComponentType in
-- server/utils/platform-content.ts) so new component types don't require a migration.
-- SQLite has no ALTER TABLE DROP CONSTRAINT, so the table must be rebuilt.
-- PRAGMA foreign_keys=OFF is a no-op inside the transaction wrangler wraps
-- each migration in; defer_foreign_keys is the transaction-scoped equivalent
-- (FK checks run at COMMIT instead of being suppressed entirely).
PRAGMA defer_foreign_keys=ON;

CREATE TABLE platform_content_components_new (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL CHECK (content_type IN ('blog_post', 'doc')),
  content_id TEXT NOT NULL,
  type TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  render_enabled INTEGER NOT NULL DEFAULT 1,
  schema_enabled INTEGER NOT NULL DEFAULT 1,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO platform_content_components_new
  SELECT id, content_type, content_id, type, position, label, status, render_enabled, schema_enabled, data_json, created_at, updated_at
  FROM platform_content_components;

DROP TABLE platform_content_components;
ALTER TABLE platform_content_components_new RENAME TO platform_content_components;

CREATE INDEX IF NOT EXISTS idx_platform_content_components_content
  ON platform_content_components(content_type, content_id, position);
