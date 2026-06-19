-- Migration number: 0017 	 2026-06-18T09:29:42.079Z
--------------------------------------------------------------------------------
-- Billing model: move subscriptions + entitlements from org-level to site-level.
-- Orgs can now have unlimited sites; each site has its own plan + subscription.
-- The org retains stripe_customer_id (payment method binding only).
-- Locations are unlimited on all plans — max_locations gate removed.
--------------------------------------------------------------------------------

-- Allow multiple sites per org
DROP INDEX IF EXISTS idx_sites_one_per_organization;

-- Per-site subscription tracking
CREATE TABLE IF NOT EXISTS site_billing (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL,
  stripe_subscription_id TEXT UNIQUE,
  stripe_subscription_item_id TEXT UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'free',
  current_period_end TEXT,
  cancel_at_period_end BOOLEAN DEFAULT false,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_site_billing_org ON site_billing(organization_id);
CREATE INDEX IF NOT EXISTS idx_site_billing_subscription ON site_billing(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- Per-site entitlements
CREATE TABLE IF NOT EXISTS site_entitlements (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  source TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  UNIQUE(site_id, key)
);

CREATE INDEX IF NOT EXISTS idx_site_entitlements_org ON site_entitlements(organization_id);

-- Backfill site_billing from existing org billing rows
INSERT OR IGNORE INTO site_billing (id, site_id, organization_id, stripe_subscription_id, stripe_subscription_item_id, plan, status, updated_at)
SELECT
  'sb-' || s.id,
  s.id,
  s.organization_id,
  COALESCE(ob.stripe_subscription_id, NULL),
  COALESCE(ob.stripe_subscription_item_id, NULL),
  COALESCE(ob.plan, 'free'),
  COALESCE(ob.status, 'free'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM sites s
LEFT JOIN organization_billing ob ON ob.organization_id = s.organization_id;

-- Backfill site_entitlements from existing org entitlements (drop location/site count gates)
INSERT OR IGNORE INTO site_entitlements (id, site_id, organization_id, key, value, source, created_at, updated_at)
SELECT
  'sent-' || s.id || '-' || oe.key,
  s.id,
  s.organization_id,
  oe.key,
  oe.value,
  oe.source,
  oe.created_at,
  oe.updated_at
FROM organization_entitlements oe
JOIN sites s ON s.organization_id = oe.organization_id
WHERE oe.key NOT IN ('max_sites', 'max_locations');
