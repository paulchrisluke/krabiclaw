-- Migration number: 0027 	 2026-06-20T02:18:27.983Z
-- Every reservation belongs to exactly one location. Backfill any legacy NULL
-- location_id from the site's primary location (or its first business_location)
-- before enforcing NOT NULL. SQLite cannot ALTER a column to add NOT NULL,
-- so recreate the table.

PRAGMA foreign_keys = OFF;

UPDATE reservation_submissions
SET location_id = COALESCE(
  (SELECT s.primary_location_id FROM sites s WHERE s.id = reservation_submissions.site_id),
  (SELECT bl.id FROM business_locations bl WHERE bl.site_id = reservation_submissions.site_id ORDER BY bl.is_primary DESC, bl.id ASC LIMIT 1)
)
WHERE location_id IS NULL;

CREATE TABLE reservation_submissions_new (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  guests TEXT NOT NULL,
  requests TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'confirmed', 'cancelled', 'completed')),
  ip_hash TEXT,
  cancellation_token_hash TEXT,
  cancellation_token_expires_at TEXT,
  cancellation_token_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES business_locations(id) ON DELETE CASCADE
);

INSERT INTO reservation_submissions_new (
  id, organization_id, site_id, location_id, name, email, phone, date, time, guests,
  requests, status, ip_hash, cancellation_token_hash, cancellation_token_expires_at,
  cancellation_token_used_at, created_at
)
SELECT
  id, organization_id, site_id, location_id, name, email, phone, date, time, guests,
  requests, status, ip_hash, cancellation_token_hash, cancellation_token_expires_at,
  cancellation_token_used_at, created_at
FROM reservation_submissions;

DROP TABLE reservation_submissions;
ALTER TABLE reservation_submissions_new RENAME TO reservation_submissions;

CREATE INDEX IF NOT EXISTS idx_reservation_submissions_site ON reservation_submissions(site_id, date, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservation_submissions_location ON reservation_submissions(location_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservation_submissions_cancel_token_hash
  ON reservation_submissions(cancellation_token_hash)
  WHERE cancellation_token_hash IS NOT NULL;

PRAGMA foreign_keys = ON;
