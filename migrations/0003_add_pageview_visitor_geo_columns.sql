-- Migration number: 0003 	 2026-06-24T07:12:47.451Z
--
-- visitor_id/country/region/city were folded into 0001_initial.sql's
-- CREATE TABLE statement by a later squash. Environments that already had
-- an 0001_initial.sql row recorded from before that squash (staging, prod)
-- never got these columns, since `wrangler d1 migrations apply` tracks by
-- filename, not content. Pulled back out of 0001_initial.sql into its own
-- migration so every environment picks it up exactly once.
ALTER TABLE site_pageview_events ADD COLUMN visitor_id TEXT;
ALTER TABLE site_pageview_events ADD COLUMN country TEXT;
ALTER TABLE site_pageview_events ADD COLUMN region TEXT;
ALTER TABLE site_pageview_events ADD COLUMN city TEXT;

CREATE INDEX idx_pageview_events_site_visitor
  ON site_pageview_events(site_id, visitor_id);
