ALTER TABLE reservation_submissions ADD COLUMN location_id TEXT REFERENCES business_locations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_reservation_submissions_location ON reservation_submissions(location_id) WHERE location_id IS NOT NULL;
