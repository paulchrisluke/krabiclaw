-- Migration number: 0003 	 2026-05-28T09:45:27.224Z
ALTER TABLE site_transfer_requests ADD COLUMN invited_domain TEXT;
