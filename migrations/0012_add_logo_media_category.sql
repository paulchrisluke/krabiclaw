PRAGMA foreign_keys=OFF;

ALTER TABLE media_assets RENAME TO media_assets_old;

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
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'deleted', 'failed')),
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
FROM media_assets_old;

DROP TABLE media_assets_old;

CREATE INDEX IF NOT EXISTS idx_media_assets_site
  ON media_assets(site_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_assets_location
  ON media_assets(location_id, status, created_at DESC)
  WHERE location_id IS NOT NULL;

PRAGMA foreign_keys=ON;
