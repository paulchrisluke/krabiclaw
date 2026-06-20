-- Migration number: 0025 	 2026-06-20T01:01:23.675Z

CREATE TABLE IF NOT EXISTS experience_slot_overrides (
  id TEXT PRIMARY KEY,
  experience_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  override_date TEXT NOT NULL,
  time_slot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('closed', 'open')),
  capacity_override INTEGER,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by TEXT,
  FOREIGN KEY (experience_id) REFERENCES experiences(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_experience_slot_overrides_unique
  ON experience_slot_overrides(experience_id, override_date, time_slot);

CREATE INDEX IF NOT EXISTS idx_experience_slot_overrides_date
  ON experience_slot_overrides(experience_id, override_date);
