-- Migration number: 0004 	 2026-06-21T08:23:00.843Z
ALTER TABLE experiences ADD COLUMN highlights TEXT;
ALTER TABLE experiences ADD COLUMN included_items TEXT;
ALTER TABLE experiences ADD COLUMN what_to_bring TEXT;
ALTER TABLE experiences ADD COLUMN meeting_point TEXT;
ALTER TABLE experiences ADD COLUMN cancellation_policy TEXT;
