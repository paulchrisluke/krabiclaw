-- Add vertical, content_source, media_source to sites table
-- Existing sites default to 'restaurant'; update individual rows as needed.
ALTER TABLE sites ADD COLUMN vertical TEXT NOT NULL DEFAULT 'restaurant';
ALTER TABLE sites ADD COLUMN content_source TEXT;
ALTER TABLE sites ADD COLUMN media_source TEXT;

-- SQLite does not support ALTER COLUMN to add CHECK constraints.
-- Add triggers to enforce allowed values for new/updated rows.
CREATE TRIGGER IF NOT EXISTS sites_vertical_check
BEFORE INSERT OR UPDATE OF vertical ON sites
WHEN NEW.vertical NOT IN ('restaurant', 'experience', 'retail', 'wellness', 'service')
BEGIN
  SELECT RAISE(ABORT, 'Invalid vertical value');
END;

CREATE TRIGGER IF NOT EXISTS sites_content_source_check
BEFORE INSERT OR UPDATE OF content_source ON sites
WHEN NEW.content_source IS NOT NULL AND NEW.content_source NOT IN ('google_maps', 'client_supplied', 'generated')
BEGIN
  SELECT RAISE(ABORT, 'Invalid content_source value');
END;

CREATE TRIGGER IF NOT EXISTS sites_media_source_check
BEFORE INSERT OR UPDATE OF media_source ON sites
WHEN NEW.media_source IS NOT NULL AND NEW.media_source NOT IN ('client_photos', 'stock', 'mixed')
BEGIN
  SELECT RAISE(ABORT, 'Invalid media_source value');
END;

-- Add description_provenance to business_locations
-- Tracks where the description copy came from: google_maps | client_supplied | llm_generated | manual_override
ALTER TABLE business_locations ADD COLUMN description_provenance TEXT;

-- NOTE: location_qa.source and reviews.source CHECK constraints are widened in schema.sql.
-- SQLite does not support ALTER COLUMN — fresh installs pick up the new constraint automatically.
-- For existing DBs, the narrower constraint remains; new rows seeded by client:import use
-- values within the old set ('gmb','manual','direct') until a full schema rebuild is run.

-- Google Place Snapshots — stores raw Place API responses for audit and repeatability
CREATE TABLE IF NOT EXISTS google_place_snapshots (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  location_id TEXT,
  place_id TEXT NOT NULL,
  source_url TEXT,
  snapshot_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES business_locations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_google_place_snapshots_site
  ON google_place_snapshots(site_id);

CREATE INDEX IF NOT EXISTS idx_google_place_snapshots_place_id
  ON google_place_snapshots(place_id);
