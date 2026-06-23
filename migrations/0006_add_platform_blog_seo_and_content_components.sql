ALTER TABLE platform_blog_posts ADD COLUMN seo_description TEXT;
ALTER TABLE platform_blog_posts ADD COLUMN seo_keywords TEXT;
ALTER TABLE platform_blog_posts ADD COLUMN canonical_url TEXT;
ALTER TABLE platform_blog_posts ADD COLUMN robots TEXT;

-- platform_docs already has seo_description/seo_keywords/canonical_url/robots
-- baked into the 0001_initial.sql squashed baseline (squash drift: only this
-- table picked them up, platform_blog_posts above did not), so adding them
-- again here would fail with "duplicate column name" on a fresh database.

CREATE TABLE platform_content_components (
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

CREATE INDEX idx_platform_content_components_content
  ON platform_content_components(content_type, content_id, position);
