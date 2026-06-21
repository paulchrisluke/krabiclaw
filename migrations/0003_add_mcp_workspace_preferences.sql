CREATE TABLE mcp_workspace_preferences (
  user_id TEXT PRIMARY KEY,
  organization_id TEXT,
  site_id TEXT,
  location_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE SET NULL,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL,
  FOREIGN KEY (location_id) REFERENCES business_locations(id) ON DELETE SET NULL
);
