-- Fix organization_entitlements table schema to match billing code expectations
-- The billing code expects 'key' column but schema has 'feature_key'

-- Drop the existing table and recreate with correct column names
DROP TABLE IF EXISTS organization_entitlements;

CREATE TABLE IF NOT EXISTS organization_entitlements (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  source TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  UNIQUE(organization_id, key)
);

-- Also fix organization_billing table to match billing code expectations
-- The billing code expects 'plan' column but schema has 'plan_id'
DROP TABLE IF EXISTS organization_billing;

CREATE TABLE IF NOT EXISTS organization_billing (
  organization_id TEXT PRIMARY KEY,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL,
  plan TEXT NOT NULL, -- Changed from plan_id to plan
  current_period_end TEXT,
  cancel_at_period_end BOOLEAN DEFAULT false,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE
);
