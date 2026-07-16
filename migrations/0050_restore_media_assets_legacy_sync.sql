-- Migration 0047 rebuilt media_assets and consequently removed its non-schema
-- compatibility triggers. Several historical foreign keys still reference
-- media_assets_old, so keep that ID mirror populated until those relationships
-- can be migrated additively. Map values introduced by the canonical table onto
-- the legacy table's narrower CHECK constraints.

INSERT INTO media_assets_old (
  id, organization_id, site_id, location_id, kind, provider, source,
  cloudflare_image_id, r2_key, google_media_name,
  public_url, thumbnail_url, mime_type, file_name, file_size,
  width, height, duration, alt_text, category, status, created_by_user_id,
  created_at, updated_at
)
SELECT
  id, organization_id, site_id, location_id, kind, provider,
  CASE WHEN source = 'template_stock' THEN 'external' ELSE source END,
  cloudflare_image_id, r2_key, google_media_name,
  public_url, thumbnail_url, mime_type, file_name, file_size,
  width, height, duration, alt_text,
  CASE WHEN category = 'blog' THEN 'other' ELSE category END,
  status, created_by_user_id, created_at, updated_at
FROM media_assets
WHERE true
ON CONFLICT(id) DO UPDATE SET
  organization_id = excluded.organization_id,
  site_id = excluded.site_id,
  location_id = excluded.location_id,
  kind = excluded.kind,
  provider = excluded.provider,
  source = excluded.source,
  cloudflare_image_id = excluded.cloudflare_image_id,
  r2_key = excluded.r2_key,
  google_media_name = excluded.google_media_name,
  public_url = excluded.public_url,
  thumbnail_url = excluded.thumbnail_url,
  mime_type = excluded.mime_type,
  file_name = excluded.file_name,
  file_size = excluded.file_size,
  width = excluded.width,
  height = excluded.height,
  duration = excluded.duration,
  alt_text = excluded.alt_text,
  category = excluded.category,
  status = excluded.status,
  created_by_user_id = excluded.created_by_user_id,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

CREATE TRIGGER sync_media_assets_old_delete
AFTER DELETE ON media_assets
BEGIN
  DELETE FROM media_assets_old WHERE id = OLD.id;
END;

CREATE TRIGGER sync_media_assets_old_insert
AFTER INSERT ON media_assets
BEGIN
  INSERT INTO media_assets_old (
    id, organization_id, site_id, location_id, kind, provider, source,
    cloudflare_image_id, r2_key, google_media_name,
    public_url, thumbnail_url, mime_type, file_name, file_size,
    width, height, duration, alt_text, category, status, created_by_user_id,
    created_at, updated_at
  ) VALUES (
    NEW.id, NEW.organization_id, NEW.site_id, NEW.location_id, NEW.kind, NEW.provider,
    CASE WHEN NEW.source = 'template_stock' THEN 'external' ELSE NEW.source END,
    NEW.cloudflare_image_id, NEW.r2_key, NEW.google_media_name,
    NEW.public_url, NEW.thumbnail_url, NEW.mime_type, NEW.file_name, NEW.file_size,
    NEW.width, NEW.height, NEW.duration, NEW.alt_text,
    CASE WHEN NEW.category = 'blog' THEN 'other' ELSE NEW.category END,
    NEW.status, NEW.created_by_user_id, NEW.created_at, NEW.updated_at
  );
END;

CREATE TRIGGER sync_media_assets_old_update
AFTER UPDATE ON media_assets
BEGIN
  INSERT INTO media_assets_old (
    id, organization_id, site_id, location_id, kind, provider, source,
    cloudflare_image_id, r2_key, google_media_name,
    public_url, thumbnail_url, mime_type, file_name, file_size,
    width, height, duration, alt_text, category, status, created_by_user_id,
    created_at, updated_at
  ) VALUES (
    NEW.id, NEW.organization_id, NEW.site_id, NEW.location_id, NEW.kind, NEW.provider,
    CASE WHEN NEW.source = 'template_stock' THEN 'external' ELSE NEW.source END,
    NEW.cloudflare_image_id, NEW.r2_key, NEW.google_media_name,
    NEW.public_url, NEW.thumbnail_url, NEW.mime_type, NEW.file_name, NEW.file_size,
    NEW.width, NEW.height, NEW.duration, NEW.alt_text,
    CASE WHEN NEW.category = 'blog' THEN 'other' ELSE NEW.category END,
    NEW.status, NEW.created_by_user_id, NEW.created_at, NEW.updated_at
  )
  ON CONFLICT(id) DO UPDATE SET
    organization_id = excluded.organization_id,
    site_id = excluded.site_id,
    location_id = excluded.location_id,
    kind = excluded.kind,
    provider = excluded.provider,
    source = excluded.source,
    cloudflare_image_id = excluded.cloudflare_image_id,
    r2_key = excluded.r2_key,
    google_media_name = excluded.google_media_name,
    public_url = excluded.public_url,
    thumbnail_url = excluded.thumbnail_url,
    mime_type = excluded.mime_type,
    file_name = excluded.file_name,
    file_size = excluded.file_size,
    width = excluded.width,
    height = excluded.height,
    duration = excluded.duration,
    alt_text = excluded.alt_text,
    category = excluded.category,
    status = excluded.status,
    created_by_user_id = excluded.created_by_user_id,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;
END;
