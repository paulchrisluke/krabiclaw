-- Migration number: 0018 	 2026-06-19
-- Fix sites.plan CHECK constraint: replace legacy (free/pro/enterprise) with actual plan names.
-- SQLite cannot ALTER a CHECK constraint, so recreate the table.
-- Explicit column lists used because contact_phone was added via ALTER TABLE (sits last in the
-- original column order, not after contact_email where the new table places it).

PRAGMA foreign_keys = OFF;

CREATE TABLE sites_new (
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
  contact_phone TEXT,
  source_locale TEXT NOT NULL DEFAULT 'en',
  default_currency TEXT NOT NULL DEFAULT 'THB',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'growth', 'managed', 'seo_accelerator')),
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

INSERT INTO sites_new (
  id, organization_id, theme_id, theme, slug, subdomain,
  custom_domain, custom_domain_status, primary_location_id, public_url,
  brand_name, brand_description, logo_url, logo_asset_id,
  contact_email, contact_phone,
  source_locale, default_currency, status, plan, onboarding_status,
  url_structure, vertical, content_source, media_source,
  settings, last_published_at, created_at, updated_at, updated_by
)
SELECT
  id, organization_id, theme_id, theme, slug, subdomain,
  custom_domain, custom_domain_status, primary_location_id, public_url,
  brand_name, brand_description, logo_url, logo_asset_id,
  contact_email, contact_phone,
  source_locale, default_currency, status,
  CASE plan
    WHEN 'pro' THEN 'growth'
    WHEN 'enterprise' THEN 'managed'
    ELSE plan
  END AS plan,
  onboarding_status,
  url_structure, vertical, content_source, media_source,
  settings, last_published_at, created_at, updated_at, updated_by
FROM sites;

DROP TABLE sites;
ALTER TABLE sites_new RENAME TO sites;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_custom_domain_unique
  ON sites(custom_domain)
  WHERE custom_domain IS NOT NULL;

PRAGMA foreign_keys = ON;
