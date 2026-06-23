-- Migration number: 0009 	 2026-06-23T12:31:03.445Z

PRAGMA defer_foreign_keys=ON;

-- Rename the existing table
ALTER TABLE media_assets RENAME TO media_assets_pre_delete_pending;

-- Recreate with 'delete_pending' added to the status CHECK constraint, so a
-- failed Cloudflare Images/R2 delete leaves the row in a retryable state
-- instead of being marked 'deleted' while the underlying file is still live.
CREATE TABLE media_assets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  location_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'video', 'file')),
  provider TEXT NOT NULL CHECK (provider IN ('cloudflare_images', 'cloudflare_r2', 'google_business', 'external_url', 'chowbot')),
  source TEXT NOT NULL CHECK (source IN ('uploaded', 'google_sync', 'generated', 'external')),
  cloudflare_image_id TEXT,
  r2_key TEXT,
  google_media_name TEXT,
  public_url TEXT,
  thumbnail_url TEXT,
  mime_type TEXT,
  file_name TEXT,
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  duration INTEGER,
  alt_text TEXT,
  category TEXT CHECK (category IN ('exterior', 'interior', 'food', 'menu', 'team', 'other', 'logo')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'deleted', 'failed', 'delete_pending')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES business_locations(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES user(id) ON DELETE SET NULL
);

INSERT INTO media_assets (
  id, organization_id, site_id, location_id, kind, provider, source,
  cloudflare_image_id, r2_key, google_media_name,
  public_url, thumbnail_url, mime_type, file_name, file_size,
  width, height, duration, alt_text, category, status, created_by_user_id, created_at, updated_at
)
SELECT
  id, organization_id, site_id, location_id, kind, provider, source,
  cloudflare_image_id, r2_key, google_media_name,
  public_url, thumbnail_url, mime_type, file_name, file_size,
  width, height, duration, alt_text, category, status, created_by_user_id, created_at, updated_at
FROM media_assets_pre_delete_pending;

DROP TABLE media_assets_pre_delete_pending;

-- Recreate indexes
CREATE INDEX idx_media_assets_location
  ON media_assets(location_id, status, created_at DESC)
  WHERE location_id IS NOT NULL;
CREATE INDEX idx_media_assets_site
  ON media_assets(site_id, status, created_at DESC);
