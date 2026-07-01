-- Migration number: 0018  2026-07-01T01:20:00.000Z
--
-- Repair schema drift for site_analytics_daily. Production applied an older
-- 0001_initial.sql before the file was later edited to include the tenant
-- analytics columns below, so prod never received an additive migration for
-- them. Rebuild the table to the canonical shape using only the columns that
-- exist in both variants; the daily rollup table is derived from raw events
-- and will be repopulated by cron / read-time backfill.

PRAGMA defer_foreign_keys = ON;

ALTER TABLE site_analytics_daily RENAME TO site_analytics_daily__old;

CREATE TABLE site_analytics_daily (
  id TEXT PRIMARY KEY NOT NULL,
  site_id TEXT NOT NULL,
  date TEXT NOT NULL,
  page_views INTEGER DEFAULT 0,
  unique_sessions INTEGER DEFAULT 0,
  avg_session_duration INTEGER DEFAULT 0,
  top_pages TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique_visitors INTEGER DEFAULT 0,
  pages_per_session REAL DEFAULT 0,
  returning_visitors INTEGER DEFAULT 0,
  CONSTRAINT site_analytics_daily_site_id_date_unique UNIQUE (site_id, date),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

INSERT INTO site_analytics_daily (
  id,
  site_id,
  date,
  page_views,
  unique_sessions,
  avg_session_duration,
  top_pages,
  created_at,
  updated_at,
  unique_visitors,
  pages_per_session,
  returning_visitors
)
SELECT
  id,
  site_id,
  date,
  COALESCE(page_views, 0),
  COALESCE(unique_sessions, 0),
  COALESCE(avg_session_duration, 0),
  top_pages,
  created_at,
  updated_at,
  0,
  CASE
    WHEN COALESCE(unique_sessions, 0) > 0
      THEN ROUND(CAST(COALESCE(page_views, 0) AS REAL) / unique_sessions, 2)
    ELSE 0
  END,
  0
FROM site_analytics_daily__old;

DROP TABLE site_analytics_daily__old;

CREATE INDEX IF NOT EXISTS idx_site_analytics_daily_site_id_date
  ON site_analytics_daily(site_id, date DESC);
