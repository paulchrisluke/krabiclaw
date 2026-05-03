CREATE TABLE IF NOT EXISTS google_oauth_tokens (
  provider TEXT PRIMARY KEY,
  refresh_token TEXT NOT NULL,
  scope TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS google_business_snapshots (
  id TEXT PRIMARY KEY,
  business_json TEXT,
  reviews_json TEXT,
  media_json TEXT,
  posts_json TEXT,
  products_json TEXT,
  qa_json TEXT,
  errors_json TEXT,
  synced_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS google_business_events (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  event_type TEXT,
  location_name TEXT,
  review_name TEXT,
  raw_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_google_business_events_created
  ON google_business_events (created_at DESC);
