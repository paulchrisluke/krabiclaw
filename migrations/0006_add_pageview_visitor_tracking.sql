-- Migration number: 0007 	 2026-06-23T03:24:25.290Z

ALTER TABLE site_pageview_events ADD COLUMN visitor_id TEXT;
ALTER TABLE site_pageview_events ADD COLUMN country TEXT;
ALTER TABLE site_pageview_events ADD COLUMN region TEXT;
ALTER TABLE site_pageview_events ADD COLUMN city TEXT;

ALTER TABLE site_analytics_daily ADD COLUMN unique_visitors INTEGER DEFAULT 0;
ALTER TABLE site_analytics_daily ADD COLUMN pages_per_session REAL DEFAULT 0;
ALTER TABLE site_analytics_daily ADD COLUMN returning_visitors INTEGER DEFAULT 0;

CREATE INDEX idx_pageview_events_site_visitor
  ON site_pageview_events(site_id, visitor_id);
