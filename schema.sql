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
  settings TEXT,
  last_published_at TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (theme_id) REFERENCES themes(id),
  FOREIGN KEY (primary_location_id) REFERENCES business_locations(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_custom_domain_unique
  ON sites(custom_domain)
  WHERE custom_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sites_custom_domain ON sites(custom_domain);

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

CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  type TEXT NOT NULL, -- 'google_business', 'whatsapp', 'google_analytics', 'instagram', etc.
  provider TEXT NOT NULL, -- 'google', 'meta', 'twilio', etc.
  status TEXT NOT NULL DEFAULT 'disconnected', -- 'connected', 'disconnected', 'error'
  config TEXT, -- JSON config (tokens, settings, etc.)
  metadata TEXT, -- JSON metadata (display name, features, etc.)
  last_sync_at TEXT,
  sync_errors TEXT, -- JSON array of recent errors
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS business_locations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  google_location_id TEXT,
  integration_id TEXT,
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

CREATE TABLE IF NOT EXISTS menu_categories (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  google_category_id TEXT, -- Google Business category ID
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  menu_id TEXT NOT NULL,
  section TEXT NOT NULL,
  category_id TEXT, -- NEW: Link to menu_categories
  name TEXT NOT NULL,
  description TEXT,
  price TEXT,
  image_url TEXT,
  available BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual', -- NEW: 'manual', 'google_business', etc.
  external_id TEXT, -- NEW: External system ID (e.g., Google Business)
  last_synced_at TEXT, -- NEW: Last sync timestamp
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
  author TEXT,
  rating INTEGER NOT NULL,
  title TEXT,
  comment TEXT,
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
  type TEXT,
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
-- Seed Data
--------------------------------------------------------------------------------

-- Insert default menu categories that match Google Business
INSERT OR IGNORE INTO menu_categories (id, organization_id, site_id, name, display_order, created_by) VALUES
('default-appetizers', '', '', 'Appetizers', 1, 'system'),
('default-main-courses', '', '', 'Main Courses', 2, 'system'),
('default-desserts', '', '', 'Desserts', 3, 'system'),
('default-beverages', '', '', 'Beverages', 4, 'system'),
('default-sides', '', '', 'Side Dishes', 5, 'system');

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_menu_items_category_id ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_source ON menu_items(source);
CREATE INDEX IF NOT EXISTS idx_menu_categories_org_site ON menu_categories(organization_id, site_id);
CREATE INDEX IF NOT EXISTS idx_integrations_org_site ON integrations(organization_id, site_id);
CREATE INDEX IF NOT EXISTS idx_integrations_type ON integrations(type);

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
