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
  slug TEXT UNIQUE NOT NULL,
  subdomain TEXT UNIQUE,
  custom_domain TEXT,
  custom_domain_status TEXT DEFAULT 'none',
  primary_location_id TEXT,
  public_url TEXT,
  brand_name TEXT,
  brand_description TEXT,
  logo_url TEXT,
  logo_asset_id TEXT,
  contact_email TEXT,
  source_locale TEXT NOT NULL DEFAULT 'en',
  default_currency TEXT NOT NULL DEFAULT 'THB',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  onboarding_status TEXT DEFAULT 'pending' CHECK (onboarding_status IN ('pending', 'active', 'failed')),
  url_structure TEXT NOT NULL DEFAULT 'location_subdirectories' CHECK (url_structure IN ('location_subdirectories', 'brand_pages')),
  vertical TEXT NOT NULL DEFAULT 'restaurant' CHECK (vertical IN ('restaurant', 'experience', 'retail', 'wellness', 'service')),
  content_source TEXT CHECK (content_source IN ('google_maps', 'client_supplied', 'generated')),
  media_source TEXT CHECK (media_source IN ('client_photos', 'stock', 'mixed')),
  settings TEXT,
  last_published_at TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (theme_id) REFERENCES themes(id),
  FOREIGN KEY (logo_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_one_per_organization
  ON sites(organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_custom_domain_unique
  ON sites(custom_domain)
  WHERE custom_domain IS NOT NULL;

CREATE TABLE IF NOT EXISTS dashboard_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  selected_location_id TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (selected_location_id) REFERENCES business_locations(id) ON DELETE SET NULL,
  UNIQUE(user_id, organization_id)
);

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
  neighborhood TEXT,
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
  description_provenance TEXT CHECK (description_provenance IN ('google_maps','client_supplied','llm_generated','manual_override')),
  special_hours TEXT,
  price_level TEXT,
  attributes TEXT,
  email TEXT,
  facebook_url TEXT,
  facebook_page_id TEXT,
  facebook_connection_id TEXT REFERENCES facebook_pages_connections(id) ON DELETE SET NULL,
  instagram_url TEXT,
  tiktok_url TEXT,
  grab_url TEXT,
  uber_eats_url TEXT,
  foodpanda_url TEXT,
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

CREATE TABLE IF NOT EXISTS facebook_pages_connections (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  connected_by_user_id TEXT,
  facebook_user_id TEXT NOT NULL,
  facebook_page_id TEXT,
  facebook_page_name TEXT,
  encrypted_user_token TEXT NOT NULL,
  encrypted_page_token TEXT,
  user_token_expires_at TEXT,
  scopes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'error')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (connected_by_user_id) REFERENCES user(id) ON DELETE SET NULL,
  UNIQUE(organization_id, site_id)
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

CREATE TABLE IF NOT EXISTS site_locales (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  label TEXT,
  is_source BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'disabled')),
  fallback_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  UNIQUE(organization_id, site_id, locale)
);

CREATE INDEX IF NOT EXISTS idx_site_locales_site
  ON site_locales(site_id, status, locale);

CREATE TABLE IF NOT EXISTS site_content_translations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  location_id TEXT,
  locale TEXT NOT NULL,
  page TEXT NOT NULL,
  field TEXT NOT NULL,
  content TEXT,
  hero_title TEXT,
  hero_subtitle TEXT,
  value TEXT,
  type TEXT NOT NULL DEFAULT 'text',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'stale')),
  source_hash TEXT,
  translated_at TEXT,
  reviewed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES business_locations(id) ON DELETE CASCADE,
  UNIQUE(organization_id, site_id, location_id, locale, page, field)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_site_content_translations_site_level_unique
  ON site_content_translations(organization_id, site_id, locale, page, field)
  WHERE location_id IS NULL;

CREATE TABLE IF NOT EXISTS menu_translations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  menu_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  name TEXT,
  description TEXT,
  section_order TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'stale')),
  source_hash TEXT,
  translated_at TEXT,
  reviewed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE CASCADE,
  UNIQUE(organization_id, site_id, menu_id, locale)
);

CREATE TABLE IF NOT EXISTS menu_item_translations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  menu_item_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  section TEXT,
  name TEXT,
  description TEXT,
  allergens TEXT,
  ingredients TEXT,
  dietary_notes TEXT,
  preparation TEXT,
  serving_note TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'stale')),
  source_hash TEXT,
  translated_at TEXT,
  reviewed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
  UNIQUE(organization_id, site_id, menu_item_id, locale)
);

CREATE TABLE IF NOT EXISTS business_location_translations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  title TEXT,
  address TEXT,
  city TEXT,
  description TEXT,
  short_description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'stale')),
  source_hash TEXT,
  translated_at TEXT,
  reviewed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES business_locations(id) ON DELETE CASCADE,
  UNIQUE(organization_id, site_id, location_id, locale)
);

CREATE TABLE IF NOT EXISTS post_translations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  title TEXT,
  body TEXT,
  event_title TEXT,
  offer_terms TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'stale')),
  source_hash TEXT,
  translated_at TEXT,
  reviewed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  UNIQUE(organization_id, site_id, post_id, locale)
);

CREATE TABLE IF NOT EXISTS translation_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  source_locale TEXT NOT NULL,
  target_locale TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'site' CHECK (scope IN ('site', 'content', 'menus', 'locations', 'posts')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  total_items INTEGER NOT NULL DEFAULT 0,
  total_chars INTEGER NOT NULL DEFAULT 0,
  estimated_input_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_credits INTEGER NOT NULL DEFAULT 0,
  actual_input_tokens INTEGER NOT NULL DEFAULT 0,
  actual_output_tokens INTEGER NOT NULL DEFAULT 0,
  actual_credits INTEGER NOT NULL DEFAULT 0,
  processed_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_by TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_translation_jobs_site
  ON translation_jobs(site_id, target_locale, status, created_at DESC);

CREATE TABLE IF NOT EXISTS translation_job_items (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  target_locale TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('site_content', 'menu', 'menu_item', 'business_location', 'post')),
  entity_id TEXT NOT NULL,
  location_id TEXT,
  page TEXT,
  field TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  source_chars INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'skipped')),
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (job_id) REFERENCES translation_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_translation_job_items_job
  ON translation_job_items(job_id, status, entity_type);


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
  category TEXT CHECK (category IN ('exterior', 'interior', 'food', 'menu', 'team', 'other')),

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
  section_order TEXT,
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
  price_amount NUMERIC,
  image_asset_id TEXT,
  available BOOLEAN NOT NULL DEFAULT true,
  featured BOOLEAN NOT NULL DEFAULT false,
  featured_sort_order INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  allergens TEXT,
  ingredients TEXT,
  dietary_notes TEXT,
  preparation TEXT,
  serving_note TEXT,
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
  source TEXT DEFAULT 'direct' CHECK (source IN ('direct','google','google_maps','llm_generated','manual_override')),
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
  auto_topup_enabled INTEGER NOT NULL DEFAULT 0,
  auto_topup_bundle INTEGER NOT NULL DEFAULT 500,
  auto_topup_threshold INTEGER NOT NULL DEFAULT 100,
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
  cancellation_token_hash TEXT,
  cancellation_token_expires_at TEXT,
  cancellation_token_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_site ON contact_submissions(site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservation_submissions_site ON reservation_submissions(site_id, date, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservation_submissions_cancel_token_hash
  ON reservation_submissions(cancellation_token_hash)
  WHERE cancellation_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reservation_submissions_cancel_token
  ON reservation_submissions(site_id, id, cancellation_token_hash);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON rate_limits(expires_at);

-- Trigger to prune expired rate limits
CREATE TRIGGER IF NOT EXISTS trg_prune_rate_limits
AFTER INSERT ON rate_limits
WHEN abs(random()) % 100 < 5
BEGIN
  DELETE FROM rate_limits WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
END;

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
-- ChowBot Conversations
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chowbot_conversations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  active_channel TEXT NOT NULL DEFAULT 'dashboard' CHECK (active_channel IN ('dashboard', 'whatsapp')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  selected_location_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
  FOREIGN KEY (selected_location_id) REFERENCES business_locations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_chowbot_conversations_site
  ON chowbot_conversations(site_id, user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS chowbot_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  user_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  channel TEXT NOT NULL CHECK (channel IN ('dashboard', 'whatsapp')),
  content TEXT,
  media TEXT,
  meta_message_id TEXT UNIQUE,
  tool_calls TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'read')),
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (content IS NOT NULL OR media IS NOT NULL OR tool_calls IS NOT NULL),
  FOREIGN KEY (conversation_id) REFERENCES chowbot_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_chowbot_messages_conversation
  ON chowbot_messages(conversation_id, created_at ASC);

CREATE TRIGGER IF NOT EXISTS trg_chowbot_messages_consistency_insert
BEFORE INSERT ON chowbot_messages
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM chowbot_conversations c
  WHERE c.id = NEW.conversation_id
    AND (c.organization_id != NEW.organization_id OR c.site_id != NEW.site_id)
)
BEGIN
  SELECT RAISE(ABORT, 'chowbot_messages conversation organization/site mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_chowbot_messages_consistency_update
BEFORE UPDATE ON chowbot_messages
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM chowbot_conversations c
  WHERE c.id = NEW.conversation_id
    AND (c.organization_id != NEW.organization_id OR c.site_id != NEW.site_id)
)
BEGIN
  SELECT RAISE(ABORT, 'chowbot_messages conversation organization/site mismatch');
END;

CREATE TABLE IF NOT EXISTS chowbot_channel_state (
  user_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('dashboard', 'whatsapp')),
  selected_site_id TEXT,
  active_conversation_id TEXT,
  pending_media TEXT,
  pending_confirmation TEXT,
  last_inbound_id TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, channel),
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
  FOREIGN KEY (selected_site_id) REFERENCES sites(id) ON DELETE SET NULL,
  FOREIGN KEY (active_conversation_id) REFERENCES chowbot_conversations(id) ON DELETE SET NULL
);

CREATE TRIGGER IF NOT EXISTS trg_chowbot_channel_state_conversation_user_insert
BEFORE INSERT ON chowbot_channel_state
FOR EACH ROW
WHEN NEW.active_conversation_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM chowbot_conversations c
    WHERE c.id = NEW.active_conversation_id
      AND c.user_id = NEW.user_id
  )
BEGIN
  SELECT RAISE(ABORT, 'active conversation must belong to the same user');
END;

CREATE TRIGGER IF NOT EXISTS trg_chowbot_channel_state_conversation_user_update
BEFORE UPDATE ON chowbot_channel_state
FOR EACH ROW
WHEN NEW.active_conversation_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM chowbot_conversations c
    WHERE c.id = NEW.active_conversation_id
      AND c.user_id = NEW.user_id
  )
BEGIN
  SELECT RAISE(ABORT, 'active conversation must belong to the same user');
END;

CREATE TRIGGER IF NOT EXISTS trg_chowbot_channel_state_conversation_site_insert
BEFORE INSERT ON chowbot_channel_state
FOR EACH ROW
WHEN NEW.active_conversation_id IS NOT NULL
  AND NEW.selected_site_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM chowbot_conversations c
    WHERE c.id = NEW.active_conversation_id
      AND c.site_id = NEW.selected_site_id
  )
BEGIN
  SELECT RAISE(ABORT, 'active conversation site must match selected site');
END;

CREATE TRIGGER IF NOT EXISTS trg_chowbot_channel_state_conversation_site_update
BEFORE UPDATE ON chowbot_channel_state
FOR EACH ROW
WHEN NEW.active_conversation_id IS NOT NULL
  AND NEW.selected_site_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM chowbot_conversations c
    WHERE c.id = NEW.active_conversation_id
      AND c.site_id = NEW.selected_site_id
  )
BEGIN
  SELECT RAISE(ABORT, 'active conversation site must match selected site');
END;

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
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('gmb','google_maps','manual','llm_generated','manual_override')),
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
  featured_image_asset_id TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (author_id) REFERENCES user(id) ON DELETE SET NULL,
  FOREIGN KEY (featured_image_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS platform_docs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  body TEXT NOT NULL,
  excerpt TEXT,
  category TEXT CHECK (category IN ('Getting Started', 'Menu Management', 'Theme Customization', 'SEO & Marketing', 'Integrations', 'Advanced')),
  author_id TEXT,
  seo_description TEXT,
  seo_keywords TEXT,
  featured_image_asset_id TEXT,
  sort_order INTEGER DEFAULT 0,
  parent_doc_id TEXT,
  difficulty_level TEXT CHECK (difficulty_level IN ('Beginner', 'Intermediate', 'Advanced')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (author_id) REFERENCES user(id) ON DELETE SET NULL,
  FOREIGN KEY (featured_image_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL,
  FOREIGN KEY (parent_doc_id) REFERENCES platform_docs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_docs_category ON platform_docs(category, status, sort_order);
CREATE INDEX IF NOT EXISTS idx_platform_docs_parent ON platform_docs(parent_doc_id, status, sort_order);

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

--------------------------------------------------------------------------------
-- Site Analytics
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS site_pageview_events (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  location_id TEXT,
  page_path TEXT NOT NULL,
  referrer TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  session_id TEXT,
  duration_seconds INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES business_locations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pageview_events_site_date
  ON site_pageview_events(site_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pageview_events_session
  ON site_pageview_events(site_id, session_id);

CREATE TABLE IF NOT EXISTS site_analytics_daily (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  date TEXT NOT NULL,
  page_views INTEGER DEFAULT 0,
  unique_sessions INTEGER DEFAULT 0,
  avg_session_duration INTEGER DEFAULT 0,
  top_pages TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(site_id, date),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_site
  ON site_analytics_daily(site_id, date DESC);

--------------------------------------------------------------------------------
-- Site Transfer Requests
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS site_transfer_requests (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  from_organization_id TEXT NOT NULL,
  to_email TEXT NOT NULL,
  token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  initiated_by_user_id TEXT NOT NULL,
  accepted_by_user_id TEXT,
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (initiated_by_user_id) REFERENCES user(id),
  FOREIGN KEY (accepted_by_user_id) REFERENCES user(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_site_transfer_token
  ON site_transfer_requests(token);

CREATE INDEX IF NOT EXISTS idx_site_transfer_site
  ON site_transfer_requests(site_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_site_transfer_pending
  ON site_transfer_requests(site_id) WHERE status = 'pending';

--------------------------------------------------------------------------------
-- Experiences
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS experiences (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  location_id TEXT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  tagline TEXT,
  body TEXT,
  image_asset_id TEXT,
  price TEXT,
  duration_minutes INTEGER,
  max_capacity INTEGER,
  time_slots TEXT,
  available_note TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'sold_out')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  featured BOOLEAN NOT NULL DEFAULT false,
  featured_sort_order INTEGER NOT NULL DEFAULT 0,
  seo_title TEXT,
  seo_description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by TEXT,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES business_locations(id) ON DELETE SET NULL,
  FOREIGN KEY (image_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_experiences_site_slug
  ON experiences(site_id, slug);

CREATE INDEX IF NOT EXISTS idx_experiences_site
  ON experiences(site_id, status, sort_order);

CREATE TABLE IF NOT EXISTS experience_bookings (
  id TEXT PRIMARY KEY,
  experience_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  guest_email TEXT NOT NULL,
  guest_phone TEXT,
  party_size INTEGER NOT NULL DEFAULT 1,
  booking_date TEXT NOT NULL,
  time_slot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  notes TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (experience_id) REFERENCES experiences(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_experience_bookings_experience
  ON experience_bookings(experience_id, booking_date, time_slot);

CREATE INDEX IF NOT EXISTS idx_experience_bookings_site
  ON experience_bookings(site_id, status, created_at DESC);

--------------------------------------------------------------------------------
-- Site Events
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS site_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  location_id TEXT,
  actor_id TEXT,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES business_locations(id) ON DELETE SET NULL,
  FOREIGN KEY (actor_id) REFERENCES user(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_site_events_site
  ON site_events(site_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_events_location
  ON site_events(location_id, created_at DESC)
  WHERE location_id IS NOT NULL;

--------------------------------------------------------------------------------
-- Service Add-on Purchases
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS service_addon_purchases (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  addon_type TEXT NOT NULL,
  stripe_payment_intent_id TEXT,
  fulfilled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE
);

--------------------------------------------------------------------------------
-- Google Place Snapshots
-- Raw Place API responses stored at import time for repeatability and audit.
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS google_place_snapshots (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  location_id TEXT,
  place_id TEXT NOT NULL,
  source_url TEXT,
  snapshot_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES business_locations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_google_place_snapshots_site
  ON google_place_snapshots(site_id);

CREATE INDEX IF NOT EXISTS idx_google_place_snapshots_place_id
  ON google_place_snapshots(place_id);

CREATE INDEX IF NOT EXISTS idx_service_addon_purchases_org
  ON service_addon_purchases(organization_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_addon_purchases_stripe_payment_intent_id
  ON service_addon_purchases(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

