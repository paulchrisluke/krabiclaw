-- Migration number: 0002 	 2026-06-24T06:05:01.477Z

-- Backfills production, which is missing these two tables entirely.
-- Root cause: repeated migration squashes left production's d1_migrations
-- bookkeeping pointing at an older "0001_initial.sql" (applied 2026-05-28)
-- that predates these tables. Because wrangler tracks applied migrations by
-- filename, re-running the current (re-squashed) 0001_initial.sql against
-- production is silently treated as already-applied and never executes —
-- `wrangler d1 migrations apply` reports "No migrations to apply!" even
-- though these tables don't exist. Staging already has both tables (created
-- there under their original pre-squash migration names), so IF NOT EXISTS
-- keeps this migration a safe no-op everywhere except production.
CREATE TABLE IF NOT EXISTS work_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT,
  type TEXT NOT NULL CHECK (type IN (
    'content_update', 'menu_update', 'translation', 'seo', 'google_business',
    'seasonal', 'photo_update', 'social_media', 'technical', 'other'
  )),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  source TEXT NOT NULL DEFAULT 'dashboard' CHECK (source IN ('dashboard', 'whatsapp', 'chowbot', 'admin')),
  notes TEXT,
  assigned_to TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_to) REFERENCES user(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_work_requests_org
  ON work_requests(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_requests_status
  ON work_requests(status, priority, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_content_components (
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
CREATE INDEX IF NOT EXISTS idx_platform_content_components_content
  ON platform_content_components(content_type, content_id, position);
