-- KrabiClaw canonical D1 schema. v2 (media assets + domain overhaul).
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
  phoneNumber TEXT UNIQUE,
  phoneNumberVerified INTEGER NOT NULL DEFAULT 0,
  role TEXT DEFAULT 'user',
  banned INTEGER DEFAULT 0,
  banReason TEXT,
  banExpires TEXT,
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
  impersonatedBy TEXT,
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
  role TEXT NOT NULL DEFAULT 'secondary' CHECK (role IN ('canonical', 'secondary')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verifying', 'active', 'blocked', 'failed', 'disabled', 'deleted')),
  cloudflare_hostname_id TEXT UNIQUE,
  cloudflare_hostname_status TEXT,
  cloudflare_ssl_status TEXT,
  ownership_validation_name TEXT,
  ownership_validation_type TEXT,
  ownership_validation_value TEXT,
  ssl_validation_name TEXT,
  ssl_validation_type TEXT,
  ssl_validation_value TEXT,
  dns_target TEXT,
  dns_status TEXT NOT NULL DEFAULT 'pending' CHECK (dns_status IN ('pending', 'valid', 'invalid', 'unknown')),
  last_synced_at TEXT,
  next_check_at TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  activated_at TEXT,
  error_message TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_site_domains_one_canonical
  ON site_domains(site_id)
  WHERE role = 'canonical' AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_site_domains_reconcile
  ON site_domains(status, next_check_at);

CREATE TABLE IF NOT EXISTS site_domain_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  domain_id TEXT,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'system' CHECK (actor_type IN ('owner', 'admin', 'system', 'cloudflare')),
  actor_id TEXT,
  message TEXT,
  before_state TEXT,
  after_state TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (domain_id) REFERENCES site_domains(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_site_domain_events_domain
  ON site_domain_events(domain_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_domain_events_site
  ON site_domain_events(site_id, created_at DESC);

CREATE TABLE IF NOT EXISTS domain_reconciliation_jobs (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  run_after TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (domain_id) REFERENCES site_domains(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_domain_reconciliation_jobs_due
  ON domain_reconciliation_jobs(status, run_after);

--------------------------------------------------------------------------------
-- Business Locations and Google Business
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS google_business_connections (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  location_id TEXT,
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
  FOREIGN KEY (location_id) REFERENCES business_locations(id) ON DELETE SET NULL,
  FOREIGN KEY (connected_by_user_id) REFERENCES user(id) ON DELETE SET NULL,
  UNIQUE(organization_id, site_id, location_id)
);

-- Enforce one site-level (NULL location_id) connection per org+site.
-- UNIQUE(org, site, location_id) won't catch this because SQLite treats NULL != NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_google_business_connections_site_level_unique
  ON google_business_connections(organization_id, site_id)
  WHERE location_id IS NULL;

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
  description TEXT,
  short_description TEXT,
  special_hours TEXT,
  price_level TEXT,
  attributes TEXT,
  email TEXT,
  facebook_url TEXT,
  instagram_url TEXT,
  tiktok_url TEXT,
  google_place_id TEXT,
  hero_image_asset_id TEXT,
  hero_video_asset_id TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (google_connection_id) REFERENCES google_business_connections(id) ON DELETE SET NULL,
  FOREIGN KEY (hero_image_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL,
  FOREIGN KEY (hero_video_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL,
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
  hero_image_asset_id TEXT,
  hero_video_asset_id TEXT,
  value TEXT,
  type TEXT NOT NULL DEFAULT 'text',
  source TEXT NOT NULL DEFAULT 'manual',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES business_locations(id) ON DELETE CASCADE,
  FOREIGN KEY (hero_image_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL,
  FOREIGN KEY (hero_video_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL,
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
  hero_image_asset_id TEXT,
  hero_video_asset_id TEXT,
  value TEXT,
  type TEXT NOT NULL DEFAULT 'text',
  source TEXT NOT NULL DEFAULT 'manual',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES business_locations(id) ON DELETE CASCADE,
  FOREIGN KEY (hero_image_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL,
  FOREIGN KEY (hero_video_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL,
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


--------------------------------------------------------------------------------
-- Media Assets
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  location_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'video', 'file')),
  provider TEXT NOT NULL CHECK (provider IN ('cloudflare_images', 'cloudflare_r2', 'google_business', 'external_url', 'chowbot')),
  source TEXT NOT NULL CHECK (source IN ('uploaded', 'google_sync', 'generated', 'external')),

  -- Provider-specific identifiers
  cloudflare_image_id TEXT,
  r2_key TEXT,
  google_media_name TEXT,

  -- URLs
  public_url TEXT,
  thumbnail_url TEXT,

  -- Metadata
  mime_type TEXT,
  file_name TEXT,
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  duration INTEGER,
  alt_text TEXT,

  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'deleted', 'failed')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES business_locations(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES user(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_media_assets_site
  ON media_assets(site_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_assets_location
  ON media_assets(location_id, status, created_at DESC)
  WHERE location_id IS NOT NULL;

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
  slug TEXT NOT NULL DEFAULT '',
  description TEXT,
  price TEXT,
  image_asset_id TEXT,
  available BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by TEXT,
  updated_by TEXT,
  FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE CASCADE,
  FOREIGN KEY (image_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_items_menu_slug
  ON menu_items(menu_id, slug) WHERE slug != '';

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  site_id TEXT,
  location_id TEXT,
  menu_item_slug TEXT,
  author_name TEXT,
  reviewer_photo_url TEXT,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT,
  content TEXT,
  google_review_id TEXT,
  owner_reply TEXT,
  owner_reply_at TEXT,
  photo_urls TEXT,                    -- JSON array
  helpful_count INTEGER DEFAULT 0,
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_google_id
  ON reviews(google_review_id) WHERE google_review_id IS NOT NULL;

--------------------------------------------------------------------------------
-- Billing
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organization_billing (
  id TEXT UNIQUE,
  organization_id TEXT PRIMARY KEY,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_subscription_item_id TEXT UNIQUE,
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
-- Posts & Channel Publishing
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  location_id TEXT REFERENCES business_locations(id) ON DELETE SET NULL,
  google_post_id TEXT,              -- GMB localPost resource name for dedup
  post_type TEXT NOT NULL DEFAULT 'standard'
    CHECK (post_type IN ('standard','offer','event','update')),
  title TEXT,
  body TEXT NOT NULL,
  image_asset_id TEXT,
  cta_type TEXT,                    -- BOOK | ORDER | SHOP | LEARN_MORE | SIGN_UP | CALL
  cta_url TEXT,
  event_title TEXT,
  event_start TEXT,
  event_end TEXT,
  offer_coupon TEXT,
  offer_terms TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'scheduled', 'archived')),
  scheduled_for TEXT,
  published_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (image_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_google_id
  ON posts(google_post_id) WHERE google_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_location
  ON posts(location_id) WHERE location_id IS NOT NULL;

-- One row per channel per post — channels publish independently
CREATE TABLE IF NOT EXISTS post_channel_jobs (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('site', 'gmb', 'instagram', 'facebook')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'failed', 'skipped')),
  provider_post_id TEXT,
  error TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_posts_site ON posts(site_id, status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_channel_jobs_post ON post_channel_jobs(post_id);

--------------------------------------------------------------------------------
-- Contact & Reservation Submissions
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS contact_submissions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'replied')),
  ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reservation_submissions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  guests TEXT NOT NULL,
  requests TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'confirmed', 'cancelled', 'completed')),
  ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_site ON contact_submissions(site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservation_submissions_site ON reservation_submissions(site_id, date, created_at DESC);

--------------------------------------------------------------------------------
-- Notifications
--------------------------------------------------------------------------------

-- Channel-agnostic outbound notification log.
-- Add email/SMS later by inserting rows with channel='email' — no schema change needed.
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT,
  channel TEXT NOT NULL DEFAULT 'dashboard' CHECK (channel IN ('dashboard', 'email', 'whatsapp')),
  template TEXT NOT NULL,
  recipient TEXT,
  title TEXT,
  payload TEXT,                     -- JSON: template variable values
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'read')),
  provider_message_id TEXT,         -- Provider message id for debugging
  error TEXT,
  read_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_org ON notifications(organization_id, created_at DESC);

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

--------------------------------------------------------------------------------
-- Location Q&A
--------------------------------------------------------------------------------

DROP TABLE IF EXISTS location_photos;

CREATE TABLE IF NOT EXISTS location_qa (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  google_question_id TEXT,
  question TEXT NOT NULL,
  question_author TEXT,
  question_date TEXT,
  answer TEXT,
  answer_author TEXT,
  answer_date TEXT,
  is_owner_answer INTEGER NOT NULL DEFAULT 0,
  upvote_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('gmb','manual')),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES business_locations(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_location_qa_google_id
  ON location_qa(google_question_id) WHERE google_question_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_location_qa_location
  ON location_qa(location_id, status, sort_order);

--------------------------------------------------------------------------------
-- Platform Owner Management
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS platform_content (
  id TEXT PRIMARY KEY,
  page TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (updated_by) REFERENCES user(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS platform_blog_posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  body TEXT NOT NULL,
  excerpt TEXT,
  category TEXT,
  author_id TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (author_id) REFERENCES user(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS platform_contact_submissions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'replied')),
  ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_platform_contact_submissions_status_created
  ON platform_contact_submissions(status, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_analytics (
  id TEXT PRIMARY KEY,
  metric TEXT NOT NULL,
  value INTEGER NOT NULL,
  date TEXT NOT NULL,
  UNIQUE(metric, date)
);
