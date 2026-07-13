-- NCLS Blawby local seed
-- Generated from /Users/paulchrisluke/Repos2026/krabiclaw/client-imports/north-carolina-legal-services/client-manifest.json
-- Preview at: http://ncls.localhost:3000

PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO themes (id, name, slug, version, description, status)
VALUES ('blawby-theme-v1', 'Blawby', 'blawby', '1.0.0', 'Professional-service public template', 'active');

DELETE FROM sites WHERE id = 'site-ncls-blawby' OR subdomain = 'ncls';
DELETE FROM organization WHERE id = 'org-ncls-blawby';
DELETE FROM site_domains WHERE domain IN ('ncls.localhost', 'ncls.krabiclaw.com', 'northcarolinalegalservices.org');
DELETE FROM user WHERE id = 'user-ncls-blawby';

INSERT INTO user (id, name, email, emailVerified, image, role, createdAt, updatedAt)
VALUES ('user-ncls-blawby', 'Rich Gittings', 'ncls-blawby@example.test', 1, 'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/c5293ac64f48747e7b4b.webp', 'admin', unixepoch(), unixepoch());

INSERT INTO organization (id, name, slug, createdAt)
VALUES ('org-ncls-blawby', 'North Carolina Legal Services', 'north-carolina-legal-services', unixepoch());

INSERT INTO member (id, organizationId, userId, role, createdAt)
VALUES ('member-ncls-blawby', 'org-ncls-blawby', 'user-ncls-blawby', 'owner', unixepoch());

INSERT INTO sites (
  id, organization_id, theme_id, theme, slug, subdomain, public_url,
  brand_name, brand_description, contact_email, contact_phone,
  source_locale, default_currency, status, plan, onboarding_status,
  url_structure, vertical, content_source, media_source, settings, created_at, updated_at
) VALUES (
  'site-ncls-blawby', 'org-ncls-blawby', 'blawby-theme-v1', 'blawby',
  'ncls', 'ncls', 'http://ncls.localhost:3000',
  'North Carolina Legal Services', 'Access to Justice for All. North Carolina''s affordable legal services. We believe that access to the Justice System is a fundamental right. At North Carolina Legal Services we are committed to removing financial barriers that prevent many in our community from obtaining high-quality legal assistance.',
  'contact@northcarolinalegalservices.org', '(984) 777-8288',
  'en', 'USD', 'active', 'managed', 'active',
  'brand_pages', 'service', 'client_supplied', 'client_photos',
  '{"favicon_url":"/tenants/northcarolinalegalservices/favicon.svg"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO site_domains (id, organization_id, site_id, domain, type, role, status, dns_status, activated_at, created_at, updated_at)
VALUES
  ('domain-ncls-localhost', 'org-ncls-blawby', 'site-ncls-blawby', 'ncls.localhost', 'subdomain', 'canonical', 'active', 'valid', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('domain-ncls-prod-subdomain', 'org-ncls-blawby', 'site-ncls-blawby', 'ncls.krabiclaw.com', 'subdomain', 'secondary', 'active', 'valid', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO business_locations (
  id, organization_id, site_id, slug, title, city, address, phone, email,
  website_url, maps_url, categories, is_primary, status, description, timezone,
  created_at, updated_at
) VALUES (
  'loc-ncls-blawby-main', 'org-ncls-blawby', 'site-ncls-blawby', 'main',
  'North Carolina Legal Services', 'North Carolina',
  NULL, '(984) 777-8288', 'contact@northcarolinalegalservices.org', 'https://northcarolinalegalservices.org', NULL,
  '["LegalService","ProfessionalService"]', 1, 'active',
  'Access to Justice for All. North Carolina''s affordable legal services. We believe that access to the Justice System is a fundamental right. At North Carolina Legal Services we are committed to removing financial barriers that prevent many in our community from obtaining high-quality legal assistance.', 'America/New_York', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

UPDATE sites SET primary_location_id = 'loc-ncls-blawby-main' WHERE id = 'site-ncls-blawby';

INSERT INTO site_locales (id, organization_id, site_id, locale, label, is_source, status, fallback_enabled)
VALUES ('locale-ncls-en', 'org-ncls-blawby', 'site-ncls-blawby', 'en', 'English', 1, 'published', 1);

INSERT INTO media_assets (
  id, organization_id, site_id, location_id, kind, provider, source,
  cloudflare_image_id, r2_key, google_media_name, public_url, thumbnail_url,
  mime_type, file_name, file_size, width, height, duration, alt_text,
  category, status, created_by_user_id, created_at, updated_at, delete_pending_at
) VALUES
(
  'asset_ncls_media_logo_3784bf7c', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'file',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/c48b4d590eecc120f76e.svg', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/c48b4d590eecc120f76e.svg', NULL, 'image/svg+xml',
  'logo.svg',
  42655, 248, 75, NULL, 'brand_logo',
  'logo', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_logo-dark_1f5ffbd3', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'file',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/3869491ea5373de6bb34.svg', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/3869491ea5373de6bb34.svg', NULL, 'image/svg+xml',
  'logo-dark.svg',
  42749, 250, 75, NULL, 'brand_logo_dark',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_rich-gittings-author_42db19d0', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/c5293ac64f48747e7b4b.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/c5293ac64f48747e7b4b.webp', NULL, 'image/webp',
  'rich-gittings-author.webp',
  9924, 96, 96, NULL, 'article_author_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_background-hero_05f81e86', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/599abbcd10dd490792d2.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/599abbcd10dd490792d2.webp', NULL, 'image/webp',
  'background-hero.webp',
  63930, 1920, 804, NULL, 'home_hero_background',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_background-features_d3572b1b', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/be87d08d6e14bf57ecef.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/be87d08d6e14bf57ecef.webp', NULL, 'image/webp',
  'background-features.webp',
  14052, 1920, 758, NULL, 'services_background',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_background-feature-2_970a5c32', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/c53c7b8d7a6de1e7cc70.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/c53c7b8d7a6de1e7cc70.webp', NULL, 'image/webp',
  'background-feature-2.webp',
  19916, 456, 1095, NULL, 'qa_background',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_background-cta_79bdbc52', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/735d1ec58bf43ca897ce.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/735d1ec58bf43ca897ce.webp', NULL, 'image/webp',
  'background-cta.webp',
  504222, 1920, 638, NULL, 'consultation_cta_background',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_logo-2_e3a91ed9', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/9cb15d96c31f5ba5fb2c.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/9cb15d96c31f5ba5fb2c.webp', NULL, 'image/webp',
  'logo-2.webp',
  8924, 300, 370, NULL, 'consultation_cta_featured',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_getting-a-divorce-in-north-carolina_ffbfbfd0', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/ea4d301a3cefbbd17a44.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/ea4d301a3cefbbd17a44.webp', NULL, 'image/webp',
  'getting_a_divorce_in_north_carolina.webp',
  47036, 800, 800, NULL, 'approach_supporting_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_writing-your-own-will-how-it-works_c1f1ad9b', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/6b9b810084d4809b6d5d.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/6b9b810084d4809b6d5d.webp', NULL, 'image/webp',
  'writing-your-own-will-how-it-works.webp',
  366296, 1024, 1024, NULL, 'approach_supporting_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_rich-gittings_78d5beeb', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/5b03236f92812fb7db78.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/5b03236f92812fb7db78.webp', NULL, 'image/webp',
  'rich-gittings.webp',
  420180, 800, 800, NULL, 'team_portrait',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_jonathan-matthews_b2791200', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/15bba3d4f3f3fcb40dac.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/15bba3d4f3f3fcb40dac.webp', NULL, 'image/webp',
  'jonathan-matthews.webp',
  1654, 120, 120, NULL, 'reviewer_photo',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_morgan-brock-smith_9d78a2ce', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/238e8a7cc3be720f5725.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/238e8a7cc3be720f5725.webp', NULL, 'image/webp',
  'morgan-brock-smith.webp',
  3298, 120, 120, NULL, 'reviewer_photo',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_kyle-beausoleil_b844eda2', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/70782b21e0a213f15dbd.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/70782b21e0a213f15dbd.webp', NULL, 'image/webp',
  'kyle-beausoleil.webp',
  1648, 120, 120, NULL, 'reviewer_photo',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_marcus-morrow_a3a2c491', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/f169dd677c4e18d8c61c.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/f169dd677c4e18d8c61c.webp', NULL, 'image/webp',
  'marcus-morrow.webp',
  2880, 120, 120, NULL, 'reviewer_photo',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_kristen-rissell_6ef6adee', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/903ee6ad336ed296ad1b.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/903ee6ad336ed296ad1b.webp', NULL, 'image/webp',
  'kristen-rissell.webp',
  1374, 120, 120, NULL, 'reviewer_photo',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_amy-hahn_072705a2', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/e59d9ce19451c918fd59.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e59d9ce19451c918fd59.webp', NULL, 'image/webp',
  'amy-hahn.webp',
  2954, 112, 112, NULL, 'reviewer_photo',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_mission_5fd91553', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'file',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/d9a827c04465883d96b5.svg', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/d9a827c04465883d96b5.svg', NULL, 'image/svg+xml',
  'mission.svg',
  3392, 64, 64, NULL, 'tenant_feature_icon',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_people_33026f02', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'file',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/1b05529f94fe9dce7161.svg', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/1b05529f94fe9dce7161.svg', NULL, 'image/svg+xml',
  'people.svg',
  3566, 64, 64, NULL, 'tenant_feature_icon',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_vision_1bd2b537', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'file',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/3eaccea50d2ecfa63643.svg', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/3eaccea50d2ecfa63643.svg', NULL, 'image/svg+xml',
  'vision.svg',
  2065, 64, 64, NULL, 'tenant_feature_icon',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_family-law_68c10f73', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/863bceee9c6e5e4f41cb.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/863bceee9c6e5e4f41cb.webp', NULL, 'image/webp',
  'family-law.webp',
  274650, 704, 478, NULL, 'offering_thumbnail',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_divorce-in-nc-01_66963367', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/e5c69cf788b3fd2728e3.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e5c69cf788b3fd2728e3.webp', NULL, 'image/webp',
  'divorce-in-nc-01.webp',
  545556, 800, 800, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_divorce-in-nc-02_2db5e510', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/0d240b51fd80bf66bc57.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/0d240b51fd80bf66bc57.webp', NULL, 'image/webp',
  'divorce-in-nc-02.webp',
  475066, 800, 800, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_divorce-in-nc-03_0f442303', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/763eaae30dbb867e1f71.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/763eaae30dbb867e1f71.webp', NULL, 'image/webp',
  'divorce-in-nc-03.webp',
  385110, 800, 800, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_divorce-in-nc-04_33e61dd7', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/af72889de687d31adbf9.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/af72889de687d31adbf9.webp', NULL, 'image/webp',
  'divorce-in-nc-04.webp',
  397068, 800, 800, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_divorce-in-nc-05_23e394f3', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/520426ca778e2fe081e8.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/520426ca778e2fe081e8.webp', NULL, 'image/webp',
  'divorce-in-nc-05.webp',
  345848, 800, 800, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_divorce-in-nc-06_95d29d9e', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/f74b2db21366fc54057a.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/f74b2db21366fc54057a.webp', NULL, 'image/webp',
  'divorce-in-nc-06.webp',
  357314, 800, 800, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_divorce-in-nc-07_665085df', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/8b5b1bc8af553cf84d1a.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/8b5b1bc8af553cf84d1a.webp', NULL, 'image/webp',
  'divorce-in-nc-07.webp',
  328956, 800, 800, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_alimony_413fb782', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/7277c674a1f8c5581f10.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/7277c674a1f8c5581f10.webp', NULL, 'image/webp',
  'alimony.webp',
  437700, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_childcustody_f6ce55e7', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/ab63ba56d1d12826f532.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/ab63ba56d1d12826f532.webp', NULL, 'image/webp',
  'childcustody.webp',
  426880, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_childsupport_e5e12c06', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/5421e9e4fd21b3c4826b.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/5421e9e4fd21b3c4826b.webp', NULL, 'image/webp',
  'childsupport.webp',
  410844, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_custodial-power-of-attorney_0ce0fb82', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/f24afb9578caa8eb2a2f.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/f24afb9578caa8eb2a2f.webp', NULL, 'image/webp',
  'custodial-power-of-attorney.webp',
  564246, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_divorce_11224e5f', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/926d9d9f906913b2d02a.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/926d9d9f906913b2d02a.webp', NULL, 'image/webp',
  'divorce.webp',
  337918, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_custody-evaluations_03a610e8', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/280c3536f333fe6f5560.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/280c3536f333fe6f5560.webp', NULL, 'image/webp',
  'custody-evaluations.webp',
  552722, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_prenuptialagreement_35bd569a', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/26c7750899fbb60c91f1.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/26c7750899fbb60c91f1.webp', NULL, 'image/webp',
  'prenuptialagreement.webp',
  634190, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_separationagreement_8cb198cc', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/4b066f9c7c954ee7c03a.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/4b066f9c7c954ee7c03a.webp', NULL, 'image/webp',
  'separationagreement.webp',
  603002, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_equitabledistribution_e4b88aef', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/9160b2644f7039a0a19b.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/9160b2644f7039a0a19b.webp', NULL, 'image/webp',
  'equitabledistribution.webp',
  538976, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_domesticviolenceprotectiveorder_5a5178d7', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/291220f9e47a492ff25a.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/291220f9e47a492ff25a.webp', NULL, 'image/webp',
  'domesticviolenceprotectiveorder.webp',
  703676, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_visitation_eb72e984', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/1c3d21a61dd22b9e16c0.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/1c3d21a61dd22b9e16c0.webp', NULL, 'image/webp',
  'visitation.webp',
  593528, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_enforcementofcourtorders_ad5133df', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/3d82790384b45abcb2ba.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/3d82790384b45abcb2ba.webp', NULL, 'image/webp',
  'enforcementofcourtorders.webp',
  616966, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_mediationservices_34297268', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/6fa2f3b50a4653dd697c.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/6fa2f3b50a4653dd697c.webp', NULL, 'image/webp',
  'mediationservices.webp',
  677554, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_small-business_1a0842cf', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/9447dc6ad951a53c7c0a.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/9447dc6ad951a53c7c0a.webp', NULL, 'image/webp',
  'small-business.webp',
  296088, 704, 478, NULL, 'offering_thumbnail',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_small-business-01_f80a277a', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/28b8d371ac381ea5737c.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/28b8d371ac381ea5737c.webp', NULL, 'image/webp',
  'small-business-01.webp',
  397346, 800, 800, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_small-business-02_e69641e9', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/047f4c31c0f89bdd9e89.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/047f4c31c0f89bdd9e89.webp', NULL, 'image/webp',
  'small-business-02.webp',
  291664, 800, 800, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_small-business-03_f254a190', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/0c807f38cee2f3a80c7c.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/0c807f38cee2f3a80c7c.webp', NULL, 'image/webp',
  'small-business-03.webp',
  385718, 800, 800, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_small-business-04_88f44ad4', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/d05cf71b8859b687e317.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/d05cf71b8859b687e317.webp', NULL, 'image/webp',
  'small-business-04.webp',
  315720, 800, 800, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_small-business-05_127bce1a', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/88cb9b4c33eadbeb9d2c.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/88cb9b4c33eadbeb9d2c.webp', NULL, 'image/webp',
  'small-business-05.webp',
  335106, 800, 800, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_small-business-06_a93aac42', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/cd8606210abdc587ff17.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/cd8606210abdc587ff17.webp', NULL, 'image/webp',
  'small-business-06.webp',
  232676, 800, 800, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_small-business-07_48518e0d', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/3e9b7da5492e13602fe2.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/3e9b7da5492e13602fe2.webp', NULL, 'image/webp',
  'small-business-07.webp',
  368506, 800, 800, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_small-business-08_b85caf6a', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/9111abd4cd66a9820d69.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/9111abd4cd66a9820d69.webp', NULL, 'image/webp',
  'small-business-08.webp',
  161458, 800, 800, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_small-business-09_af5ffb60', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/cf853cdfd0902a345de9.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/cf853cdfd0902a345de9.webp', NULL, 'image/webp',
  'small-business-09.webp',
  284632, 800, 800, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_arbitration-mediation_82f7f64f', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/cb5056b64d904d8735b9.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/cb5056b64d904d8735b9.webp', NULL, 'image/webp',
  'Arbitration_mediation.webp',
  326182, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_businessentityformation_35a7d49e', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/a90292c48419da132615.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/a90292c48419da132615.webp', NULL, 'image/webp',
  'businessentityformation.webp',
  312680, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_compliance_9c4fb71d', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/05b49768af802ba8e3d8.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/05b49768af802ba8e3d8.webp', NULL, 'image/webp',
  'compliance.webp',
  372930, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_commercial-litigation_5c17e27c', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/1d9c91908846078577de.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/1d9c91908846078577de.webp', NULL, 'image/webp',
  'commercial-litigation.webp',
  307994, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_contracts_65920664', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/f67f4a2fe91abf1e5717.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/f67f4a2fe91abf1e5717.webp', NULL, 'image/webp',
  'contracts.webp',
  500684, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_employment-law_6fe055d1', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/16573c795d153831b37f.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/16573c795d153831b37f.webp', NULL, 'image/webp',
  'employment-law.webp',
  350538, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_nonprofit-formation-and-governance_9484c0d5', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/6b9a6aea1fd95c7662ce.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/6b9a6aea1fd95c7662ce.webp', NULL, 'image/webp',
  'nonprofit-formation-and-governance.webp',
  521414, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_partnership-agreements_9ef83ec8', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/c5b2bf714e3c54b85675.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/c5b2bf714e3c54b85675.webp', NULL, 'image/webp',
  'partnership-agreements.webp',
  424790, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_real-estate-transactions_1d2f2781', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/369636058474b338d070.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/369636058474b338d070.webp', NULL, 'image/webp',
  'real-estate-transactions.webp',
  632750, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_risk-management_d0c2987e', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/6a7296935dad30625906.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/6a7296935dad30625906.webp', NULL, 'image/webp',
  'risk-management.webp',
  399348, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_shareholder-agreements_25444a77', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/002d88bab34cb3310870.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/002d88bab34cb3310870.webp', NULL, 'image/webp',
  'shareholder-agreements.webp',
  480854, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_child-support-modification_01c27cdc', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/314e050d62e204adaa64.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/314e050d62e204adaa64.webp', NULL, 'image/webp',
  'child-support-modification.webp',
  304328, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_taxation_3a5d259d', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/48f60b831a9cb80561bf.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/48f60b831a9cb80561bf.webp', NULL, 'image/webp',
  'taxation.webp',
  487576, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_employment_c82dedab', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/7f9f3d4b51b2d9999ca1.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/7f9f3d4b51b2d9999ca1.webp', NULL, 'image/webp',
  'employment.webp',
  266756, 704, 478, NULL, 'offering_thumbnail',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_breach-of-employment-contract_89e48215', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/24cd363e18b7b2407d82.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/24cd363e18b7b2407d82.webp', NULL, 'image/webp',
  'Breach-of-Employment-Contract.webp',
  464484, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_civil-rights-violations_c7c3e34d', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/fe44f58092bac0c66e11.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/fe44f58092bac0c66e11.webp', NULL, 'image/webp',
  'Civil-Rights-Violations.webp',
  491622, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_contract-and-agreement-disputes_0997d408', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/fa2d7d35a68c6adc59ff.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/fa2d7d35a68c6adc59ff.webp', NULL, 'image/webp',
  'contract-and-agreement-disputes.webp',
  325626, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_defamation_a13559ce', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/5793f2d5c13b7bb09b3b.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/5793f2d5c13b7bb09b3b.webp', NULL, 'image/webp',
  'defamation.webp',
  417374, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_employee-benefits-and-rights_6794ac34', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/7686a349466bf4f52c7a.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/7686a349466bf4f52c7a.webp', NULL, 'image/webp',
  'employee-benefits-and-rights.webp',
  567546, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_fmla-violations_05230833', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/ecced05026b225fd4588.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/ecced05026b225fd4588.webp', NULL, 'image/webp',
  'FMLA-violations.webp',
  522152, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_harassment_052d0f3f', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/4178d0f78353324bca01.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/4178d0f78353324bca01.webp', NULL, 'image/webp',
  'harassment.webp',
  709108, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_military-leave_1376402f', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/329f85b1d6d4783e39d3.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/329f85b1d6d4783e39d3.webp', NULL, 'image/webp',
  'military-leave.webp',
  645896, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_privacy-rights-at-the-workplace_97245c8c', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/7c267c3e1149a24334cf.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/7c267c3e1149a24334cf.webp', NULL, 'image/webp',
  'privacy-rights-at-the-workplace.webp',
  661308, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_retaliation-and-whistleblower-claims_dbb7d5cc', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/06bfcb286a3f89e89c96.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/06bfcb286a3f89e89c96.webp', NULL, 'image/webp',
  'retaliation-and-whistleblower-claims.webp',
  220306, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_union-rights-and-collective-bargining_69db1425', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/bfdfebefd796ae2a75eb.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/bfdfebefd796ae2a75eb.webp', NULL, 'image/webp',
  'union-rights-and-collective-bargining.webp',
  686184, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_wage-and-hour-disputes_f11d4b2e', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/f3e6ab83f162735a3b1b.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/f3e6ab83f162735a3b1b.webp', NULL, 'image/webp',
  'wage-and-hour-disputes.webp',
  590402, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_workers-compensation-claims_c67a9ffb', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/7683cbe17b8cddff82f5.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/7683cbe17b8cddff82f5.webp', NULL, 'image/webp',
  'workers-compensation-claims.webp',
  681728, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_workplace-safety-and-osha-violations_48086dc9', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/eb733bb7d42ae15d8fb3.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/eb733bb7d42ae15d8fb3.webp', NULL, 'image/webp',
  'workplace-safety-and-OSHA-violations.webp',
  626138, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_wrongful-termination_7256eb38', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/97fd1db61a66b7203b5b.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/97fd1db61a66b7203b5b.webp', NULL, 'image/webp',
  'wrongful-termination.webp',
  620742, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_tenant-rights_8a6e4137', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/7c4f4b78ebefb2613fdd.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/7c4f4b78ebefb2613fdd.webp', NULL, 'image/webp',
  'tenant-rights.webp',
  426640, 704, 478, NULL, 'offering_thumbnail',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_eviction-defense_2411d4cf', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/5efb0c8c3ae0955f76e0.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/5efb0c8c3ae0955f76e0.webp', NULL, 'image/webp',
  'eviction-defense.webp',
  357772, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_housing-discrimination_72bd521f', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/b82e0074cc0e8a216b4c.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/b82e0074cc0e8a216b4c.webp', NULL, 'image/webp',
  'housing-discrimination.webp',
  535890, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_illegal-landlord-practices_e32dc889', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/fa3fdb1d59d899af2565.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/fa3fdb1d59d899af2565.webp', NULL, 'image/webp',
  'illegal-landlord-practices.webp',
  484132, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_lease-review_ac500ea1', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/a54cf90957b32edf379d.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/a54cf90957b32edf379d.webp', NULL, 'image/webp',
  'lease-review.webp',
  302212, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_lease-termination_1cdce616', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/8ec41e5524cd4b1c56ad.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/8ec41e5524cd4b1c56ad.webp', NULL, 'image/webp',
  'lease-termination.webp',
  316348, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_maintenance-and-repair-advocacy_3464d25a', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/10a9cfdeab21e0cd9aec.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/10a9cfdeab21e0cd9aec.webp', NULL, 'image/webp',
  'Maintenance-and-Repair-Advocacy.webp',
  710262, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_quiet-enjoyment-violations_bf54720e', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/7e5fee11c63ab43935a5.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/7e5fee11c63ab43935a5.webp', NULL, 'image/webp',
  'quiet-enjoyment-violations.webp',
  312194, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_rent-overcharge-and-deposit-disputes_a0c4f3f9', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/01222e125328547e3575.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/01222e125328547e3575.webp', NULL, 'image/webp',
  'rent-overcharge-and-deposit-disputes.webp',
  387904, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_retaliatory-eviction_5b689297', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/3666b857ce471928d1b5.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/3666b857ce471928d1b5.webp', NULL, 'image/webp',
  'retaliatory-eviction.webp',
  429252, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_roommate-disputes_95b7527c', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/86aad206dfcc15366a82.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/86aad206dfcc15366a82.webp', NULL, 'image/webp',
  'roommate-disputes.webp',
  542932, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_tenant-harassment_bb0ce605', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/d1ada2d3584a7c316472.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/d1ada2d3584a7c316472.webp', NULL, 'image/webp',
  'tenant-harassment.webp',
  369680, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_tenant-union-support_6737f467', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/1b1ebc752dfbd080bdc6.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/1b1ebc752dfbd080bdc6.webp', NULL, 'image/webp',
  'tenant-union-support.webp',
  300392, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_unlawful-rent-increases_161a5e3e', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/c8a92a5830efd7c828b5.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/c8a92a5830efd7c828b5.webp', NULL, 'image/webp',
  'unlawful-rent-increases.webp',
  599128, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_utility-shutof-protection_b8776ce2', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/aeafe02fc312af27037c.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/aeafe02fc312af27037c.webp', NULL, 'image/webp',
  'utility-shutof-protection.webp',
  417558, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_probate_543a76a1', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/0750c6fcc544e0966b1b.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/0750c6fcc544e0966b1b.webp', NULL, 'image/webp',
  'probate.webp',
  202224, 704, 478, NULL, 'offering_thumbnail',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_wills-01_8d44a182', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/28b8d371ac381ea5737c.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/28b8d371ac381ea5737c.webp', NULL, 'image/webp',
  'wills-01.webp',
  397346, 800, 800, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_wills-02_644cf3dc', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/0efe20ea344012bedb65.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/0efe20ea344012bedb65.webp', NULL, 'image/webp',
  'wills-02.webp',
  298254, 800, 800, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_wills-03_ad9cfde1', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/9e2049facfc8d8a30aa4.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/9e2049facfc8d8a30aa4.webp', NULL, 'image/webp',
  'wills-03.webp',
  277140, 800, 800, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_wills-04_d577945f', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/1f0c7612b4a1725e52d8.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/1f0c7612b4a1725e52d8.webp', NULL, 'image/webp',
  'wills-04.webp',
  459166, 800, 800, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_wills-05_fe86de2f', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/925d9801695e4dab74a7.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/925d9801695e4dab74a7.webp', NULL, 'image/webp',
  'wills-05.webp',
  389848, 800, 800, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_wills-06_87386628', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/8f49065376bdf8c1ef45.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/8f49065376bdf8c1ef45.webp', NULL, 'image/webp',
  'wills-06.webp',
  398972, 800, 800, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_asset-protection_457fecee', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/6a160901802dd8842fbd.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/6a160901802dd8842fbd.webp', NULL, 'image/webp',
  'asset-protection.webp',
  561242, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_elder-law_8c8269dd', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/b6bb1d39d48c68d6d235.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/b6bb1d39d48c68d6d235.webp', NULL, 'image/webp',
  'elder-law.webp',
  462596, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_estate-planning_b6002b45', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/71c23cd30e36e5077af8.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/71c23cd30e36e5077af8.webp', NULL, 'image/webp',
  'estate-planning.webp',
  505364, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_financial-power-of-attorney_e8f9fb78', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/3e0e853efa8497b9494d.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/3e0e853efa8497b9494d.webp', NULL, 'image/webp',
  'financial-power-of-attorney.webp',
  408912, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_guardianships_8c9f1769', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/e32e116257a9e4d891d6.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e32e116257a9e4d891d6.webp', NULL, 'image/webp',
  'guardianships.webp',
  654466, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_living-will_6eceb4b5', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/900fec46ad4cb009eaba.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/900fec46ad4cb009eaba.webp', NULL, 'image/webp',
  'living-will.webp',
  351770, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_medical-power-of-attorney_a8fe7a9b', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/6794e2d8fe3d6eb86697.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/6794e2d8fe3d6eb86697.webp', NULL, 'image/webp',
  'medical-power-of-attorney.webp',
  344614, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_probate-feature_03518918', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/e30ceb064f55ad60f0d1.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e30ceb064f55ad60f0d1.webp', NULL, 'image/webp',
  'probate-feature.webp',
  528108, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_trusts_f909eb5a', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/db28ef30fcee279856bc.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/db28ef30fcee279856bc.webp', NULL, 'image/webp',
  'trusts.webp',
  579906, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_wills_05897059', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/9c46389c33fe8b070c39.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/9c46389c33fe8b070c39.webp', NULL, 'image/webp',
  'wills.webp',
  414534, 683, 1024, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_special-education_f8a8f7bc', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/6bbf53416eb2e561a144.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/6bbf53416eb2e561a144.webp', NULL, 'image/webp',
  'special-education.webp',
  35082, 704, 478, NULL, 'offering_thumbnail',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_landscape-cta_d14744f8', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/e47c24ad39e5089d7d79.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e47c24ad39e5089d7d79.webp', NULL, 'image/webp',
  'landscape-cta.webp',
  79582, 1800, 900, NULL, 'article_inline_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_equitable-distribution-in-north-carolina-divorces_99c1fb55', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/6ff287c027b5e76db25b.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/6ff287c027b5e76db25b.webp', NULL, 'image/webp',
  'equitable_distribution_in_north_carolina_divorces.webp',
  94190, 800, 800, NULL, 'article_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_7-common-iep-violations-every-north-carolina-parent-should-recognize-and-how-to-fight-back-1_2d84c78e', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/5ea1b2ee81b8475abdd2.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/5ea1b2ee81b8475abdd2.webp', NULL, 'image/webp',
  '7-common-iep-violations-every-north-carolina-parent-should-recognize-and-how-to-fight-back-1.webp',
  47366, 1024, 1024, NULL, 'article_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_7-common-iep-violations-every-north-carolina-parent-should-recognize-and-how-to-fight-back-3_7e6614a8', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/4400f49221ae732604ed.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/4400f49221ae732604ed.webp', NULL, 'image/webp',
  '7-common-iep-violations-every-north-carolina-parent-should-recognize-and-how-to-fight-back-3.webp',
  51254, 1024, 1024, NULL, 'article_inline_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_7-common-iep-violations-every-north-carolina-parent-should-recognize-and-how-to-fight-back-4_3465b5fc', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/bf31809ddf6bbbcaf8dd.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/bf31809ddf6bbbcaf8dd.webp', NULL, 'image/webp',
  '7-common-iep-violations-every-north-carolina-parent-should-recognize-and-how-to-fight-back-4.webp',
  53726, 1024, 1024, NULL, 'article_inline_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_7-common-iep-violations-every-north-carolina-parent-should-recognize-and-how-to-fight-back-2_fd48b1be', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/f26a1f0b2536d75b50be.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/f26a1f0b2536d75b50be.webp', NULL, 'image/webp',
  '7-common-iep-violations-every-north-carolina-parent-should-recognize-and-how-to-fight-back-2.webp',
  50594, 1024, 1024, NULL, 'article_inline_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_7-common-iep-violations-every-north-carolina-parent-should-recognize-and-how-to-fight-back-5_fba43c2b', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/e8224978251e8c48e0d7.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e8224978251e8c48e0d7.webp', NULL, 'image/webp',
  '7-common-iep-violations-every-north-carolina-parent-should-recognize-and-how-to-fight-back-5.webp',
  35698, 1024, 1024, NULL, 'article_inline_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_disaster-relief-for-north-carolina-homeowners-after-hurricane-helene_4bb0a9fb', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/5fc0384f3eb1ab1f4291.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/5fc0384f3eb1ab1f4291.webp', NULL, 'image/webp',
  'disaster-relief-for-north-carolina-homeowners-after-hurricane-helene.webp',
  415940, 1024, 1024, NULL, 'article_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_divorce-and-children-in-north-carolina-what-to-expect-and-how-to-prepare_4d8437cf', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/4992b36617a33c60003b.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/4992b36617a33c60003b.webp', NULL, 'image/webp',
  'divorce_and_children_in_north_carolina_what_to_expect_and_how_to_prepare.webp',
  213336, 1024, 1024, NULL, 'article_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_employee-disability-rights-in-north-carolina_a7671b0b', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/94afcb31801ed13f7ab2.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/94afcb31801ed13f7ab2.webp', NULL, 'image/webp',
  'employee-disability-rights-in-north-carolina.webp',
  311830, 2816, 1536, NULL, 'article_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_fairness-is-not-a-zero-sum-game-why-dei-benefits-everyone-crop_a2271426', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/27078d61a0c52dc37859.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/27078d61a0c52dc37859.webp', NULL, 'image/webp',
  'fairness-is-not-a-zero-sum-game-why-dei-benefits-everyone-crop.webp',
  100596, 1920, 1079, NULL, 'article_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_hurricane-disaster-relief-for-north-carolina-renters_3cf40846', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',