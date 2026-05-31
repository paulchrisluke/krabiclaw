-- Persist operational canary outcomes for production auditing.
CREATE TABLE IF NOT EXISTS canary_runs (
  id TEXT PRIMARY KEY,
  run_type TEXT NOT NULL CHECK (run_type IN ('auth', 'notifications', 'rollback')),
  environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('production', 'staging', 'preview', 'local')),
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail')),
  organization_id TEXT,
  site_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE SET NULL,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_canary_runs_type_created
  ON canary_runs(run_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_canary_runs_status_created
  ON canary_runs(status, created_at DESC);
