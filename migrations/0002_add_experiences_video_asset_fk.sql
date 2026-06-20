-- Migration number: 0002 	 2026-06-20T09:40:23.665Z
-- Add missing FOREIGN KEY on experiences.video_asset_id -> media_assets(id).
-- SQLite cannot add a FK to an existing column via ALTER TABLE, so the table
-- is rebuilt with the same shape plus the new constraint.

PRAGMA foreign_keys = OFF;

CREATE TABLE "experiences_new" (
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
  FOREIGN KEY (image_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL,
  FOREIGN KEY (video_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL
);

INSERT INTO "experiences_new" SELECT
  id, organization_id, site_id, location_id, title, slug, tagline, body,
  image_asset_id, video_asset_id, images, price, price_amount, duration_minutes,
  max_capacity, time_slots, recurring_slots, available_note, status, sort_order,
  featured, featured_sort_order, seo_title, seo_description, created_at, updated_at, created_by
FROM "experiences";

DROP TABLE "experiences";
ALTER TABLE "experiences_new" RENAME TO "experiences";

CREATE INDEX idx_experiences_location ON experiences(location_id);
CREATE INDEX idx_experiences_site ON experiences(site_id);
CREATE UNIQUE INDEX idx_experiences_site_slug ON experiences(site_id, slug);

PRAGMA foreign_keys = ON;
