-- Migration number: 0005 	 2026-06-22T04:50:51.919Z

CREATE TABLE google_analytics_connections (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  connected_by_user_id TEXT,
  provider_account_email TEXT NOT NULL,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  scopes TEXT NOT NULL,
  ga4_property_id TEXT,
  ga4_property_name TEXT,
  ga4_measurement_id TEXT,
  search_console_site_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'error')),
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (connected_by_user_id) REFERENCES user(id) ON DELETE SET NULL,
  UNIQUE(organization_id, site_id)
);
