-- Migration number: 0016 	 2026-06-18T01:20:40.601Z
ALTER TABLE site_transfer_requests ADD COLUMN invited_interval TEXT NOT NULL DEFAULT 'month';
