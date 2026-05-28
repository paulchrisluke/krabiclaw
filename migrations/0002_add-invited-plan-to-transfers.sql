-- Migration number: 0002 	 2026-05-28T09:40:20.668Z
ALTER TABLE site_transfer_requests ADD COLUMN invited_plan TEXT;
ALTER TABLE site_transfer_requests ADD COLUMN invited_coupon TEXT;
