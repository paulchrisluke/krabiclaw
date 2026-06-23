ALTER TABLE platform_blog_posts ADD COLUMN seo_description TEXT;
ALTER TABLE platform_blog_posts ADD COLUMN seo_keywords TEXT;
ALTER TABLE platform_blog_posts ADD COLUMN canonical_url TEXT;
ALTER TABLE platform_blog_posts ADD COLUMN robots TEXT;

ALTER TABLE platform_docs ADD COLUMN seo_description TEXT;
ALTER TABLE platform_docs ADD COLUMN seo_keywords TEXT;
ALTER TABLE platform_docs ADD COLUMN canonical_url TEXT;
ALTER TABLE platform_docs ADD COLUMN robots TEXT;

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

CREATE INDEX idx_platform_content_components_content
  ON platform_content_components(content_type, content_id, position);
