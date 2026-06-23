PRAGMA defer_foreign_keys=ON;

-- Rename the existing table
ALTER TABLE platform_content_components RENAME TO platform_content_components_old;

-- Create the new table with the CHECK constraint
CREATE TABLE platform_content_components (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL CHECK (content_type IN ('blog_post', 'doc')),
  content_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('faq', 'how_to')),
  position INTEGER NOT NULL DEFAULT 0,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  render_enabled INTEGER NOT NULL DEFAULT 1,
  schema_enabled INTEGER NOT NULL DEFAULT 1,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Copy data from old table to new table
INSERT INTO platform_content_components (
  id, content_type, content_id, type, position, label, status, render_enabled, schema_enabled, data_json, created_at, updated_at
)
SELECT id, content_type, content_id, type, position, label, status, render_enabled, schema_enabled, data_json, created_at, updated_at
FROM platform_content_components_old;

-- Drop the old table
DROP TABLE platform_content_components_old;

-- Recreate index
CREATE INDEX idx_platform_content_components_content
  ON platform_content_components(content_type, content_id, position);
