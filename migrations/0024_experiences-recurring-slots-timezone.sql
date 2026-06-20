-- Migration number: 0024 	 2026-06-20T01:01:17.532Z

ALTER TABLE experiences ADD COLUMN recurring_slots TEXT;
ALTER TABLE business_locations ADD COLUMN timezone TEXT;
