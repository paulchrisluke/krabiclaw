-- SQLite/D1 migration: add delivery URL columns to business_locations.
-- Run only against databases that do not already have these columns.
ALTER TABLE business_locations ADD COLUMN grab_url TEXT;
ALTER TABLE business_locations ADD COLUMN uber_eats_url TEXT;
ALTER TABLE business_locations ADD COLUMN foodpanda_url TEXT;
