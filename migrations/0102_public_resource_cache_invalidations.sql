CREATE TABLE IF NOT EXISTS public_resource_cache_invalidations (
  id TEXT PRIMARY KEY NOT NULL,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  claimed_at TEXT,
  processed_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS public_resource_cache_invalidations_status_idx
  ON public_resource_cache_invalidations(status, created_at);

CREATE INDEX IF NOT EXISTS public_resource_cache_invalidations_site_idx
  ON public_resource_cache_invalidations(site_id, status);
