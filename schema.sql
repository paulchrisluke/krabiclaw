-- KrabiClaw canonical D1 schema.
-- Edit this file directly when the database shape changes.

PRAGMA foreign_keys = ON;

--------------------------------------------------------------------------------
-- Better Auth
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  expiresAt TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ipAddress TEXT,
  userAgent TEXT,
  activeOrganizationId TEXT,
  activeTeamId TEXT,
  userId TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  expiresAt TEXT,
  accessTokenExpiresAt TEXT,
  refreshTokenExpiresAt TEXT,
  scope TEXT,
  password TEXT,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS organization (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  logo TEXT,
  metadata TEXT,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS member (
  id TEXT PRIMARY KEY,
  organizationId TEXT NOT NULL,
  userId TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organizationId) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS invitation (
  id TEXT PRIMARY KEY,
  organizationId TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expiresAt TEXT NOT NULL,
  inviterId TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organizationId) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (inviterId) REFERENCES user(id) ON DELETE CASCADE
);

--------------------------------------------------------------------------------
-- Platform
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS themes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  version TEXT DEFAULT '1.0.0',
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'beta')),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  theme_id TEXT NOT NULL DEFAULT 'saya-theme-v1',
  theme TEXT NOT NULL DEFAULT 'saya',
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  subdomain TEXT UNIQUE,
  custom_domain TEXT,
  custom_domain_status TEXT DEFAULT 'none',
  primary_location_id TEXT,
  public_url TEXT,
  brand_name TEXT,
  brand_description TEXT,
  logo_url TEXT,
  contact_email TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'paid', 'starter', 'pro', 'business')),
  onboarding_status TEXT DEFAULT 'pending' CHECK (onboarding_status IN ('pending', 'active', 'failed')),
  url_structure TEXT NOT NULL DEFAULT 'location_subdirectories' CHECK (url_structure IN ('location_subdirectories', 'brand_pages')),
  settings TEXT,
  last_published_at TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (theme_id) REFERENCES themes(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_custom_domain_unique
  ON sites(custom_domain)
  WHERE custom_domain IS NOT NULL;

CREATE TABLE IF NOT EXISTS site_domains (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  domain TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('subdomain', 'custom')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verifying', 'active', 'verification_required', 'failed', 'disabled')),
  verification_token TEXT,
  verification_method TEXT,
  ssl_status TEXT DEFAULT 'pending',
  last_checked_at TEXT,
  verified_at TEXT,
  error_message TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

--------------------------------------------------------------------------------
-- Business Locations and Google Business
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS google_business_connections (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  connected_by_user_id TEXT,
  provider_account_email TEXT NOT NULL,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  scopes TEXT NOT NULL,
  expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'error')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (connected_by_user_id) REFERENCES user(id) ON DELETE SET NULL,
  UNIQUE(organization_id, site_id)
);

CREATE TABLE IF NOT EXISTS business_locations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  google_location_id TEXT,
  google_connection_id TEXT,
  title TEXT NOT NULL,
  address TEXT,
  city TEXT,
  phone TEXT,
  image_url TEXT,
  website_url TEXT,
  maps_url TEXT,
  latitude REAL,
  longitude REAL,
  opening_hours TEXT,
  categories TEXT,
  rating REAL,
  review_count INTEGER,
  is_primary BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'sync_error')),
  last_synced_at TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (google_connection_id) REFERENCES google_business_connections(id) ON DELETE SET NULL,
  UNIQUE(organization_id, site_id, slug)
);

CREATE TABLE IF NOT EXISTS google_business_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  site_id TEXT,
  google_location_id TEXT,
  event_type TEXT,
  payload TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

--------------------------------------------------------------------------------
-- Content
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS site_content (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  location_id TEXT,
  page TEXT NOT NULL,
  field TEXT NOT NULL,
  content TEXT,
  hero_title TEXT,
  hero_subtitle TEXT,
  hero_video_url TEXT,
  value TEXT,
  type TEXT NOT NULL DEFAULT 'text',
  source TEXT NOT NULL DEFAULT 'manual',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES business_locations(id) ON DELETE CASCADE,
  UNIQUE(organization_id, site_id, location_id, page, field)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_site_content_site_level_unique
  ON site_content(organization_id, site_id, page, field)
  WHERE location_id IS NULL;

CREATE TABLE IF NOT EXISTS site_content_drafts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  location_id TEXT,
  page TEXT NOT NULL,
  field TEXT NOT NULL,
  content TEXT,
  hero_title TEXT,
  hero_subtitle TEXT,
  hero_video_url TEXT,
  value TEXT,
  type TEXT NOT NULL DEFAULT 'text',
  source TEXT NOT NULL DEFAULT 'manual',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES business_locations(id) ON DELETE CASCADE,
  UNIQUE(organization_id, site_id, location_id, page, field)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_site_content_drafts_site_level_unique
  ON site_content_drafts(organization_id, site_id, page, field)
  WHERE location_id IS NULL;

CREATE TABLE IF NOT EXISTS site_config (
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (organization_id, site_id, key),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staff_profiles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  location_id TEXT,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  bio TEXT,
  image_url TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES business_locations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS awards_recognition (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  location_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  year INTEGER,
  issuer TEXT,
  image_url TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES business_locations(id) ON DELETE CASCADE
);

--------------------------------------------------------------------------------
-- Menus and Reviews
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS menus (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  location_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by TEXT,
  updated_by TEXT,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES business_locations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  menu_id TEXT NOT NULL,
  section TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price TEXT,
  image_url TEXT,
  available BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by TEXT,
  updated_by TEXT,
  FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  site_id TEXT,
  location_id TEXT,
  menu_item_slug TEXT,
  author_name TEXT,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT,
  content TEXT,
  status TEXT DEFAULT 'pending',
  source TEXT DEFAULT 'direct',
  ip_hash TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES business_locations(id) ON DELETE CASCADE
);

--------------------------------------------------------------------------------
-- Billing
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organization_billing (
  id TEXT UNIQUE,
  organization_id TEXT PRIMARY KEY,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'free',
  plan TEXT NOT NULL DEFAULT 'free',
  current_period_end TEXT,
  cancel_at_period_end BOOLEAN DEFAULT false,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE
);

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

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id TEXT PRIMARY KEY,
  stripe_event_id TEXT UNIQUE,
  event_type TEXT,
  status TEXT DEFAULT 'pending',
  payload TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

--------------------------------------------------------------------------------
-- Onboarding
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS onboarding_steps (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'failed')),
  completed_at TEXT,
  error_message TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  UNIQUE(site_id, step_name)
);

--------------------------------------------------------------------------------
-- AI Credits & Usage
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_credits (
  organization_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  lifetime_used INTEGER NOT NULL DEFAULT 0,
  last_topped_up_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE
);

-- Each AI call: one row, linked to CF Gateway log for reconciliation
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT,
  action TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  credits_charged INTEGER NOT NULL DEFAULT 0,
  cf_gateway_log_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_org ON ai_usage_log(organization_id, created_at DESC);

--------------------------------------------------------------------------------
-- Seed Data
--------------------------------------------------------------------------------

INSERT INTO themes (id, name, slug, version, description, status)
VALUES (
  'saya-theme-v1',
  'Saya Restaurant Theme',
  'saya',
  '1.0.0',
  'Default restaurant website theme with inline editing, multi-location support, and Google Business integration',
  'active'
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  slug = excluded.slug,
  version = excluded.version,
  description = excluded.description,
  status = excluded.status,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
