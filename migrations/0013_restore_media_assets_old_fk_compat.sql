CREATE TABLE IF NOT EXISTS media_assets_old (
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
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

DELETE FROM media_assets_old;

INSERT INTO media_assets_old (
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
FROM media_assets;

DROP TRIGGER IF EXISTS sync_media_assets_old_insert;
CREATE TRIGGER sync_media_assets_old_insert
AFTER INSERT ON media_assets
BEGIN
  INSERT OR REPLACE INTO media_assets_old (
    id, organization_id, site_id, location_id, kind, provider, source,
    cloudflare_image_id, r2_key, google_media_name,
    public_url, thumbnail_url, mime_type, file_name, file_size,
    width, height, duration, alt_text, category, status, created_by_user_id, created_at, updated_at
  )
  VALUES (
    NEW.id, NEW.organization_id, NEW.site_id, NEW.location_id, NEW.kind, NEW.provider, NEW.source,
    NEW.cloudflare_image_id, NEW.r2_key, NEW.google_media_name,
    NEW.public_url, NEW.thumbnail_url, NEW.mime_type, NEW.file_name, NEW.file_size,
    NEW.width, NEW.height, NEW.duration, NEW.alt_text, NEW.category, NEW.status, NEW.created_by_user_id, NEW.created_at, NEW.updated_at
  );
END;

DROP TRIGGER IF EXISTS sync_media_assets_old_update;
CREATE TRIGGER sync_media_assets_old_update
AFTER UPDATE ON media_assets
BEGIN
  INSERT OR REPLACE INTO media_assets_old (
    id, organization_id, site_id, location_id, kind, provider, source,
    cloudflare_image_id, r2_key, google_media_name,
    public_url, thumbnail_url, mime_type, file_name, file_size,
    width, height, duration, alt_text, category, status, created_by_user_id, created_at, updated_at
  )
  VALUES (
    NEW.id, NEW.organization_id, NEW.site_id, NEW.location_id, NEW.kind, NEW.provider, NEW.source,
    NEW.cloudflare_image_id, NEW.r2_key, NEW.google_media_name,
    NEW.public_url, NEW.thumbnail_url, NEW.mime_type, NEW.file_name, NEW.file_size,
    NEW.width, NEW.height, NEW.duration, NEW.alt_text, NEW.category, NEW.status, NEW.created_by_user_id, NEW.created_at, NEW.updated_at
  );
END;

DROP TRIGGER IF EXISTS sync_media_assets_old_delete;
CREATE TRIGGER sync_media_assets_old_delete
AFTER DELETE ON media_assets
BEGIN
  DELETE FROM media_assets_old WHERE id = OLD.id;
END;
