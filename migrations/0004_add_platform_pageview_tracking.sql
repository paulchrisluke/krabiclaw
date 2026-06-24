-- Migration number: 0004 	 2026-06-24T08:48:28.958Z

-- Pageview tracking for platform pages (krabiclaw.com itself: home, blog,
-- docs, marketing pages) — mirrors site_pageview_events/site_analytics_daily
-- but has no site_id, since platform pages aren't tenant-scoped.
CREATE TABLE IF NOT EXISTS platform_pageview_events (
	id text PRIMARY KEY NOT NULL,
	page_path text NOT NULL,
	referrer text,
	user_agent text,
	ip_hash text,
	session_id text,
	visitor_id text,
	duration_seconds integer,
	country text,
	region text,
	city text,
	created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_pageview_events_created_at ON platform_pageview_events (created_at);
CREATE INDEX IF NOT EXISTS idx_platform_pageview_events_session_id ON platform_pageview_events (session_id);

CREATE TABLE IF NOT EXISTS platform_analytics_daily (
	id text PRIMARY KEY NOT NULL,
	date text NOT NULL,
	page_views integer DEFAULT 0,
	unique_sessions integer DEFAULT 0,
	avg_session_duration integer DEFAULT 0,
	unique_visitors integer DEFAULT 0,
	pages_per_session real,
	returning_visitors integer DEFAULT 0,
	top_pages text,
	created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	CONSTRAINT platform_analytics_daily_date_unique UNIQUE (date)
);
