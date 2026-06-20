-- Migration number: 0026 	 2026-06-20T02:17:51.971Z
-- Every experience belongs to exactly one location. Backfill any legacy NULL
-- location_id from the site's primary location (or its first business_location)
-- before enforcing NOT NULL. SQLite cannot ALTER a column to add NOT NULL,
-- so recreate the table.

PRAGMA foreign_keys = OFF;

UPDATE experiences
SET location_id = COALESCE(
  (SELECT s.primary_location_id FROM sites s WHERE s.id = experiences.site_id),
  (SELECT bl.id FROM business_locations bl WHERE bl.site_id = experiences.site_id ORDER BY bl.is_primary DESC, bl.id ASC LIMIT 1)
)
WHERE location_id IS NULL;

CREATE TABLE experiences_new (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  tagline TEXT,
  body TEXT,
  image_asset_id TEXT,
  video_asset_id TEXT,
  images TEXT,
  price TEXT,
  price_amount NUMERIC,
  duration_minutes INTEGER,
  max_capacity INTEGER,
  time_slots TEXT,
  recurring_slots TEXT,
  available_note TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'sold_out')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  featured BOOLEAN NOT NULL DEFAULT false,
  featured_sort_order INTEGER NOT NULL DEFAULT 0,
  seo_title TEXT,
  seo_description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by TEXT,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES business_locations(id) ON DELETE CASCADE,
  FOREIGN KEY (image_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL
);

INSERT INTO experiences_new (
  id, organization_id, site_id, location_id, title, slug, tagline, body,
  image_asset_id, video_asset_id, images, price, price_amount, duration_minutes,
  max_capacity, time_slots, recurring_slots, available_note, status, sort_order,
  featured, featured_sort_order, seo_title, seo_description, created_at, updated_at, created_by
)
SELECT
  id, organization_id, site_id, location_id, title, slug, tagline, body,
  image_asset_id, video_asset_id, images, price, price_amount, duration_minutes,
  max_capacity, time_slots, recurring_slots, available_note, status, sort_order,
  featured, featured_sort_order, seo_title, seo_description, created_at, updated_at, created_by
FROM experiences;

DROP TABLE experiences;
ALTER TABLE experiences_new RENAME TO experiences;

CREATE UNIQUE INDEX IF NOT EXISTS idx_experiences_site_slug ON experiences(site_id, slug);
CREATE INDEX IF NOT EXISTS idx_experiences_site ON experiences(site_id);
CREATE INDEX IF NOT EXISTS idx_experiences_location ON experiences(location_id);

PRAGMA foreign_keys = ON;
