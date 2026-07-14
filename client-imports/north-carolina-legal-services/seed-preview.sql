-- NCLS Blawby local seed
-- Generated from client-imports/north-carolina-legal-services/client-manifest.json
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
  'ncls', 'ncls', 'https://ncls.krabiclaw.com',
  'North Carolina Legal Services', 'Access to Justice for All. North Carolina''s affordable legal services. We believe that access to the Justice System is a fundamental right. At North Carolina Legal Services we are committed to removing financial barriers that prevent many in our community from obtaining high-quality legal assistance.',
  'contact@northcarolinalegalservices.org', '(984) 777-8288',
  'en', 'USD', 'active', 'managed', 'active',
  'brand_pages', 'service', 'client_supplied', 'client_photos',
  '{"favicon_url":"/tenants/northcarolinalegalservices/favicon.svg"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO site_domains (id, organization_id, site_id, domain, type, role, status, dns_status, activated_at, created_at, updated_at)
VALUES
  ('domain-ncls-localhost', 'org-ncls-blawby', 'site-ncls-blawby', 'ncls.localhost', 'subdomain', 'secondary', 'active', 'valid', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('domain-ncls-prod-subdomain', 'org-ncls-blawby', 'site-ncls-blawby', 'ncls.krabiclaw.com', 'subdomain', 'canonical', 'active', 'valid', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

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
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/b32c23116ba051b4df0a.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/b32c23116ba051b4df0a.webp', NULL, 'image/webp',
  'hurricane-disaster-relief-for-north-carolina-renters.webp',
  146166, 1024, 1024, NULL, 'article_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_iep1a_e918957a', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/fd35215909818cd16454.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/fd35215909818cd16454.webp', NULL, 'image/webp',
  'IEP1a.webp',
  113430, 1536, 1024, NULL, 'article_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_ice-north-carolina-legal-services_5c6db278', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/3e5119ec9e79e06cca81.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/3e5119ec9e79e06cca81.webp', NULL, 'image/webp',
  'ice-north-carolina-legal-services.webp',
  72436, 1024, 1024, NULL, 'article_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_pet-custody-in-nc-divorce-how-equitable-distribution-affects-your-dog-or-cat-6_0d933ffe', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/cd4cd22ac1dbb2a3d954.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/cd4cd22ac1dbb2a3d954.webp', NULL, 'image/webp',
  'pet-custody-in-nc-divorce-how-equitable-distribution-affects-your-dog-or-cat-6.webp',
  25942, 1024, 1024, NULL, 'article_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_pet-custody-in-nc-divorce-how-equitable-distribution-affects-your-dog-or-cat-7_6b1ac2cb', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/4661569ca43b62b79e63.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/4661569ca43b62b79e63.webp', NULL, 'image/webp',
  'pet-custody-in-nc-divorce-how-equitable-distribution-affects-your-dog-or-cat-7.webp',
  47510, 1024, 1024, NULL, 'article_inline_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_pet-custody-in-nc-divorce-how-equitable-distribution-affects-your-dog-or-cat-8_cb97a22d', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/95815cecb8c4bbc346fc.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/95815cecb8c4bbc346fc.webp', NULL, 'image/webp',
  'pet-custody-in-nc-divorce-how-equitable-distribution-affects-your-dog-or-cat-8.webp',
  36846, 1024, 1024, NULL, 'article_inline_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_pet-custody-in-nc-divorce-how-equitable-distribution-affects-your-dog-or-cat-9_c9780cad', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/9e68787a4d6880c03406.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/9e68787a4d6880c03406.webp', NULL, 'image/webp',
  'pet-custody-in-nc-divorce-how-equitable-distribution-affects-your-dog-or-cat-9.webp',
  32154, 1024, 1024, NULL, 'article_inline_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_pet-custody-in-nc-divorce-how-equitable-distribution-affects-your-dog-or-cat-10_7e1018f3', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/ffca5f1905bf4cb3f07e.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/ffca5f1905bf4cb3f07e.webp', NULL, 'image/webp',
  'pet-custody-in-nc-divorce-how-equitable-distribution-affects-your-dog-or-cat-10.webp',
  35630, 1024, 1024, NULL, 'article_inline_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_preparing-for-your-consultation_e377f00a', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/67c5ea411d21e62c5469.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/67c5ea411d21e62c5469.webp', NULL, 'image/webp',
  'preparing-for-your-consultation.webp',
  86860, 1536, 1024, NULL, 'article_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_property-division-in-north-carolina-divorce_b0a257d6', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/f9dc933b49a2e7f07a69.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/f9dc933b49a2e7f07a69.webp', NULL, 'image/webp',
  'property-division-in-north-carolina-divorce.webp',
  320066, 1024, 1024, NULL, 'article_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_north-carolina-legal-services-freelancer-contract-law_2bd6b781', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/a39b500c45f7b4444f1e.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/a39b500c45f7b4444f1e.webp', NULL, 'image/webp',
  'north-carolina-legal-services-freelancer-contract-law.webp',
  100134, 1792, 1024, NULL, 'article_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_the-legal-needs-of-small-businesses-in-north-carolina_d4d447c9', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/6aed39519b0ac80219bf.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/6aed39519b0ac80219bf.webp', NULL, 'image/webp',
  'the-legal-needs-of-small-businesses-in-north-carolina.webp',
  468398, 800, 800, NULL, 'article_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_representing-yourself-in-court-north-carolina_d67a2b49', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/9155f1de225046ecac6e.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/9155f1de225046ecac6e.webp', NULL, 'image/webp',
  'representing-yourself-in-court-north-carolina.webp',
  75680, 1024, 559, NULL, 'article_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_iep-north-carolina-legal-services-2_73252e09', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/dd527873ff91dc3142c3.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/dd527873ff91dc3142c3.webp', NULL, 'image/webp',
  'iep-north-carolina-legal-services-2.webp',
  51734, 1150, 762, NULL, 'article_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_media_illegal-eviction-in-north-carolina_a197771d', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/0de81973286ca2607247.webp', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/0de81973286ca2607247.webp', NULL, 'image/webp',
  'Illegal-Eviction-in-North-Carolina.webp',
  66064, 1024, 572, NULL, 'article_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_legal_northcarolinalegalservices-dba-redacted', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'file',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/9f06152ccd5d6f29c11a.pdf', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/9f06152ccd5d6f29c11a.pdf', NULL, 'application/pdf',
  'NorthCarolinaLegalServices_DBA__Redacted.pdf',
  66430, NULL, NULL, NULL, 'dba_registration',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_legal_finalletter-88-0565637-bullcitylegalservicesinc-redacted', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'file',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/imports/8de1e5793e0806ece163.pdf', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/8de1e5793e0806ece163.pdf', NULL, 'application/pdf',
  'FinalLetter_88-0565637_BULLCITYLEGALSERVICESINC_Redacted.pdf',
  179966, NULL, NULL, NULL, 'legal_document',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
);

UPDATE sites SET logo_asset_id = 'asset_ncls_media_logo_3784bf7c' WHERE id = 'site-ncls-blawby';

INSERT INTO offerings (
  id, organization_id, site_id, location_id, name, slug, label, summary,
  short_description, body, features, faqs, cta_label, cta_url,
  thumbnail_asset_id, hero_image_asset_id, media_asset_ids, schema_type,
  seo_title, seo_description, canonical_path, status, sort_order, featured,
  source, source_ref, created_at, updated_at
) VALUES
(
  'offering_ncls_family', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'Family law', 'family', 'Family law',
  'Empower your family to move forward confidently', 'At NCLS, we offer empathetic and result-oriented representation for our clients'' family law concerns. We strive to help our clients move on with their lives feeling confident.', 'At NCLS, we offer empathetic and result-oriented representation for our clients'' family law concerns. Our mission is to guide clients through some of the most challenging times in their lives with compassion and expertise. We understand that family law matters are deeply personal and require a tailored approach to meet the unique needs of each individual. Our team is dedicated to providing comprehensive legal support, ensuring that you receive the guidance and representation necessary to move forward confidently. Whether you are facing a divorce, child custody dispute, or need assistance with alimony, our goal is to help you achieve the best possible outcome while minimizing stress and conflict.

We offer a wide range of family law services, including assistance with child support, custodial power of attorney, and third-party custody claims. Our experienced attorneys are skilled in drafting prenuptial and separation agreements, navigating equitable distribution of assets, and enforcing court orders related to family law matters. We also provide support for those seeking domestic violence protective orders and offer mediation services to resolve disputes amicably. At NCLS, we are committed to protecting your rights and interests, ensuring that you receive fair treatment and justice in all family law matters. Let us be your trusted advocate as you navigate these important and often complex legal challenges.',
  '[{"title":"Alimony","description":"NCLS can help you with spousal support claims in North Carolina, both temporary and permanent. We also assist with temporary alimony claims during divorce proceedings.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/7277c674a1f8c5581f10.webp","image_asset_id":"asset_ncls_media_alimony_413fb782","icon":"CurrencyDollarIcon","icon_url":null,"sort_order":0},{"title":"Child Custody and Visitation","description":"We provide assistance with filing for custody, creating custody and visitation plans, modifying custody orders, or filing a third-party custody claim. Our goal is to help our clients resolve custody issues in a way that benefits their children and reduces conflicts.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/ab63ba56d1d12826f532.webp","image_asset_id":"asset_ncls_media_childcustody_f6ce55e7","icon":"UserGroupIcon","icon_url":null,"sort_order":1},{"title":"Child Support","description":"We help parents or guardians who need legal aid to establish accurate child support orders and ensure they are enforced or modified as needed.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/5421e9e4fd21b3c4826b.webp","image_asset_id":"asset_ncls_media_childsupport_e5e12c06","icon":"CurrencyDollarIcon","icon_url":null,"sort_order":2},{"title":"Custodial Power of Attorney","description":"We assist parents in planning for unexpected situations and making arrangements for the care of their children if they become unavailable.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/f24afb9578caa8eb2a2f.webp","image_asset_id":"asset_ncls_media_custodial-power-of-attorney_0ce0fb82","icon":"DocumentTextIcon","icon_url":null,"sort_order":3},{"title":"Divorce","description":"We provide legal representation for those considering divorce, those who have filed for divorce and need further assistance, and those who have been served with divorce papers from their spouse.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/926d9d9f906913b2d02a.webp","image_asset_id":"asset_ncls_media_divorce_11224e5f","icon":"ClipboardDocumentCheckIcon","icon_url":null,"sort_order":4},{"title":"Third-Party Custody","description":"We represent grandparents, relatives, and other third parties seeking custody of a child when it is in the child''s best interest.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/280c3536f333fe6f5560.webp","image_asset_id":"asset_ncls_media_custody-evaluations_03a610e8","icon":"ShieldCheckIcon","icon_url":null,"sort_order":5},{"title":"Prenuptial Agreements","description":"We advocate for those who have suffered due to neglect or abuse in nursing homes, ensuring justice and compensation for your loved ones.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/26c7750899fbb60c91f1.webp","image_asset_id":"asset_ncls_media_prenuptialagreement_35bd569a","icon":"DocumentTextIcon","icon_url":null,"sort_order":6},{"title":"Separation Agreements","description":"We assist clients in drafting and negotiating separation agreements that outline the terms of their separation, including property division, alimony, and child custody arrangements.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/4b066f9c7c954ee7c03a.webp","image_asset_id":"asset_ncls_media_separationagreement_8cb198cc","icon":"UserIcon","icon_url":null,"sort_order":7},{"title":"Equitable Distribution","description":"We help clients navigate the division of marital property, ensuring a fair and equitable distribution of assets and debts during divorce proceedings.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/9160b2644f7039a0a19b.webp","image_asset_id":"asset_ncls_media_equitabledistribution_e4b88aef","icon":"ScaleIcon","icon_url":null,"sort_order":8},{"title":"Domestic Violence Protective Orders (DVPO)","description":"Some of our partner organizations, like Legal Aid North Carolina, can provide assistance with obtaining a DVPO at no cost to you. However, if they are unable to take your case, we can help you obtain protection from domestic violence. We may also be able to connect you with other services in your area for holistic support.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/291220f9e47a492ff25a.webp","image_asset_id":"asset_ncls_media_domesticviolenceprotectiveorder_5a5178d7","icon":"ShieldExclamationIcon","icon_url":null,"sort_order":9},{"title":"Visitation","description":"We work with parents to create visitation schedules that promote the best interests of their children and ensure meaningful time with both parents.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/1c3d21a61dd22b9e16c0.webp","image_asset_id":"asset_ncls_media_visitation_eb72e984","icon":"UserGroupIcon","icon_url":null,"sort_order":10},{"title":"Child Support Modifications","description":"We help clients modify existing child support orders due to changes in circumstances such as income, employment, or the needs of the child.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/5421e9e4fd21b3c4826b.webp","image_asset_id":"asset_ncls_media_childsupport_e5e12c06","icon":"AdjustmentsHorizontalIcon","icon_url":null,"sort_order":11},{"title":"Custody Evaluations","description":"We provide support and representation during custody evaluations to ensure that the best interests of the children are considered in custody decisions.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/280c3536f333fe6f5560.webp","image_asset_id":"asset_ncls_media_custody-evaluations_03a610e8","icon":"ClipboardDocumentListIcon","icon_url":null,"sort_order":12},{"title":"Enforcement of Court Orders","description":"We assist clients in enforcing court orders related to child support, alimony, custody, and visitation to ensure compliance and address any violations.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/3d82790384b45abcb2ba.webp","image_asset_id":"asset_ncls_media_enforcementofcourtorders_ad5133df","icon":"CheckIcon","icon_url":null,"sort_order":13},{"title":"Mediation Services","description":"We offer mediation services to help clients resolve family law disputes amicably and efficiently, often leading to mutually agreeable solutions without the need for litigation.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/6fa2f3b50a4653dd697c.webp","image_asset_id":"asset_ncls_media_mediationservices_34297268","icon":"ChatBubbleBottomCenterTextIcon","icon_url":null,"sort_order":14}]', '[{"question":"How do I file for divorce in North Carolina?","answer":"To file for divorce in North Carolina, you usually need to show that you and your spouse lived separate and apart for one year with the intent to end the marriage. The complaint is filed in the county where either spouse lives, and related claims like custody or property division can be filed at the same time. If property division or support claims are not filed before the divorce is granted, you could lose the right to bring them later. An attorney can help you protect your rights and file correctly."},{"question":"Do I have to be separated for one year before I can get divorced in NC?","answer":"Couples in North Carolina are generally expected to live separate and apart for one continuous year before a divorce will be granted. Courts usually expect different residences, but where maintaining two households isn''t possible, judges may look at factors like ending marital relations or separating finances. Because judges weigh these facts case by case, it helps to get advice about your situation."},{"question":"What''s the difference between legal separation and divorce in North Carolina?","answer":"A legal separation means spouses live apart with the intent to end the marriage but remain legally married. Divorce permanently ends the marriage and allows remarriage, and both processes can involve court orders about custody, support, or property. An attorney can explain which option best fits your circumstances."},{"question":"How is child custody decided in NC?","answer":"Custody decisions are based on the child''s best interests, with judges looking at caregiving history, living arrangements, and stability in each home. Parents can agree on a schedule or ask the court to decide. Legal advice can clarify what factors are most important in your case."},{"question":"How is child support calculated in North Carolina?","answer":"Child support is usually set under state guidelines that consider both parents'' incomes, custody schedules, and expenses such as childcare or health insurance. Courts may deviate if special circumstances make the guideline amount unfair. An attorney can help you estimate likely support amounts for your situation."},{"question":"How is alimony determined in North Carolina?","answer":"Alimony, or spousal support, depends on one spouse''s financial need and the other''s ability to pay. Judges weigh factors like the length of the marriage, income differences, health, and contributions to the household. Legal guidance can help you understand how these factors may apply."},{"question":"What does \"no-fault divorce\" mean in NC?","answer":"North Carolina allows no-fault divorce, which means neither spouse has to prove misconduct to end the marriage. The main requirement is one year of separation with the intent to end the marriage. If you''re unsure whether your situation qualifies, an attorney can explain how the rule applies to your case."},{"question":"Can I represent myself in family court?","answer":"You are allowed to represent yourself, but family law cases involve complex rules and high-stakes issues. Many people choose a lawyer for help with forms, hearings, or negotiations, and limited-scope representation is also an option. Talking with an attorney can help you decide what level of support you need."},{"question":"How much does a divorce usually cost in North Carolina?","answer":"The cost of divorce varies depending on whether it is contested and what issues must be resolved. Court filing fees apply, and at NCLS we use sliding-scale fees and payment plans to make representation affordable. We can provide a clearer estimate after reviewing your situation."},{"question":"Can I change or modify a child support order in NC?","answer":"In North Carolina, child support orders may be modified if there has been a substantial change in circumstances, such as changes in income, childcare costs, or the child''s needs. Any change must be approved by the court through a formal motion. An attorney can help you determine whether your situation qualifies for a modification."}]',
  'Schedule a consultation', '/schedule',
  'asset_ncls_media_family-law_68c10f73', 'asset_ncls_media_divorce-in-nc-01_66963367', '["asset_ncls_media_divorce-in-nc-01_66963367","asset_ncls_media_divorce-in-nc-02_2db5e510","asset_ncls_media_divorce-in-nc-03_0f442303","asset_ncls_media_divorce-in-nc-04_33e61dd7","asset_ncls_media_divorce-in-nc-05_23e394f3","asset_ncls_media_divorce-in-nc-06_95d29d9e","asset_ncls_media_divorce-in-nc-07_665085df"]', 'LegalService',
  'Family law | North Carolina Legal Services', 'At NCLS, we offer empathetic and result-oriented representation for our clients'' family law concerns. We strive to help our clients move on with their lives feeling confident.', '/services/family',
  'published', 1, 1,
  'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'offering_ncls_small-business-and-nonprofits', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'Small Business and Nonprofits', 'small-business-and-nonprofits', 'Small Business and Nonprofits',
  'Legal support for small businesses and nonprofits to succeed', 'We believe that small businesses and nonprofits give our community its distinct and special character. We are committed to helping entrepreneurs, small business owners, and nonprofit leaders with the legal support they need to succeed in a competitive and challenging environment.', 'We believe that small businesses and nonprofits give our community its distinct and special character. At NCLS, we are dedicated to providing entrepreneurs, small business owners, and nonprofit leaders with the legal support they need to thrive in a competitive and challenging environment. Our team understands the unique challenges you face and is committed to offering personalized guidance and comprehensive legal services tailored to your specific needs.

Whether you need assistance with arbitration and mediation to avoid costly trials, business entity formation to ensure the right structure and compliance, or navigating the complexities of employment law, NCLS is here to help. Our expertise also extends to commercial litigation, nonprofit formation and governance, contract negotiations, and risk management. Our goal is to resolve disputes efficiently and effectively, allowing you to focus on growing your business or nonprofit. Let us be your trusted legal partner, dedicated to your success and the vitality of our community.',
  '[{"title":"Arbitration/Mediation","description":"Avoid lengthy and expensive trials with our arbitration and mediation services. NCLS represents businesses in arbitration/mediation proceedings, enforces arbitration agreements, and appoints arbitrators and mediators to resolve disputes.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/cb5056b64d904d8735b9.webp","image_asset_id":"asset_ncls_media_arbitration-mediation_82f7f64f","icon":"ScaleIcon","icon_url":null,"sort_order":0},{"title":"Business Entity Formation","description":"We guide local businesses through selecting the right business structure, drafting and filing formation documents, registering for tax and regulatory requirements, and preparing governance documents such as bylaws or operating agreements.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/a90292c48419da132615.webp","image_asset_id":"asset_ncls_media_businessentityformation_35a7d49e","icon":"BuildingOffice2Icon","icon_url":null,"sort_order":1},{"title":"Compliance","description":"Stay compliant with state and federal laws and regulations with our assistance. We handle annual reports, maintain corporate records, and provide guidance on regulatory changes to ensure ongoing compliance.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/05b49768af802ba8e3d8.webp","image_asset_id":"asset_ncls_media_compliance_9c4fb71d","icon":"ClipboardIcon","icon_url":null,"sort_order":2},{"title":"Commercial Litigation","description":"We represent businesses in commercial litigation matters, including breach of contract, partnership disputes, and other business-related conflicts. Our goal is to resolve disputes efficiently and effectively.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/1d9c91908846078577de.webp","image_asset_id":"asset_ncls_media_commercial-litigation_5c17e27c","icon":"ChatBubbleBottomCenterTextIcon","icon_url":null,"sort_order":3},{"title":"Contracts","description":"We offer comprehensive services for business contracts, including drafting, reviewing, and negotiating. Our guidance covers essential terms and provisions like payment and delivery terms, warranties, liability limitations, and dispute resolution mechanisms.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/f67f4a2fe91abf1e5717.webp","image_asset_id":"asset_ncls_media_contracts_65920664","icon":"DocumentTextIcon","icon_url":null,"sort_order":4},{"title":"Employment Law","description":"Get expert guidance on employment law matters, including drafting employee handbooks, advising on hiring and termination practices, and ensuring compliance with employment regulations. We also represent businesses in employment disputes and litigation.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/16573c795d153831b37f.webp","image_asset_id":"asset_ncls_media_employment-law_6fe055d1","icon":"BriefcaseIcon","icon_url":null,"sort_order":5},{"title":"Nonprofit Formation and Governance","description":"We support nonprofits with formation, including drafting and filing articles of incorporation, obtaining tax-exempt status, and creating bylaws. We also offer ongoing governance support to ensure compliance with nonprofit regulations.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/6b9a6aea1fd95c7662ce.webp","image_asset_id":"asset_ncls_media_nonprofit-formation-and-governance_9484c0d5","icon":"UserGroupIcon","icon_url":null,"sort_order":6},{"title":"Partnership Agreements","description":"We advise on the terms of partnership agreements, covering ownership, management structure, profit and loss sharing, decision-making processes, dispute resolution mechanisms, and dissolution provisions. We assist in drafting, reviewing, and negotiating these agreements.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/c5b2bf714e3c54b85675.webp","image_asset_id":"asset_ncls_media_partnership-agreements_9ef83ec8","icon":"BriefcaseIcon","icon_url":null,"sort_order":7},{"title":"Real Estate Transactions","description":"Ensure smooth real estate transactions with our assistance. We draft and review lease agreements, purchase contracts, and sale agreements, ensuring compliance with all legal requirements.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/369636058474b338d070.webp","image_asset_id":"asset_ncls_media_real-estate-transactions_1d2f2781","icon":"BuildingOfficeIcon","icon_url":null,"sort_order":8},{"title":"Risk Management","description":"Identify and mitigate potential legal risks with our help. We review business practices, draft risk management policies, and provide compliance training and best practices.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/6a7296935dad30625906.webp","image_asset_id":"asset_ncls_media_risk-management_d0c2987e","icon":"ShieldCheckIcon","icon_url":null,"sort_order":9},{"title":"Shareholder Agreements","description":"We draft and review shareholder agreements, outlining the rights and responsibilities of shareholders, including provisions for the transfer of shares, voting rights, and dispute resolution mechanisms.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/002d88bab34cb3310870.webp","image_asset_id":"asset_ncls_media_shareholder-agreements_25444a77","icon":"DocumentCheckIcon","icon_url":null,"sort_order":10},{"title":"Child Support Modifications","description":"We help clients modify existing child support orders due to changes in circumstances such as income, employment, or the needs of the child.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/314e050d62e204adaa64.webp","image_asset_id":"asset_ncls_media_child-support-modification_01c27cdc","icon":"CurrencyDollarIcon","icon_url":null,"sort_order":11},{"title":"Taxation","description":"Navigate complex tax laws and regulations with our tax planning and compliance services. We handle tax return preparation, tax dispute resolution, and strategic tax planning to optimize your business''s tax position.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/48f60b831a9cb80561bf.webp","image_asset_id":"asset_ncls_media_taxation_3a5d259d","icon":"CurrencyDollarIcon","icon_url":null,"sort_order":12},{"title":"Enforcement of Court Orders","description":"We assist clients in enforcing court orders related to child support, alimony, custody, and visitation to ensure compliance and address any violations.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/3d82790384b45abcb2ba.webp","image_asset_id":"asset_ncls_media_enforcementofcourtorders_ad5133df","icon":"ChatBubbleBottomCenterTextIcon","icon_url":null,"sort_order":13}]', '[{"question":"Do I need a lawyer to start a small business in NC?","answer":"You can start a business by filing with the NC Secretary of State and meeting tax and licensing requirements, but many owners miss important steps such as drafting an operating agreement or protecting their brand. A lawyer can help you set up correctly and avoid problems later."},{"question":"What''s the difference between an LLC and a corporation in North Carolina?","answer":"Both structures limit liability, but LLCs are generally simpler to manage while corporations follow more formal rules. The right choice depends on ownership, growth plans, and tax treatment. An attorney can explain which option best fits your goals."},{"question":"What legal documents do nonprofits need to operate in NC?","answer":"Most nonprofits need Articles of Incorporation, Bylaws, and IRS tax-exempt recognition. Policies such as a conflict-of-interest policy and proper board governance documents are also strongly recommended. A lawyer can make sure your nonprofit meets state and federal requirements from the start."},{"question":"How do I protect my business name and brand legally?","answer":"In North Carolina, registering your business name does not protect it as a trademark. Trademark registration at the state or federal level is usually needed to prevent others from using it. Legal advice can help you choose the right protection for your brand."},{"question":"What contracts should every small business in NC have?","answer":"Businesses commonly need contracts for clients, vendors, and employees that clearly set out rights and obligations. Poorly drafted agreements can lead to disputes or unexpected liability. A lawyer can draft or review contracts to safeguard your business."},{"question":"How do I register a nonprofit in North Carolina?","answer":"Nonprofits must file Articles of Incorporation with the NC Secretary of State and apply for IRS recognition of tax-exempt status. Additional registrations may be required if you plan to solicit donations. An attorney can guide you through each step so you don''t miss deadlines."},{"question":"What are common legal risks for small business owners?","answer":"Risks include misclassifying workers, failing to follow employment laws, and operating without written agreements. Tax problems and partnership disputes are also frequent issues. A lawyer can help you identify risks early and reduce your exposure."},{"question":"Can business disputes be resolved without going to court in NC?","answer":"Many disputes can be resolved through negotiation, mediation, or arbitration. These options are usually faster and less costly than litigation, but they still require strong agreements. Legal help can make sure your interests are protected in the process."},{"question":"Can a lawyer help me negotiate a commercial lease in NC?","answer":"Yes. Commercial leases are often the most important financial decision a new business owner can make, and a bad lease can create a lot of problems down the road. A lawyer can review or negotiate terms so you understand your obligations before signing."},{"question":"How much does legal help for a nonprofit or small business cost?","answer":"At NCLS, qualifying small businesses (as defined by the SBA) and nonprofits receive a 50% discount off the market rate for legal services and representation. Businesses that do not qualify as small businesses pay the standard market rate. With affordable help available, you can address small issues before they grow into expensive problems. Even if you''re not sure you need an attorney now, a quick consultation can uncover blind spots and help you plan for your organization''s future."}]',
  'Schedule a consultation', '/schedule',
  'asset_ncls_media_small-business_1a0842cf', 'asset_ncls_media_small-business-01_f80a277a', '["asset_ncls_media_small-business-01_f80a277a","asset_ncls_media_small-business-02_e69641e9","asset_ncls_media_small-business-03_f254a190","asset_ncls_media_small-business-04_88f44ad4","asset_ncls_media_small-business-05_127bce1a","asset_ncls_media_small-business-06_a93aac42","asset_ncls_media_small-business-07_48518e0d","asset_ncls_media_small-business-08_b85caf6a","asset_ncls_media_small-business-09_af5ffb60"]', 'LegalService',
  'Small Business and Nonprofits | North Carolina Legal Services', 'We believe that small businesses and nonprofits give our community its distinct and special character. We are committed to helping entrepreneurs, small business owners, and nonprofit leaders with the legal support they need to succeed in a competitive and challenging environment.', '/services/small-business-and-nonprofits',
  'published', 2, 1,
  'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'offering_ncls_employment', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'Employment Law', 'employment', 'Employment Law',
  'Protect your rights in the workplace', 'At NCLS, we are dedicated to protecting the rights of employees and ensuring fair treatment in the workplace. If you''ve been wronged by your employer, we''re here to help you get the justice and compensation you deserve.', 'At NCLS, we are dedicated to protecting the rights of employees and ensuring fair treatment in the workplace. If you''ve been wronged by your employer, we''re here to help you get the justice and compensation you deserve. Our experienced team is committed to fighting for your rights and providing comprehensive legal support tailored to your unique situation.

Whether you are dealing with a breach of an employment contract, civil rights violations, or contract disputes, NCLS is prepared to stand by your side. We handle cases involving age, gender, and sexual orientation discrimination, as well as issues related to marital status, national origin, pregnancy, and religious beliefs. Whether your case relates to defamation, employee benefits, FMLA violations, harassment claims, military leave rights under USERRA, privacy rights, retaliation and whistleblower claims, union rights, wage and hour disputes, workers'' compensation claims, workplace safety, and wrongful termination. Our goal is to ensure you receive fair treatment and the justice you deserve.',
  '[{"title":"Breach of Employment Contract","description":"If your employer has breached the terms of your employment contract, we can help you seek enforcement or compensation for the damages caused.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/24cd363e18b7b2407d82.webp","image_asset_id":"asset_ncls_media_breach-of-employment-contract_89e48215","icon":"DocumentTextIcon","icon_url":null,"sort_order":0},{"title":"Civil Rights Violations","description":"We protect your civil rights in the workplace, including: Age Discrimination (Adverse actions based on age, particularly for employees 40 years or older.) Gender Discrimination (Unequal pay, denial of promotions, or other adverse actions based on gender.) Gender Identity Discrimination (Issues related to gender identity or expression, including bathroom access, dress codes, and more.) Marital Status Discrimination (Unfair treatment based on marital status.) National Origin Discrimination (Biased treatment or harassment based on ethnicity or accent.) Pregnancy Discrimination (Unfair treatment or denial of accommodations due to pregnancy, childbirth, or related conditions.) Religious Discrimination (Failure to accommodate religious beliefs or practices, or harassment based on religion.) Sexual Orientation Discrimination (Unfair treatment or harassment based on sexual orientation, including protections for LGBTQ+ employees.)","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/fe44f58092bac0c66e11.webp","image_asset_id":"asset_ncls_media_civil-rights-violations_c7c3e34d","icon":"ExclamationCircleIcon","icon_url":null,"sort_order":1},{"title":"Contract & Agreement Disputes","description":"Employment agreements can be complex. We handle disputes involving non-compete clauses, severance agreements, employment contracts, and other contractual issues, ensuring your interests are safeguarded.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/fa2d7d35a68c6adc59ff.webp","image_asset_id":"asset_ncls_media_contract-and-agreement-disputes_0997d408","icon":"DocumentCheckIcon","icon_url":null,"sort_order":2},{"title":"Defamation and Damage to Reputation","description":"If your reputation has been unfairly damaged by your employer or colleagues, we can help you seek redress and protect your good name.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/5793f2d5c13b7bb09b3b.webp","image_asset_id":"asset_ncls_media_defamation_a13559ce","icon":"ShieldExclamationIcon","icon_url":null,"sort_order":3},{"title":"Employee Benefits & Rights","description":"From health insurance disputes to issues with vacation pay, we are committed to protecting your rights and ensuring you receive the benefits you are entitled to under the law.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/7686a349466bf4f52c7a.webp","image_asset_id":"asset_ncls_media_employee-benefits-and-rights_6794ac34","icon":"ClipboardDocumentCheckIcon","icon_url":null,"sort_order":4},{"title":"Family and Medical Leave Act (FMLA) Violations","description":"If your employer has denied you the leave you are entitled to under the FMLA, we can help. We handle cases involving wrongful denial of leave and retaliation for taking leave.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/ecced05026b225fd4588.webp","image_asset_id":"asset_ncls_media_fmla-violations_05230833","icon":"CalendarIcon","icon_url":null,"sort_order":5},{"title":"Harassment Claims","description":"Everyone deserves a safe and respectful work environment. Whether you are experiencing bullying, sexual harassment, or any other form of workplace harassment, we take your claims seriously and work diligently to provide protection and justice.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/4178d0f78353324bca01.webp","image_asset_id":"asset_ncls_media_harassment_052d0f3f","icon":"ExclamationCircleIcon","icon_url":null,"sort_order":6},{"title":"Military Leave and USERRA Rights","description":"As a service member, you are entitled to protections under the Uniformed Services Employment and Reemployment Rights Act (USERRA). We assist with issues related to military leave, reemployment rights, and protection against discrimination.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/329f85b1d6d4783e39d3.webp","image_asset_id":"asset_ncls_media_military-leave_1376402f","icon":"ShieldCheckIcon","icon_url":null,"sort_order":7},{"title":"Privacy Rights in the Workplace","description":"We protect employees'' privacy rights, including issues related to monitoring, searches, and the use of personal information by employers.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/7c267c3e1149a24334cf.webp","image_asset_id":"asset_ncls_media_privacy-rights-at-the-workplace_97245c8c","icon":"LockClosedIcon","icon_url":null,"sort_order":8},{"title":"Retaliation & Whistleblower Claims","description":"Standing up against wrongdoing should be encouraged, not punished. We defend those who have faced retaliation for acting ethically and legally, ensuring their rights are protected.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/06bfcb286a3f89e89c96.webp","image_asset_id":"asset_ncls_media_retaliation-and-whistleblower-claims_dbb7d5cc","icon":"ExclamationTriangleIcon","icon_url":null,"sort_order":9},{"title":"Union Rights and Collective Bargaining","description":"We represent employees in matters related to union rights, collective bargaining agreements, and disputes with employers over union-related issues.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/bfdfebefd796ae2a75eb.webp","image_asset_id":"asset_ncls_media_union-rights-and-collective-bargining_69db1425","icon":"UserGroupIcon","icon_url":null,"sort_order":10},{"title":"Wage & Hour Disputes","description":"Ensuring you receive the compensation you deserve is our priority. We handle cases involving unpaid overtime, wage theft, misclassification of employees, and other wage-related issues to ensure fair treatment and compensation.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/f3e6ab83f162735a3b1b.webp","image_asset_id":"asset_ncls_media_wage-and-hour-disputes_f11d4b2e","icon":"CurrencyDollarIcon","icon_url":null,"sort_order":11},{"title":"Workers Compensation Claims","description":"If you have been injured on the job, we can assist you in filing for workers compensation benefits and appealing denied claims, ensuring you receive the support and compensation you deserve.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/7683cbe17b8cddff82f5.webp","image_asset_id":"asset_ncls_media_workers-compensation-claims_c67a9ffb","icon":"BriefcaseIcon","icon_url":null,"sort_order":12},{"title":"Workplace Safety and OSHA Violations","description":"Your safety at work is paramount. We represent employees who have been exposed to unsafe working conditions or have faced retaliation for reporting Occupational Safety and Health Administration (OSHA) violations.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/eb733bb7d42ae15d8fb3.webp","image_asset_id":"asset_ncls_media_workplace-safety-and-osha-violations_48086dc9","icon":"ShieldExclamationIcon","icon_url":null,"sort_order":13},{"title":"Wrongful Termination","description":"If you have been terminated under questionable circumstances, we are here to help. We thoroughly evaluate every aspect of your termination to determine if your rights have been violated and to seek justice on your behalf.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/97fd1db61a66b7203b5b.webp","image_asset_id":"asset_ncls_media_wrongful-termination_7256eb38","icon":"XCircleIcon","icon_url":null,"sort_order":14}]', '[{"question":"What counts as wrongful termination in North Carolina?","answer":"In North Carolina most workers can be fired at any time. However, a firing may be wrongful if it violates anti-discrimination laws, retaliates against protected activity, or breaches a contract. An attorney can help you evaluate whether your termination qualifies."},{"question":"Can I be fired without notice in NC?","answer":"In most cases, North Carolina law does not require employers to give notice before firing an employee. Exceptions exist if you have an employment contract that requires notice, or if the termination violates another law such as anti-discrimination or anti-retaliation protections. An attorney can review your circumstances and explain whether those protections apply."},{"question":"What protections do I have against discrimination at work in NC?","answer":"Employees are protected by federal and state laws against discrimination based on race, sex, age, disability, religion, and other categories. These laws also prohibit retaliation for reporting discrimination. If you''ve experienced workplace discrimination, legal advice can help you decide on next steps."},{"question":"How do I file a workplace discrimination complaint in NC?","answer":"Complaints can be filed with the Equal Employment Opportunity Commission (EEOC) or the NC Human Relations Commission. Deadlines are short—often 180 days—so it''s important to act quickly. An attorney can help you prepare and file a strong complaint."},{"question":"What is considered a hostile work environment in North Carolina?","answer":"A hostile environment occurs when harassment or discrimination is severe or pervasive enough to interfere with an employee''s work. This can include repeated offensive comments, threats, or intimidation. Legal guidance can help you determine whether your situation meets the legal standard."},{"question":"How do I request a workplace accommodation under the ADA in NC?","answer":"You can request an accommodation by notifying your employer of your disability and the changes you need to perform your job. Employers must engage in an interactive process to find a reasonable solution. A lawyer can advise you if your request is denied or ignored."},{"question":"What deadlines apply for filing an EEOC charge in NC?","answer":"Most discrimination claims must be filed within 180 days of the incident, though some extend to 300 days if state law also applies. Missing the deadline can bar your claim entirely. An attorney can ensure your filing is timely and complete."},{"question":"What wage and hour laws apply to NC employees?","answer":"North Carolina follows the federal Fair Labor Standards Act (FLSA), which sets rules for minimum wage, overtime, and recordkeeping. Misclassification of employees as exempt or as contractors is a common issue. Legal advice can clarify whether you are being paid correctly."},{"question":"Can my employer retaliate if I report harassment or discrimination?","answer":"Retaliation is illegal under both state and federal law. If your hours are cut, you''re reassigned unfairly, or you''re fired after reporting misconduct, you may have a claim. A lawyer can help you prove retaliation and protect your rights."},{"question":"How can a lawyer help me review a severance agreement in NC?","answer":"An attorney can explain what rights you are giving up, whether the payment is fair, and if the agreement complies with the law. They can also negotiate for better terms if appropriate. Getting a review before signing can prevent you from losing important rights."}]',
  'Schedule a consultation', '/schedule',
  'asset_ncls_media_employment_c82dedab', 'asset_ncls_media_employment_c82dedab', '[]', 'LegalService',
  'Employment Law | North Carolina Legal Services', 'At NCLS, we are dedicated to protecting the rights of employees and ensuring fair treatment in the workplace. If you''ve been wronged by your employer, we''re here to help you get the justice and compensation you deserve.', '/services/employment',
  'published', 3, 1,
  'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'offering_ncls_tenant-rights', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'Tenant Rights Law', 'tenant-rights', 'Tenant Rights Law',
  'Expert assistance to protect your home', 'Navigating legal issues with your landlord can be complicated and stressful. We provide expert legal assistance to ensure that your rights are protected when resolving disputes with your landlord.', 'Facing tenant-landlord disputes can be overwhelming. At NCLS, we are committed to protecting the rights of tenants and ensuring they are treated fairly by landlords. Our experienced legal team offers a wide range of services to address various tenant issues, from eviction defense and housing discrimination to illegal landlord practices and lease reviews. We understand the challenges tenants face and are here to provide the support and advocacy needed to navigate these complexities and ensure your rights are upheld.

Our comprehensive services include defending against eviction notices, addressing housing discrimination under the Fair Housing Act, and holding landlords accountable for illegal practices such as harassment and discrimination. We offer thorough lease reviews and provide guidance on lease terminations to avoid unnecessary complications. Our team advocates for tenants'' rights to maintenance and repair, ensuring habitable living conditions, and assists with disputes related to rent overcharges, security deposits, and unlawful rent increases. We also support tenants facing retaliatory eviction, roommate disputes, and harassment, offering mediation and legal action when necessary. Additionally, we provide utility shutoff protection and support for tenant unions, helping you organize and advocate for better living conditions and fair treatment. At NCLS, we are dedicated to standing by your side and ensuring your rights as a tenant are protected every step of the way.',
  '[{"title":"Eviction Defense","description":"Facing an eviction notice or proceedings can be overwhelming. We have the expertise to defend your rights and guide you through the legal options available in North Carolina.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/5efb0c8c3ae0955f76e0.webp","image_asset_id":"asset_ncls_media_eviction-defense_2411d4cf","icon":"ShieldExclamationIcon","icon_url":null,"sort_order":0},{"title":"Housing Discrimination","description":"If you''ve faced discrimination in housing based on race, color, national origin, religion, sex, familial status, or disability, we will fight to uphold your rights under the Fair Housing Act.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/b82e0074cc0e8a216b4c.webp","image_asset_id":"asset_ncls_media_housing-discrimination_72bd521f","icon":"ExclamationCircleIcon","icon_url":null,"sort_order":1},{"title":"Illegal Landlord Practices","description":"Discrimination, harassment, or any other unlawful behavior by a landlord is unacceptable. We hold landlords accountable for their actions and provide tenants with the necessary legal support.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/fa3fdb1d59d899af2565.webp","image_asset_id":"asset_ncls_media_illegal-landlord-practices_e32dc889","icon":"ExclamationTriangleIcon","icon_url":null,"sort_order":2},{"title":"Lease Review","description":"Before signing any residential or commercial lease agreement, our team can review it and provide valuable feedback to ensure your interests are protected.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/a54cf90957b32edf379d.webp","image_asset_id":"asset_ncls_media_lease-review_ac500ea1","icon":"DocumentTextIcon","icon_url":null,"sort_order":3},{"title":"Lease Termination","description":"Navigating the end of a lease can be complicated. We offer advice and support to help you handle lease terminations smoothly and avoid unnecessary complications or penalties.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/8ec41e5524cd4b1c56ad.webp","image_asset_id":"asset_ncls_media_lease-termination_1cdce616","icon":"ClipboardDocumentCheckIcon","icon_url":null,"sort_order":4},{"title":"Maintenance and Repair Advocacy","description":"Every tenant has the right to a habitable living environment. If your landlord is neglecting essential repairs or you are living in substandard conditions, we can help you assert your rights and ensure necessary actions are taken.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/10a9cfdeab21e0cd9aec.webp","image_asset_id":"asset_ncls_media_maintenance-and-repair-advocacy_3464d25a","icon":"WrenchIcon","icon_url":null,"sort_order":5},{"title":"Quiet Enjoyment Violations","description":"Every tenant is entitled to the quiet enjoyment of their rental property. If this right is being violated, we can help you seek legal remedies.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/7e5fee11c63ab43935a5.webp","image_asset_id":"asset_ncls_media_quiet-enjoyment-violations_bf54720e","icon":"UserGroupIcon","icon_url":null,"sort_order":6},{"title":"Rent Overcharge & Deposit Disputes","description":"If you believe you''ve been overcharged for rent or unfairly denied the return of your security deposit, we will work with you to challenge these actions and seek a favorable resolution.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/01222e125328547e3575.webp","image_asset_id":"asset_ncls_media_rent-overcharge-and-deposit-disputes_a0c4f3f9","icon":"CurrencyDollarIcon","icon_url":null,"sort_order":7},{"title":"Retaliatory Eviction ","description":"If you''re facing eviction as retaliation for exercising your tenant rights, we can defend you and make sure your rights are upheld.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/3666b857ce471928d1b5.webp","image_asset_id":"asset_ncls_media_retaliatory-eviction_5b689297","icon":"ShieldCheckIcon","icon_url":null,"sort_order":8},{"title":"Roommate Disputes","description":"Disagreements between roommates can become serious issues. We provide mediation and legal advice to help resolve conflicts and protect your rights in shared living situations.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/86aad206dfcc15366a82.webp","image_asset_id":"asset_ncls_media_roommate-disputes_95b7527c","icon":"ChatBubbleLeftRightIcon","icon_url":null,"sort_order":9},{"title":"Tenant Harassment","description":"No tenant should endure harassment from their landlord, whether it''s unwarranted entry, threats, or intimidation. We can help you take legal action to stop the harassment and safeguard your rights.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/d1ada2d3584a7c316472.webp","image_asset_id":"asset_ncls_media_tenant-harassment_bb0ce605","icon":"ExclamationTriangleIcon","icon_url":null,"sort_order":10},{"title":"Tenant Union Support","description":"We support tenant unions in their efforts to organize and advocate for better living conditions and fair treatment. Our legal expertise helps union members understand their rights and take effective collective action.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/1b1ebc752dfbd080bdc6.webp","image_asset_id":"asset_ncls_media_tenant-union-support_6737f467","icon":"UsersIcon","icon_url":null,"sort_order":11},{"title":"Unlawful Rent Increases","description":"If your landlord has raised your rent illegally or without proper notice, we can help you challenge the increase and ensure compliance with rent control regulations.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/c8a92a5830efd7c828b5.webp","image_asset_id":"asset_ncls_media_unlawful-rent-increases_161a5e3e","icon":"AdjustmentsHorizontalIcon","icon_url":null,"sort_order":12},{"title":"Utility Shutoff Protection","description":"If your landlord has unlawfully shut off your utilities, we can help you restore your services and hold your landlord accountable.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/aeafe02fc312af27037c.webp","image_asset_id":"asset_ncls_media_utility-shutof-protection_b8776ce2","icon":"PowerIcon","icon_url":null,"sort_order":13}]', '[]',
  'Schedule a consultation', '/schedule',
  'asset_ncls_media_tenant-rights_8a6e4137', 'asset_ncls_media_tenant-rights_8a6e4137', '[]', 'LegalService',
  'Tenant Rights Law | North Carolina Legal Services', 'Navigating legal issues with your landlord can be complicated and stressful. We provide expert legal assistance to ensure that your rights are protected when resolving disputes with your landlord.', '/services/tenant-rights',
  'published', 4, 0,
  'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'offering_ncls_probate-and-estate', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'Probate and Estate Planning', 'probate-and-estate', 'Probate and Estate Planning',
  'Estate planning and administration services', 'At NCLS, we are dedicated to helping you plan for the future and manage the affairs of your loved ones after they pass. We provide comprehensive legal services to ensure your wishes are respected and your family is taken care of.', 'At NCLS, we are dedicated to helping you plan for the future and manage the affairs of your loved ones after they pass. Our comprehensive legal services are designed to ensure your wishes are respected and your family is taken care of. We understand the importance of proper estate planning and are here to provide the guidance you need to protect your assets and ensure a smooth transition for your beneficiaries.

Our services include asset protection, elder law, and comprehensive estate planning. We assist in drafting essential documents, planning for tax implications, and ensuring your assets are distributed according to your wishes. Our expertise extends to financial and medical powers of attorney, guardianships, living wills, and trusts. We provide specialized support in probate matters, guiding you through the complex process of administering an estate. Whether you need to create a will, establish guardianships, or navigate the probate process, NCLS is here to offer the legal support and guidance necessary to secure your future and the well-being of your loved ones.',
  '[{"title":"Asset Protection","description":"We help you develop strategies to protect your assets from creditors and ensure your wealth is preserved for future generations.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/6a160901802dd8842fbd.webp","image_asset_id":"asset_ncls_media_asset-protection_457fecee","icon":"ShieldCheckIcon","icon_url":null,"sort_order":0},{"title":"Elder Law","description":"We provide specialized services to address the unique legal needs of seniors, including long-term care planning, Medicaid planning, and elder abuse prevention.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/b6bb1d39d48c68d6d235.webp","image_asset_id":"asset_ncls_media_elder-law_8c8269dd","icon":"UserGroupIcon","icon_url":null,"sort_order":1},{"title":"Estate Planning","description":"Our comprehensive estate planning services include drafting documents, planning for tax implications, and ensuring your assets are distributed according to your wishes.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/71c23cd30e36e5077af8.webp","image_asset_id":"asset_ncls_media_estate-planning_b6002b45","icon":"ClipboardDocumentListIcon","icon_url":null,"sort_order":2},{"title":"Financial Powers of Attorney","description":"We can help draft legal documents that grant a trusted agent the power to make and execute financial decisions on your behalf.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/3e0e853efa8497b9494d.webp","image_asset_id":"asset_ncls_media_financial-power-of-attorney_e8f9fb78","icon":"DocumentTextIcon","icon_url":null,"sort_order":3},{"title":"Guardianships","description":"We provide legal assistance in establishing guardianships for minors or incapacitated adults to ensure their care and protection.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e32e116257a9e4d891d6.webp","image_asset_id":"asset_ncls_media_guardianships_8c9f1769","icon":"ShieldCheckIcon","icon_url":null,"sort_order":4},{"title":"Living Wills","description":"We help you prepare a living will to outline your preferences for medical treatment and end-of-life care, ensuring your wishes are followed.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/900fec46ad4cb009eaba.webp","image_asset_id":"asset_ncls_media_living-will_6eceb4b5","icon":"DocumentTextIcon","icon_url":null,"sort_order":5},{"title":"Medical Powers of Attorney","description":"We can help draft legal documents that allow a trusted person to legally make decisions for you regarding your care if you are ill or incapacitated.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/6794e2d8fe3d6eb86697.webp","image_asset_id":"asset_ncls_media_medical-power-of-attorney_a8fe7a9b","icon":"UserGroupIcon","icon_url":null,"sort_order":6},{"title":"Probate","description":"We can guide you through the multi-step process of administering an estate after the death of a loved one, ensuring all legal requirements are met.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e30ceb064f55ad60f0d1.webp","image_asset_id":"asset_ncls_media_probate-feature_03518918","icon":"ClipboardDocumentCheckIcon","icon_url":null,"sort_order":7},{"title":"Trusts","description":"We can assist in creating various types of trusts to manage and protect your assets, minimize estate taxes, and ensure your wishes are carried out.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/db28ef30fcee279856bc.webp","image_asset_id":"asset_ncls_media_trusts_f909eb5a","icon":"LockClosedIcon","icon_url":null,"sort_order":8},{"title":"Wills","description":"We can help you draft a Will to bequeath property, name the executor of your estate, designate guardianship of any minor children, and more.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/9c46389c33fe8b070c39.webp","image_asset_id":"asset_ncls_media_wills_05897059","icon":"DocumentTextIcon","icon_url":null,"sort_order":9}]', '[{"question":"What is probate?","answer":"Probate is the court process for handling a person''s estate after death. It involves validating the will (if there is one), appointing a personal representative, paying debts and taxes, and distributing remaining assets to heirs. Because missing deadlines or filings can create liability for the executor, legal help can make probate smoother and less stressful."},{"question":"Can I write my own will in North Carolina, and does it need to be notarized?","answer":"In North Carolina, a handwritten or typed will may be valid if it''s signed and properly witnessed. Notarization isn''t required, but a notarized ''self-proving affidavit'' can make probate much smoother. Because small mistakes can leave a will unenforceable, it''s best to have a lawyer review or draft it."},{"question":"What makes a will valid in NC?","answer":"A will is generally valid if it''s in writing, signed by the person making it, and witnessed by two competent adults. There are exceptions for handwritten or oral wills, but they are harder to prove in court. Errors in execution can cause major problems later, so legal guidance can help you avoid costly disputes."},{"question":"What''s the difference between a will and a trust?","answer":"A will takes effect after death and often requires probate, while a trust can manage assets during life and may help heirs avoid probate. The choice depends on goals, family circumstances, and the types of assets involved. An attorney can explain which option is the best fit for your needs."},{"question":"What is an irrevocable trust, and when would someone use one?","answer":"An irrevocable trust is a trust that generally cannot be changed once created. It is sometimes used for tax planning, asset protection, or Medicaid eligibility. Because these trusts limit flexibility and aren''t right for most families, legal advice is important before setting one up."},{"question":"Do I need a lawyer for probate in North Carolina?","answer":"Probate can be handled without an attorney, but the process involves detailed filings, notices, and deadlines that vary by county. Mistakes can create liability for the executor or delay distribution to heirs. Legal support can reduce stress and protect you from problems down the road."},{"question":"How long does probate usually take in NC?","answer":"Probate in North Carolina often takes six months to a year, depending on the size of the estate and whether disputes arise. Debt claims, tax filings, or family disagreements can make it take longer. A lawyer can help streamline the process and avoid unnecessary delays."},{"question":"What documents should I gather to start probate in NC?","answer":"Courts usually require the death certificate, the original will (if any), and an inventory of assets, debts, and heirs. Supporting documents like account statements, deeds, and insurance policies may also be needed. Having a lawyer organize these in advance can prevent rejected filings or missed deadlines."},{"question":"What happens if someone dies without a will in NC?","answer":"If a person dies without a will, North Carolina''s intestacy laws decide who inherits property, usually starting with spouses and children. This process still goes through probate and may not reflect the person''s wishes. Legal guidance can help families navigate the process and resolve disputes."},{"question":"Are handwritten (\"holographic\") wills valid in NC?","answer":"Handwritten wills can be valid in North Carolina if they meet strict requirements, such as being entirely in the testator''s handwriting. These wills are often challenged because they can be unclear or incomplete. Drafting a proper will with an attorney is far more reliable."},{"question":"How much does a simple will cost in North Carolina?","answer":"At NCLS, a straightforward will typically costs between $300 and $600. We determine fees using a sliding scale based on income and household size, with up to 50% discounts available for clients who qualify. By comparison, the average market rate for a simple will in North Carolina is about $600."}]',
  'Schedule a consultation', '/schedule',
  'asset_ncls_media_probate_543a76a1', 'asset_ncls_media_wills-01_8d44a182', '["asset_ncls_media_wills-01_8d44a182","asset_ncls_media_wills-02_644cf3dc","asset_ncls_media_wills-03_ad9cfde1","asset_ncls_media_wills-04_d577945f","asset_ncls_media_wills-05_fe86de2f","asset_ncls_media_wills-06_87386628"]', 'LegalService',
  'Probate and Estate Planning | North Carolina Legal Services', 'At NCLS, we are dedicated to helping you plan for the future and manage the affairs of your loved ones after they pass. We provide comprehensive legal services to ensure your wishes are respected and your family is taken care of.', '/services/probate-and-estate',
  'published', 5, 0,
  'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'offering_ncls_special-education-and-iep-advocacy', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'Special Education and IEP Advocacy', 'special-education-and-iep-advocacy', 'Special Education and IEP Advocacy',
  'Supporting families and communities', 'At NCLS, we are committed to supporting families navigating the Individualized Education Program (IEP) process and other special education services. Our team provides guidance and representation to ensure every child receives the educational support they are entitled to under the Individuals with Disabilities Education Act (IDEA), the Americans with Disabilities Act (ADA), Section 504, and more.', 'At NCLS, we are committed to supporting families navigating the Individualized Education Program (IEP) process and other special education services. Our team provides guidance and representation to ensure every child receives the educational support they are entitled to under the Individuals with Disabilities Education Act (IDEA), the Americans with Disabilities Act (ADA), Section 504, and more. We work alongside families at every stage, protecting student rights and promoting successful outcomes.',
  '[{"title":"IEP Process Support and Advocacy","description":"We offer support throughout the IEP process, from requesting evaluations to developing effective and individualized education plans. By working closely with parents, we help clarify goals and ensure that school districts fulfill their obligations under IDEA. We focus on securing necessary services and accommodations, creating a pathway for each student''s educational success.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/6bbf53416eb2e561a144.webp","image_asset_id":"asset_ncls_media_special-education_f8a8f7bc","icon":"DocumentTextIcon","icon_url":null,"sort_order":0},{"title":"Representation at IEP Meetings","description":"Representation during IEP meetings can significantly impact a child''s educational plan. Our team advocates for each child''s needs at these meetings, ensuring that the school respects procedural safeguards and parents'' rights. With us at the table, families can feel confident that their child''s plan will reflect their unique needs and comply with all legal standards.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/6bbf53416eb2e561a144.webp","image_asset_id":"asset_ncls_media_special-education_f8a8f7bc","icon":"UserGroupIcon","icon_url":null,"sort_order":1},{"title":"State Complaint Filing and Advocacy","description":"If a school fails to meet IDEA requirements, such as by not providing necessary evaluations or services, a state complaint can address these procedural violations. We handle all aspects of filing state complaints, from gathering evidence to submitting detailed documentation to the Department of Public Instruction (DPI). We are committed to addressing any gaps in services, improving the educational experience for each child.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/6bbf53416eb2e561a144.webp","image_asset_id":"asset_ncls_media_special-education_f8a8f7bc","icon":"ExclamationCircleIcon","icon_url":null,"sort_order":2},{"title":"Due Process Hearings","description":"For cases involving disputes over an IEP''s adequacy or other significant disagreements, we provide representation in due process hearings before the Office of Administrative Hearings (OAH). We assist families in building a strong case, supported by expert testimony and thorough documentation, to secure essential services or adjustments to the IEP that best support the student''s needs.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/6bbf53416eb2e561a144.webp","image_asset_id":"asset_ncls_media_special-education_f8a8f7bc","icon":"BalanceScaleIcon","icon_url":null,"sort_order":3},{"title":"Section 504 Plan Development and Compliance","description":"For students who do not qualify for an IEP but still need accommodations, we help families establish effective Section 504 Plans. Our team assists with all aspects of 504 Plan development, ensuring that schools provide necessary accommodations and meet compliance standards. We also address compliance issues when schools do not fulfill their obligations under Section 504.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/6bbf53416eb2e561a144.webp","image_asset_id":"asset_ncls_media_special-education_f8a8f7bc","icon":"ClipboardDocumentCheckIcon","icon_url":null,"sort_order":4},{"title":"Resolution Meetings and Mediation","description":"Many special education issues can be resolved through resolution meetings or mediation, without the need for a formal hearing. We assist families by preparing documentation, setting clear goals, and advocating for effective resolutions that meet the student''s educational needs while avoiding prolonged disputes when possible.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/6bbf53416eb2e561a144.webp","image_asset_id":"asset_ncls_media_special-education_f8a8f7bc","icon":"HandshakeIcon","icon_url":null,"sort_order":5},{"title":"Why Choose NCLS for Special Education Advocacy?","description":"Navigating the special education process can be challenging, but our team is here to support you. Whether you need assistance with IEP development, meeting representation, state complaints, or due process hearings, we are dedicated to protecting your child''s educational rights and helping you secure the resources they need to succeed in school.","image_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/6bbf53416eb2e561a144.webp","image_asset_id":"asset_ncls_media_special-education_f8a8f7bc","icon":"StarIcon","icon_url":null,"sort_order":6}]', '[]',
  'Schedule a consultation', '/schedule',
  'asset_ncls_media_special-education_f8a8f7bc', 'asset_ncls_media_special-education_f8a8f7bc', '["asset_ncls_media_special-education_f8a8f7bc"]', 'LegalService',
  'Special Education and IEP Advocacy | North Carolina Legal Services', 'At NCLS, we are committed to supporting families navigating the Individualized Education Program (IEP) process and other special education services. Our team provides guidance and representation to ensure every child receives the educational support they are entitled to under the Individuals with Disabilities Education Act (IDEA), the Americans with Disabilities Act (ADA), Section 504, and more.', '/services/special-education-and-iep-advocacy',
  'published', 6, 0,
  'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO tenant_pages (
  id, organization_id, site_id, path, title, slug, page_type, summary, body,
  components_json, cta_label, cta_url, seo_title, seo_description, canonical_url,
  robots, status, sort_order, source, source_ref, created_at, updated_at
) VALUES
(
  'page_ncls_home', 'org-ncls-blawby', 'site-ncls-blawby',
  '/', 'Access to Justice for All. North Carolina''s affordable legal services.', '',
  'home', '', 'We believe that access to the Justice System is a fundamental right. At North Carolina Legal Services we are committed to removing financial barriers that prevent many in our community from obtaining high-quality legal assistance.',
  '[{"type":"home_hero","title":"Access to Justice for All.\nNorth Carolina''s affordable\nlegal services.","accent":"Justice for All.","description":"We believe that access to the Justice System is a fundamental right. At North Carolina Legal Services we are committed to removing financial barriers that prevent many in our community from obtaining high-quality legal assistance.","label":"Request a Consultation","url":"/schedule","background":{"asset_id":"asset_ncls_media_background-hero_05f81e86","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/599abbcd10dd490792d2.webp","role":"home_hero_background","source_name":"background-hero.webp"}},{"type":"services_intro","title":"Our","accent":"Services","description":"Explore a wide range of legal services provided by North Carolina Legal Services. Our dedicated team offers expert assistance in Family Law, Small Business Legal Support, Employment Law, Tenant Rights Law, and Probate & Estate Planning. Find the legal support you need to protect your rights and secure your future.","decoration":{"asset_id":"asset_ncls_media_background-features_d3572b1b","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/be87d08d6e14bf57ecef.webp","role":"services_background","source_name":"background-features.webp"}},{"type":"video_feature","title":"Empowering North Carolina: Our Innovative","accent":"Approach to Justice","video_url":"https://www.youtube.com/embed/glBHONAzWYo?si=coXUD5UlzMHAfzVD","video_title":"Rich Gittings Speaks about North Carolina Legal Services","features":[{"name":"Accessible Justice","desc":"North Carolina Legal Services introduces a groundbreaking approach to legal aid, ensuring justice is within reach for all. Our sliding scale fee system, based on income, guarantees affordability without compromising quality representation."},{"name":"Expert Attorneys","desc":"Our team comprises seasoned attorneys committed to swift and efficient service. With tight budgets in mind, our attorneys prioritize quick turnaround times, ensuring every client receives the attention they deserve."},{"name":"Flexible Scheduling","desc":"At North Carolina Legal Services, flexibility is key. Attorneys have the freedom to set their own schedules, ensuring work-life balance without sacrificing client needs. It''s a stress-free environment where both judges and clients are satisfied."},{"name":"Supportive Environment","desc":"Join a team where support is abundant. Whether it''s assistance with cases or guidance on legal matters, North Carolina Legal Services fosters a supportive atmosphere, allowing attorneys to thrive and deliver exceptional results."}],"images":[{"asset_id":"asset_ncls_media_getting-a-divorce-in-north-carolina_ffbfbfd0","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/ea4d301a3cefbbd17a44.webp","role":"approach_supporting_image","source_name":"getting_a_divorce_in_north_carolina.webp"},{"asset_id":"asset_ncls_media_writing-your-own-will-how-it-works_c1f1ad9b","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/6b9b810084d4809b6d5d.webp","role":"approach_supporting_image","source_name":"writing-your-own-will-how-it-works.webp"}]},{"type":"qa","decoration":{"asset_id":"asset_ncls_media_background-feature-2_970a5c32","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/c53c7b8d7a6de1e7cc70.webp","role":"qa_background","source_name":"background-feature-2.webp"}},{"type":"reviews","title":"What Clients Say","description":"At North Carolina Legal Services we believe that access to the justice system shouldn''t be limited by one''s income. We offer quality legal services at a price that working families can afford."},{"type":"latest_articles"},{"type":"consultation_cta","title":"Get started today","accent":"today","description":"Trust our friendly team for affordable, comprehensive legal services. Contact us today to resolve your legal issues and gain peace of mind.","label":"Request a Consultation","url":"/schedule","background":{"asset_id":"asset_ncls_media_background-cta_79bdbc52","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/735d1ec58bf43ca897ce.webp","role":"consultation_cta_background","source_name":"background-cta.webp"},"featured":{"asset_id":"asset_ncls_media_logo-2_e3a91ed9","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/9cb15d96c31f5ba5fb2c.webp","role":"consultation_cta_featured","source_name":"logo-2.webp"}}]', NULL, NULL,
  NULL, NULL, NULL, NULL,
  'published', 0, 'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'page_ncls_services', 'org-ncls-blawby', 'site-ncls-blawby',
  '/services', 'Legal Services Offered', 'services',
  'services', 'Explore a wide range of legal services provided by North Carolina Legal Services. Our dedicated team offers expert assistance in Family Law, Small Business Legal Support, Employment Law, Tenant Rights Law, and Probate & Estate Planning. Find the legal support you need to protect your rights and secure your future.', 'Explore a wide range of legal services provided by North Carolina Legal Services. Our dedicated team offers expert assistance in Family Law, Small Business Legal Support, Employment Law, Tenant Rights Law, and Probate & Estate Planning. Find the legal support you need to protect your rights and secure your future.',
  '[{"type":"services_intro","title":"Our","accent":"Services","description":"Explore a wide range of legal services provided by North Carolina Legal Services. Our dedicated team offers expert assistance in Family Law, Small Business Legal Support, Employment Law, Tenant Rights Law, and Probate & Estate Planning. Find the legal support you need to protect your rights and secure your future.","decoration":{"asset_id":"asset_ncls_media_background-features_d3572b1b","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/be87d08d6e14bf57ecef.webp","role":"services_background","source_name":"background-features.webp"}},{"type":"qa","decoration":{"asset_id":"asset_ncls_media_background-feature-2_970a5c32","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/c53c7b8d7a6de1e7cc70.webp","role":"qa_background","source_name":"background-feature-2.webp"}},{"type":"consultation_cta","title":"Get started today","accent":"today","description":"Trust our friendly team for affordable, comprehensive legal services. Contact us today to resolve your legal issues and gain peace of mind.","label":"Request a Consultation","url":"/schedule","background":{"asset_id":"asset_ncls_media_background-cta_79bdbc52","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/735d1ec58bf43ca897ce.webp","role":"consultation_cta_background","source_name":"background-cta.webp"},"featured":{"asset_id":"asset_ncls_media_logo-2_e3a91ed9","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/9cb15d96c31f5ba5fb2c.webp","role":"consultation_cta_featured","source_name":"logo-2.webp"}}]', NULL, NULL,
  'Affordable Legal Services in the North Carolina | North Carolina Legal Services', 'Explore a wide range of legal services provided by North Carolina Legal Services. Our dedicated team offers expert assistance in Family Law, Small Business Legal Support, Employment Law, Tenant Rights Law, and Probate & Estate Planning. Find the legal support you need to protect your rights and secure your future.', NULL, NULL,
  'published', 0, 'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'page_ncls_about', 'org-ncls-blawby', 'site-ncls-blawby',
  '/about', 'About Us', 'about',
  'about', 'North Carolina Legal Services is a non-profit law firm that offers legal services with income-based fees to assist individuals and families that earn too much to qualify for free legal assistance, but who cannot afford the high cost of traditional law firms.', 'North Carolina Legal Services is a non-profit law firm that offers legal services with income-based fees to assist individuals and families that earn too much to qualify for free legal assistance, but who cannot afford the high cost of traditional law firms.',
  '[{"type":"page_hero","title":"About Us","description":"North Carolina Legal Services is a non-profit law firm that offers legal services with income-based fees to assist individuals and families that earn too much to qualify for free legal assistance, but who cannot afford the high cost of traditional law firms.","variant":"about","background":"accent-200"},{"type":"team","features":[{"title":"Our Mission","description":"At North Carolina Legal Services, we are committed to providing high-quality legal services at affordable rates for individuals, families, and small businesses.","icon":{"asset_id":"asset_ncls_media_mission_5fd91553","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/d9a827c04465883d96b5.svg","role":"tenant_feature_icon","source_name":"mission.svg"}},{"title":"Our People","description":"Our attorneys and staff are all experienced, mission-aligned, resourceful, and talented.","icon":{"asset_id":"asset_ncls_media_people_33026f02","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/1b05529f94fe9dce7161.svg","role":"tenant_feature_icon","source_name":"people.svg"}},{"title":"Our Vision","description":"Empowering our community through accessible and effective legal services.","icon":{"asset_id":"asset_ncls_media_vision_1bd2b537","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/3eaccea50d2ecfa63643.svg","role":"tenant_feature_icon","source_name":"vision.svg"}}],"people":[{"first_name":"Rich","last_name":"Gittings","title":"Founder / Executive Director","bio":"Rich grew up in Mesa, Arizona and moved to North Carolina to attend law school at the University of North Carolina and to earn a Masters of Public Policy Degree at Duke University. Rich is passionate about fighting poverty and serving underserved communities. He founded North Carolina Legal Services to address systemic inequality in the Justice System. He currently is serving as its Executive Director and as a member of the Board.","url":"/schedule","sort_order":0,"image":{"asset_id":"asset_ncls_media_rich-gittings_78d5beeb","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/5b03236f92812fb7db78.webp","role":"team_portrait","source_name":"rich-gittings.webp"}}]},{"type":"impact","title":"Our Impact in Numbers","description":"Since our founding in 2022, North Carolina Legal Services has been dedicated to closing the justice gap and ensuring that quality legal representation is accessible to all North Carolinians, regardless of their financial circumstances. As a 501(c)(3) nonprofit law firm, we provide affordable legal services, family law assistance, employment law consultation, tenant rights advocacy, and probate services to working families and small businesses across North Carolina.","additionalDescription":"Your tax-deductible donation directly enables us to serve more families, expand our reach across the state, and continue our mission of providing affordable legal services to those who need it most. Every contribution helps us offer discounted legal fees, free legal consultations, and comprehensive legal assistance to individuals and families who cannot afford traditional law firm rates.","statistics":[{"value":"8","label":"Counties served with plans to continue to grow"},{"value":"96%","label":"Clients served who would not otherwise have access to legal representation"},{"value":"200+","label":"Clients served"}]},{"type":"services_intro","title":"Our","accent":"Services","description":"Explore a wide range of legal services provided by North Carolina Legal Services. Our dedicated team offers expert assistance in Family Law, Small Business Legal Support, Employment Law, Tenant Rights Law, and Probate & Estate Planning. Find the legal support you need to protect your rights and secure your future.","decoration":{"asset_id":"asset_ncls_media_background-features_d3572b1b","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/be87d08d6e14bf57ecef.webp","role":"services_background","source_name":"background-features.webp"}},{"type":"qa","decoration":{"asset_id":"asset_ncls_media_background-feature-2_970a5c32","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/c53c7b8d7a6de1e7cc70.webp","role":"qa_background","source_name":"background-feature-2.webp"}},{"type":"reviews","title":"What Clients Say","description":"At North Carolina Legal Services we believe that access to the justice system shouldn''t be limited by one''s income. We offer quality legal services at a price that working families can afford."},{"type":"consultation_cta","title":"Get started today","accent":"today","description":"Trust our friendly team for affordable, comprehensive legal services. Contact us today to resolve your legal issues and gain peace of mind.","label":"Request a Consultation","url":"/schedule","background":{"asset_id":"asset_ncls_media_background-cta_79bdbc52","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/735d1ec58bf43ca897ce.webp","role":"consultation_cta_background","source_name":"background-cta.webp"},"featured":{"asset_id":"asset_ncls_media_logo-2_e3a91ed9","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/9cb15d96c31f5ba5fb2c.webp","role":"consultation_cta_featured","source_name":"logo-2.webp"}}]', NULL, NULL,
  'About | North Carolina Legal Services', 'North Carolina Legal Services is a non-profit law firm that offers legal services with income-based fees to assist individuals and families that earn too much to qualify for free legal assistance, but who cannot afford the high cost of traditional law firms.', NULL, NULL,
  'published', 0, 'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'page_ncls_pricing', 'org-ncls-blawby', 'site-ncls-blawby',
  '/pricing', 'Pricing and Fees', 'pricing',
  'pricing', 'North Carolina Legal Services offers income-based rates ranging from $150-$225 per hour with income-based fees to assist individuals and families that earn too much to qualify for free legal assistance, but who cannot afford the high cost of traditional law firms.', 'North Carolina Legal Services offers income-based rates ranging from $150-$225 per hour with income-based fees to assist individuals and families that earn too much to qualify for free legal assistance, but who cannot afford the high cost of traditional law firms.

Use the table below to determine the applicable discount for your family size:

1) Find Your Family Size: In the table, locate the row that matches the number of people in your household under the "Family Size" column. This includes yourself, your spouse or partner, and any dependents.

2) Determine Your Income Level: Compare your household''s annual income to the income ranges in the table, under the columns "250% Federal Poverty Level," "350% Federal Poverty Level," and "400% Federal Poverty Level."

Identify Your Discount:
- If your household income is 250% or less of the Federal Poverty Level for your family size, you qualify for a 50% discount ($160/hr rate).
- If your income is between 250% and 350% of the Federal Poverty Level, you qualify for a 33% discount ($215/hr rate).
- If your income is between 350% and 400% of the Federal Poverty Level, you qualify for a 25% discount ($240/hr rate).
- If your income exceeds 400% of the Federal Poverty Level for your family size, this sliding scale may not apply, and standard rates ($320/hr) may be in effect.',
  '[{"type":"page_hero","title":"Affordable, for everyone","description":"In 2022, the Legal Services Corporation reported that 92% of substantial civil legal problems faced by low-income Americans received inadequate or no legal help. Market-rate legal fees are expensive and often unaffordable for working individuals and families. Community organizations do offer free legal assistance, but many people earn too much to qualify and still cannot afford the high cost of hiring a private attorney. To bridge this gap, North Carolina Legal Services offers income-based fee arrangements for individual matters and discounted rates for small businesses and nonprofits.\n\n**Clear, predictable pricing.**\n\nTraditional firms in North Carolina charge an average of $320 per hour for individual and family cases, and about $360 per hour for businesses. Consultations often cost up to $200 for a 60–90 minute meeting that includes legal research and planning.\n\nNorth Carolina Legal Services offers individuals and families up to a 50% discount for legal services and representation, depending on income and household size.\n\nWe also offer a 50% discount on the $360/hour market rate to qualifying small businesses and 501(c)(3) nonprofits. At $180/hour, we''re able to support the mission-driven organizations that strengthen our communities.","variant":"pricing","background":"primary-100"},{"type":"pricing_plans","plans":[{"discount":"50%","price":"$160 **/hr**","description":"Client households at or below 250% of the Federal Poverty Level receive a 50% discount off the $320/hour market average.","features":["This discount also applies to flat-rate services where available."]},{"discount":"33%","price":"$215 **/hr**","description":"Client households between 250% and 350% of the Federal Poverty Level receive a 33% discount off the $320/hour market average.","features":["This discount also applies to flat-rate services where available."]},{"discount":"25%","price":"$240 **/hr**","description":"Client households between 350% and 400% of the Federal Poverty Level receive a 25% discount off the $320/hour market average.","features":["This discount also applies to flat-rate services where available."]},{"discount":"Market Rate","price":"$320 **/hr**","description":"Client households above 400% of the Federal Poverty Level pay the standard market rate.","features":["Standard market rate."]},{"discount":"50%","price":"$180 **/hr**","description":"Qualifying small businesses and nonprofits receive a 50% discount off the $360/hour market rate.","features":["Includes 501(c)(3) nonprofits."]},{"discount":"Market Rate","price":"$360 **/hr**","description":"Businesses that do not qualify as small businesses under the SBA definition pay the market rate.","features":["Market rate."]}]},{"type":"pricing_calculator","title":"Sliding-scale fee estimator","note":"If your income falls below 250% of the Federal Poverty Level for your family size, you qualify for a 50% discount. Those with incomes between 250% and 350% receive a 33% discount, while individuals and families earning between 350% and 400% are eligible for a 25% discount. We understand that everyones situation is unique, and our goal is to ensure that you have access to the legal representation you deserve, regardless of your financial situation.","source":"React NCLS priceTableComponent normalized by Blawby adapter","effectiveDate":null,"table":{"description":"Use the table below to determine the applicable discount for your family size:\n\n      1) Find Your Family Size: In the table, locate the row that matches the number of people in your household under the \"Family Size\" column. This includes yourself, your spouse or partner, and any dependents.\n\n      2) Determine Your Income Level: Compare your household''s annual income to the income ranges in the table, under the columns \"250% Federal Poverty Level,\" \"350% Federal Poverty Level,\" and \"400% Federal Poverty Level.\"\n\n      Identify Your Discount:\n      - If your household income is 250% or less of the Federal Poverty Level for your family size, you qualify for a 50% discount ($160/hr rate).\n      - If your income is between 250% and 350% of the Federal Poverty Level, you qualify for a 33% discount ($215/hr rate).\n      - If your income is between 350% and 400% of the Federal Poverty Level, you qualify for a 25% discount ($240/hr rate).\n      - If your income exceeds 400% of the Federal Poverty Level for your family size, this sliding scale may not apply, and standard rates ($320/hr) may be in effect.","notice":"If your income falls below 250% of the Federal Poverty Level for your family size, you qualify for a 50% discount. Those with incomes between 250% and 350% receive a 33% discount, while individuals and families earning between 350% and 400% are eligible for a 25% discount. We understand that everyones situation is unique, and our goal is to ensure that you have access to the legal representation you deserve, regardless of your financial situation.","columns":["Family Size","250% Federal Poverty Level","350% Federal Poverty Level","400% Federal Poverty Level"],"rows":[["1","$39,900","$55,860","$63,840"],["2","$54,100","$75,740","$86,560"],["3","$68,300","$95,620","$109,280"],["4","$82,500","$115,500","$132,000"],["5","$96,700","$135,380","$154,720"],["6","$110,900","$155,260","$177,440"],["7","$125,100","$175,140","$200,160"],["8","$139,300","$195,020","$222,880"]]},"enabled":true},{"type":"qa","decoration":{"asset_id":"asset_ncls_media_background-feature-2_970a5c32","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/c53c7b8d7a6de1e7cc70.webp","role":"qa_background","source_name":"background-feature-2.webp"}},{"type":"services_intro","title":"Our","accent":"Services","description":"Explore a wide range of legal services provided by North Carolina Legal Services. Our dedicated team offers expert assistance in Family Law, Small Business Legal Support, Employment Law, Tenant Rights Law, and Probate & Estate Planning. Find the legal support you need to protect your rights and secure your future.","decoration":{"asset_id":"asset_ncls_media_background-features_d3572b1b","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/be87d08d6e14bf57ecef.webp","role":"services_background","source_name":"background-features.webp"}},{"type":"consultation_cta","title":"Get started today","accent":"today","description":"Trust our friendly team for affordable, comprehensive legal services. Contact us today to resolve your legal issues and gain peace of mind.","label":"Request a Consultation","url":"/schedule","background":{"asset_id":"asset_ncls_media_background-cta_79bdbc52","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/735d1ec58bf43ca897ce.webp","role":"consultation_cta_background","source_name":"background-cta.webp"},"featured":{"asset_id":"asset_ncls_media_logo-2_e3a91ed9","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/9cb15d96c31f5ba5fb2c.webp","role":"consultation_cta_featured","source_name":"logo-2.webp"}}]', NULL, NULL,
  'Pricing and Fees | North Carolina Legal Services', 'North Carolina Legal Services offers income-based rates ranging from $150-$225 per hour with income-based fees to assist individuals and families that earn too much to qualify for free legal assistance, but who cannot afford the high cost of traditional law firms.', NULL, NULL,
  'published', 0, 'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'page_ncls_contact', 'org-ncls-blawby', 'site-ncls-blawby',
  '/contact', 'Contact Us', 'contact',
  'contact', 'Have a question or need to get in touch? Connect with North Carolina Legal Services. Whether you need help finding an attorney or want to help make the justice system more fair and accessible, reach out to one of our professionals today.', 'Have a question or need to get in touch? Connect with North Carolina Legal Services. Whether you need help finding an attorney or want to help make the justice system more fair and accessible, reach out to one of our professionals today.',
  '[{"type":"page_hero","title":"Contact Us","description":"Have a question or need to get in touch? Connect with North Carolina Legal Services. Whether you need help finding an attorney or want to help make the justice system more fair and accessible, reach out to one of our professionals today.","variant":"contact","background":"accent-200"},{"type":"contact_cards","title":"Get in touch","description":"If you have any questions prior to your consultation, feel free to reach out!","cardsContent":["### Contact\n\n- **Email:** [contact@northcarolinalegalservices.org](mailto:contact@northcarolinalegalservices.org)\n- **Phone:** [+1 (984) 777-8288](tel:+19847778288)","### Donations\n\n- **Email:** [donate@northcarolinalegalservices.org](mailto:donate@northcarolinalegalservices.org)\n- **Phone:** [+1 (984) 777-8288](tel:+19847778288)\n- **Donate Online:** [Visit our donation page](/donate) to make a secure online donation and learn more about how your contribution supports our mission."]},{"type":"qa","decoration":{"asset_id":"asset_ncls_media_background-feature-2_970a5c32","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/c53c7b8d7a6de1e7cc70.webp","role":"qa_background","source_name":"background-feature-2.webp"}},{"type":"reviews"},{"type":"consultation_cta","title":"Get started today","accent":"today","description":"Trust our friendly team for affordable, comprehensive legal services. Contact us today to resolve your legal issues and gain peace of mind.","label":"Request a Consultation","url":"/schedule","background":{"asset_id":"asset_ncls_media_background-cta_79bdbc52","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/735d1ec58bf43ca897ce.webp","role":"consultation_cta_background","source_name":"background-cta.webp"},"featured":{"asset_id":"asset_ncls_media_logo-2_e3a91ed9","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/9cb15d96c31f5ba5fb2c.webp","role":"consultation_cta_featured","source_name":"logo-2.webp"}}]', NULL, NULL,
  'Contact | North Carolina Legal Services', 'Have a question or need to get in touch? Connect with North Carolina Legal Services. Whether you need help finding an attorney or want to help make the justice system more fair and accessible, reach out to one of our professionals today.', NULL, NULL,
  'published', 0, 'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'page_ncls_schedule', 'org-ncls-blawby', 'site-ncls-blawby',
  '/schedule', 'Request a Legal Consultation', 'schedule',
  'schedule', 'Simplify your legal journey and experience accessible justice with North Carolina Legal Services. Schedule a consultation to discover a seamless way to address your legal needs and secure your rights.', 'Get legal guidance for North Carolina matters, including family law, tenant rights, employment, special education, probate, and small business issues.

A consultation can help you understand the legal issues involved, identify deadlines or risks, and decide what steps make sense next.',
  '[{"type":"schedule_hero","title":"Request a Legal Consultation","description":"Get legal guidance for North Carolina matters, including family law, tenant rights, employment, special education, probate, and small business issues.\n\nA consultation can help you understand the legal issues involved, identify deadlines or risks, and decide what steps make sense next.","priceLine":"","buttonText":"Request Consultation","buttonUrl":"https://ncls.cliogrow.com/book","notice":"Please note that submitting a request does not automatically confirm an appointment. Consultation requests are reviewed before scheduling is confirmed."},{"type":"schedule_guidance","content":"## Why Schedule a Consultation\n\nA legal problem is easier to manage when you know what matters first. A consultation gives you a chance to explain the situation, identify the key legal issues, and understand whether there are deadlines, notices, court dates, or practical risks that need immediate attention.\n\nConsultations are useful for both urgent and developing matters. You may be responding to court papers, dealing with a landlord or employer, preparing for a school meeting, sorting out an estate issue, or trying to protect yourself before a dispute gets worse. The goal is to give you practical legal direction based on the facts you have now.\n\nA consultation can also help you use your time more effectively. Instead of spending hours trying to guess what matters, you can focus on the documents, events, deadlines, and decisions that are most likely to affect your legal position.\n\nNorth Carolina Legal Services provides consultations for a range of North Carolina matters, including family law, tenant rights, employment issues, special education and IEP advocacy, probate and estate matters, and some small business concerns.","title":"Why Schedule a Consultation","description":"A legal problem is easier to manage when you know what matters first. A consultation gives you a chance to explain the situation, identify the key legal issues, and understand whether there are deadlines, notices, court dates, or practical risks that need immediate attention.","prepTitle":"What should I have ready before I schedule?","prepItems":["Please have the most relevant information about your matter available. That may include court papers, notices, leases, contracts, school records, business records, emails, text messages, pay records, or other documents tied to the issue.","It is also helpful to prepare: a short timeline of what happened, any deadlines, hearings, meetings, or response dates, the names of the people or organizations involved, the outcome you are hoping to achieve, the main questions you want answered","Time spent reviewing documents is part of the consultation time, so it is best to send only the materials most relevant to the issue."],"expectationsTitle":"What happens after submission?","expectationItems":["Submitting a request does not automatically confirm an appointment. Each request is reviewed before scheduling is confirmed, and you will be contacted with next steps if the matter is one we are able to handle.","Depending on the nature of the matter, consultations may be handled remotely. Scheduling details are provided after a request is reviewed."],"detailsTitle":"What kinds of issues can we discuss?","detailsText":"Consultations are available for a range of North Carolina legal matters, including family law, tenant rights, employment law, special education, probate and estate matters, and some small business concerns.","trustTitle":"How long is the consultation?","trustText":"Consultations are typically scheduled for 30 minutes. In some matters, part of that time may include reviewing the information and documents you provide in advance.","noticeTitle":"Before You Submit","notice":"Please note that submitting a request does not automatically confirm an appointment. Consultation requests are reviewed before scheduling is confirmed.","buttonText":"Request Consultation","buttonUrl":"https://ncls.cliogrow.com/book","decoration":{"asset_id":"asset_ncls_media_background-features_d3572b1b","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/be87d08d6e14bf57ecef.webp","role":"services_background","source_name":"background-features.webp"}},{"type":"schedule_qa","items":[{"question":"How long is the consultation?","answer":"Consultations are typically scheduled for 30 minutes. In some matters, part of that time may include reviewing the information and documents you provide in advance.","pageType":"schedule"},{"question":"What kinds of issues can we discuss?","answer":"Consultations are available for a range of North Carolina legal matters, including family law, tenant rights, employment law, special education, probate and estate matters, and some small business concerns.","pageType":"schedule"},{"question":"Is my request confirmed immediately?","answer":"No. Submitting a request does not automatically confirm an appointment. Each request is reviewed before scheduling is confirmed, and you will be contacted with next steps if the matter is one we are able to handle.","pageType":"schedule"},{"question":"What should I have ready before I schedule?","answer":"Please have the most relevant information about your matter available. That may include court papers, notices, leases, contracts, school records, business records, emails, text messages, pay records, or other documents tied to the issue.\n\nIt is also helpful to prepare:\n\n* a short timeline of what happened\n* any deadlines, hearings, meetings, or response dates\n* the names of the people or organizations involved\n* the outcome you are hoping to achieve\n* the main questions you want answered\n\nTime spent reviewing documents is part of the consultation time, so it is best to send only the materials most relevant to the issue.","pageType":"schedule"},{"question":"Do you offer online consultations?","answer":"Yes. Depending on the nature of the matter, consultations may be handled remotely. Scheduling details are provided after a request is reviewed.","pageType":"schedule"}],"decoration":{"asset_id":"asset_ncls_media_background-feature-2_970a5c32","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/c53c7b8d7a6de1e7cc70.webp","role":"qa_background","source_name":"background-feature-2.webp"}},{"type":"reviews"},{"type":"schedule_cta","title":"Request a Legal Consultation","description":"Get legal guidance for North Carolina matters, including family law, tenant rights, employment, special education, probate, and small business issues.\n\nA consultation can help you clarify the issues involved, understand what information matters most, and decide on the next step.","priceLine":"","notice":"Please note that submitting a request does not automatically confirm an appointment. Consultation requests are reviewed before scheduling is confirmed.","buttonText":"Request Consultation","buttonUrl":"https://ncls.cliogrow.com/book","background":{"asset_id":"asset_ncls_media_background-cta_79bdbc52","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/735d1ec58bf43ca897ce.webp","role":"consultation_cta_background","source_name":"background-cta.webp"}}]', NULL, NULL,
  'Schedule a Consultation | North Carolina Legal Services', 'Simplify your legal journey and experience accessible justice with North Carolina Legal Services. Schedule a consultation to discover a seamless way to address your legal needs and secure your rights.', NULL, NULL,
  'published', 0, 'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'page_ncls_blog', 'org-ncls-blawby', 'site-ncls-blawby',
  '/blog', 'Our Blog', 'blog',
  'blog', 'A North Carolina Legal Blog – News, Insights, and Opinions on Lawyers, Law Suits, and all things North Carolina Legal. Our blog offers a wealth of valuable resources, expert perspectives, and in-depth analysis on the legal landscape in North Carolina.', 'A North Carolina Legal Blog – News, Insights, and Opinions on Lawyers, Law Suits, and all things North Carolina Legal. Our blog offers a wealth of valuable resources, expert perspectives, and in-depth analysis on the legal landscape in North Carolina.*',
  '[{"type":"page_hero","title":"Our Blog","description":"A North Carolina Legal Blog – News, Insights, and Opinions on Lawyers, Law Suits, and all things North Carolina Legal. Our blog offers a wealth of valuable resources, expert perspectives, and in-depth analysis on the legal landscape in North Carolina.*","variant":"blog","background":"primary-100"},{"type":"article_filters"},{"type":"disclaimer","content":"\n              *DISCLAIMER: The purpose of this website is informational - no\n              attorney-client relationship is created by using this website or\n              reading this blog. No legal advice is intended. If you have\n              questions about a current or potential legal problem, you should\n              always contact an attorney directly for specific advice. Results\n              described on this website are meant to describe the work and\n              experience of our Firm. The uncertainty & risk inherent in\n              litigation, as well as the specific individual details of each\n              case mean that results or a particular outcome are never\n              guaranteed. This website is provided \"as is,\" without any warranty\n              of any kind, express or implied.\n      "},{"type":"qa","decoration":{"asset_id":"asset_ncls_media_background-feature-2_970a5c32","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/c53c7b8d7a6de1e7cc70.webp","role":"qa_background","source_name":"background-feature-2.webp"}},{"type":"consultation_cta","title":"Get started today","accent":"today","description":"Trust our friendly team for affordable, comprehensive legal services. Contact us today to resolve your legal issues and gain peace of mind.","label":"Request a Consultation","url":"/schedule","background":{"asset_id":"asset_ncls_media_background-cta_79bdbc52","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/735d1ec58bf43ca897ce.webp","role":"consultation_cta_background","source_name":"background-cta.webp"},"featured":{"asset_id":"asset_ncls_media_logo-2_e3a91ed9","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/9cb15d96c31f5ba5fb2c.webp","role":"consultation_cta_featured","source_name":"logo-2.webp"}}]', NULL, NULL,
  'Blog | North Carolina Legal Services', 'A North Carolina Legal Blog – News, Insights, and Opinions on Lawyers, Law Suits, and all things North Carolina Legal. Our blog offers a wealth of valuable resources, expert perspectives, and in-depth analysis on the legal landscape in North Carolina.', NULL, NULL,
  'published', 0, 'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'page_ncls_donate', 'org-ncls-blawby', 'site-ncls-blawby',
  '/donate', 'Support Equal Access to Justice', 'donate',
  'donate', 'Support equal access to justice in North Carolina. Your donation helps provide affordable legal services to families and individuals who need it most. Make a tax-deductible contribution to support our mission.', 'Your tax-deductible donation directly enables us to serve more families, expand our reach across the state, and continue our mission of providing affordable legal services to those who need it most. Every contribution helps us offer discounted legal fees, free legal consultations, and comprehensive legal assistance to individuals and families who cannot afford traditional law firm rates.

Support equal access to justice in North Carolina. Your donation helps provide affordable legal services to families and individuals who need it most. Make a tax-deductible contribution to support our mission.',
  '[{"type":"page_hero","title":"Support Equal Access to Justice","description":"Your donation helps support our mission to ensure that North Carolinians have access to quality legal representation. Every contribution makes a difference in providing access to justice for those who need it most.\n\nNorth Carolina Legal Services is a 501(c)(3) nonprofit organization. Your donation is tax-deductible and goes directly to providing legal services for families and individuals who cannot afford traditional legal representation.","variant":"donate","background":"primary-100"},{"type":"donation_choices","tiers":[{"amount":100,"title":"Justice Advocate","description":"Support comprehensive legal assistance for those in need","featured":true,"icon":"ScaleIcon"}]},{"type":"impact","title":"Our Impact in Numbers","description":"Since our founding in 2022, North Carolina Legal Services has been dedicated to closing the justice gap and ensuring that quality legal representation is accessible to all North Carolinians, regardless of their financial circumstances. As a 501(c)(3) nonprofit law firm, we provide affordable legal services, family law assistance, employment law consultation, tenant rights advocacy, and probate services to working families and small businesses across North Carolina.","additionalDescription":"Your tax-deductible donation directly enables us to serve more families, expand our reach across the state, and continue our mission of providing affordable legal services to those who need it most. Every contribution helps us offer discounted legal fees, free legal consultations, and comprehensive legal assistance to individuals and families who cannot afford traditional law firm rates.","statistics":[{"value":"8","label":"Counties served with plans to continue to grow"},{"value":"96%","label":"Clients served who would not otherwise have access to legal representation"},{"value":"200+","label":"Clients served"}]},{"type":"donation_support","difference":{"title":"Your Donation Makes a Difference","description":"Every dollar you contribute goes directly to providing legal services for those who need it most. Your support helps us fight for justice, equality, and fairness in our community.","items":["Tax-deductible contribution","Secure payment processing","Immediate impact on our community"]},"other_ways":{"title":"Other Ways to Support","description":"Beyond financial contributions, there are many ways to support our mission:","items":[{"title":"Volunteer your time and expertise","description":"Help us serve more families in need","url":"/contact?type=volunteer","icon":"UserGroupIcon"},{"title":"Spread awareness about our services","description":"Share our mission with your network","url":"/blog","icon":"AcademicCapIcon"},{"title":"Partner with us professionally","description":"Join us in making justice accessible","url":"/contact?type=partnership","icon":"ScaleIcon"}]}},{"type":"qa","decoration":{"asset_id":"asset_ncls_media_background-feature-2_970a5c32","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/c53c7b8d7a6de1e7cc70.webp","role":"qa_background","source_name":"background-feature-2.webp"}}]', 'Donate externally', 'https://app.blawby.com/northcarolinalegalservices/pay/donate',
  'Donate | North Carolina Legal Services', 'Support equal access to justice in North Carolina. Your donation helps provide affordable legal services to families and individuals who need it most. Make a tax-deductible contribution to support our mission.', NULL, NULL,
  'published', 0, 'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'page_ncls_privacy', 'org-ncls-blawby', 'site-ncls-blawby',
  '/policies/privacy', 'Privacy Policy', 'policies-privacy',
  'privacy', 'Welcome to our website. By accessing and using this website, you agree to comply with and be bound by the following terms and conditions of use: The content of this website is for informational purposes only and is subject to change without notice.', 'This Privacy Policy describes how North Carolina Legal Services (the "Site", "we", "us", or "our") collects, uses, and discloses your personal information when you visit, use our services, or make a purchase from https://www.northcarolinalegalservices.org/ (the "Site") or otherwise communicate with us (collectively, the "Services"). For purposes of this Privacy Policy, "you" and "your" means you as the user of the Services, whether you are a customer, website visitor, or another individual whose information we have collected pursuant to this Privacy Policy.

Please read this Privacy Policy carefully. By using and accessing any of the Services, you agree to the collection, use, and disclosure of your information as described in this Privacy Policy. If you do not agree to this Privacy Policy, please do not use or access any of the Services.

### Changes to This Privacy Policy

We may update this Privacy Policy from time to time, including to reflect changes to our practices or for other operational, legal, or regulatory reasons. We will post the revised Privacy Policy on the Site, update the "Last updated" date and take any other steps required by applicable law.

### How We Collect and Use Your Personal Information

To provide the Services, we collect and have collected over the past 12 months personal information about you from a variety of sources, as set out below. The information that we collect and use varies depending on how you interact with us.

In addition to the specific uses set out below, we may use information we collect about you to communicate with you, provide the Services, comply with any applicable legal obligations, enforce any applicable terms of service, and to protect or defend the Services, our rights, and the rights of our users or others.

### What Personal Information We Collect

The types of personal information we obtain about you depends on how you interact with our Site and use our Services. When we use the term "personal information", we are referring to information that identifies, relates to, describes or can be associated with you. The following sections describe the categories and specific types of personal information we collect.

### Information We Collect Directly from You

Information that you directly submit to us through our Services may include:

*   Basic contact details including your name, address, phone number, email.
*   Order information including your name, billing address, shipping address, payment confirmation, email address, phone number.
*   Account information including your username, password, security questions.
*   Shopping information including the items you view, put in your cart or add to your wishlist.
*   Customer support information including the information you choose to include in communications with us, for example, when sending a message through the Services.

Some features of the Services may require you to directly provide us with certain information about yourself. You may elect not to provide this information, but doing so may prevent you from using or accessing these features.

### Information We Collect through Cookies

We also automatically collect certain information about your interaction with the Services ("Usage Data"). To do this, we may use cookies, pixels and similar technologies ("Cookies"). Usage Data may include information about how you access and use our Site and your account, including device information, browser information, information about your network connection, your IP address and other information regarding your interaction with the Services.

### Information We Obtain from Third Parties

Finally, we may obtain information about you from third parties, including from vendors and service providers who may collect information on our behalf, such as:

*   Companies who support our Site and Services
*   Our payment processors, who collect payment information (e.g., bank account, credit or debit card information, billing address) to process your payment in order to fulfill your orders and provide you with products or services you have requested, in order to perform our contract with you.
*   When you visit our Site, open or click on emails we send you, or interact with our Services or advertisements, we, or third parties we work with, may automatically collect certain information using online tracking technologies such as pixels, web beacons, software developer kits, third-party libraries, and cookies.

Any information we obtain from third parties will be treated in accordance with this Privacy Policy. We are not responsible or liable for the accuracy of the information provided to us by third parties and are not responsible for any third party''s policies or practices. For more information, see the section below, Third Party Websites and Links.

### How We Use Your Personal Information

Providing Products and Services. We use your personal information to provide you with the Services in order to perform our contract with you, including to process your payments, fulfill your orders, to send notifications to you related to your account, purchases, returns, exchanges or other transactions, to create, maintain and otherwise manage your account, to arrange for shipping, facilitate any returns and exchanges and to enable you to post reviews.

Marketing and Advertising. We use your personal information for marketing and promotional purposes, such as to send marketing, advertising and promotional communications by email, text message or postal mail, and to show you advertisements for products or services. This may include using your personal information to better tailor the Services and advertising on our Site and other websites.

Security and Fraud Prevention. We use your personal information to detect, investigate or take action regarding possible fraudulent, illegal or malicious activity. If you choose to use the Services and register an account, you are responsible for keeping your account credentials safe. We highly recommend that you do not share your username, password, or other access details with anyone else. If you believe your account has been compromised, please contact us immediately.

Communicating with you. We use your personal information to provide you with customer support and improve our Services. This is in our legitimate interests in order to be responsive to you, to provide effective services to you, and to maintain our business relationship with you.

### Cookies

Like many websites, we use Cookies on our Site. We use Cookies to power and improve our Site and our Services (including to remember your actions and preferences), to run analytics and better understand user interaction with the Services (in our legitimate interests to administer, improve and optimize the Services). We may also permit third parties and services providers to use Cookies on our Site to better tailor the services, products and advertising on our Site and other websites.

Most browsers automatically accept Cookies by default, but you can choose to set your browser to remove or reject Cookies through your browser controls. Please keep in mind that removing or blocking Cookies can negatively impact your user experience and may cause some of the Services, including certain features and general functionality, to work incorrectly or no longer be available. Additionally, blocking Cookies may not completely prevent how we share information with third parties such as our advertising partners.

### How We Disclose Personal Information

In certain circumstances, we may disclose your personal information to third parties for legitimate purposes subject to this Privacy Policy. Such circumstances may include:

*   With vendors or other third parties who perform services on our behalf (e.g., IT management, payment processing, data analytics, customer support, cloud storage, fulfillment and shipping).
*   With business and marketing partners, to provide services and advertise to you. Our business and marketing partners will use your information in accordance with their own privacy notices.
*   When you direct, request us or otherwise consent to our disclosure of certain information to third parties, such as to ship you products or through your use of social media widgets or login integrations, with your consent.
*   With our affiliates or otherwise within our corporate group, in our legitimate interests to run a successful business.
*   In connection with a business transaction such as a merger or bankruptcy, to comply with any applicable legal obligations (including to respond to subpoenas, search warrants and similar requests), to enforce any applicable terms of service, and to protect or defend the Services, our rights, and the rights of our users or others.

We have, in the past 12 months disclosed the following categories of personal information and sensitive personal information (denoted by *) about users for the purposes set out above in "How we Collect and Use your Personal Information" and "How we Disclose Personal Information":

#### Category:

*   Identifiers such as basic contact details and certain order and account information
*   Commercial information such as order information, shopping information and customer support information
*   Internet or other similar network activity, such as Usage Data

#### Categories of Recipients:

*   Vendors and third parties who perform services on our behalf (such as Internet service providers, payment processors, fulfillment partners, customer support partners and data analytics providers)
*   Business and marketing partners
*   Affiliates

We do not use or disclose sensitive personal information for the purposes of inferring characteristics about you.

### User Generated Content

The Services may enable you to post product reviews and other user-generated content. If you choose to submit user generated content to any public area of the Services, this content will be public and accessible by anyone.

We do not control who will have access to the information that you choose to make available to others, and cannot ensure that parties who have access to such information will respect your privacy or keep it secure. We are not responsible for the privacy or security of any information that you make publicly available, or for the accuracy, use or misuse of any information that you disclose or receive from third parties.

### Third Party Websites and Links

Our Site may provide links to websites or other online platforms operated by third parties. If you follow links to sites not affiliated or controlled by us, you should review their privacy and security policies and other terms and conditions. We do not guarantee and are not responsible for the privacy or security of such sites, including the accuracy, completeness, or reliability of information found on these sites. Information you provide on public or semi-public venues, including information you share on third-party social networking platforms may also be viewable by other users of the Services and/or users of those third-party platforms without limitation as to its use by us or by a third party. Our inclusion of such links does not, by itself, imply any endorsement of the content on such platforms or of their owners or operators, except as disclosed on the Services.

### Children''s Data

The Services are not intended to be used by children, and we do not knowingly collect any personal information about children. If you are the parent or guardian of a child who has provided us with their personal information, you may contact us using the contact details set out below to request that it be deleted.

As of the Effective Date of this Privacy Policy, we do not have actual knowledge that we "share" or "sell" (as those terms are defined in applicable law) personal information of individuals under 16 years of age.

### Security and Retention of Your Information

Please be aware that no security measures are perfect or impenetrable, and we cannot guarantee "perfect security." In addition, any information you send to us may not be secure while in transit. We recommend that you do not use unsecure channels to communicate sensitive or confidential information to us.

How long we retain your personal information depends on different factors, such as whether we need the information to maintain your account, to provide the Services, comply with legal obligations, resolve disputes or enforce other applicable contracts and policies.

### Your Rights and Choices

Depending on where you live, you may have some or all of the rights listed below in relation to your personal information. However, these rights are not absolute, may apply only in certain circumstances and, in certain cases, we may decline your request as permitted by law.

*   Right to Access / Know. You may have a right to request access to personal information that we hold about you, including details relating to the ways in which we use and share your information.
*   Right to Delete. You may have a right to request that we delete personal information we maintain about you.
*   Right to Correct. You may have a right to request that we correct inaccurate personal information we maintain about you.
*   Right of Portability. You may have a right to receive a copy of the personal information we hold about you and to request that we transfer it to a third party, in certain circumstances and with certain exceptions.
{'' ''}

You may exercise any of these rights where indicated on our Site or by contacting us using the contact details provided below.

We will not discriminate against you for exercising any of these rights. We may need to collect information from you to verify your identity, such as your email address or account information, before providing a substantive response to the request. In accordance with applicable laws, You may designate an authorized agent to make requests on your behalf to exercise your rights. Before accepting such a request from an agent, we will require that the agent provide proof you have authorized them to act on your behalf, and we may need you to verify your identity directly with us. We will respond to your request in a timely manner as required under applicable law.

### Complaints

If you have complaints about how we process your personal information, please contact us using the contact details provided below. If you are not satisfied with our response to your complaint, depending on where you live you may have the right to appeal our decision by contacting us using the contact details set out below, or lodge your complaint with your local data protection authority.

### International Users

Please note that we may transfer, store and process your personal information outside the country you live in, including the United States. Your personal information is also processed by staff and third party service providers and partners in these countries. If we transfer your personal information out of Europe, we will rely on recognized transfer mechanisms like the European Commission''s Standard Contractual Clauses, or any equivalent contracts issued by the relevant competent authority of the UK, as relevant, unless the data transfer is to a country that has been determined to provide an adequate level of protection.

### Contact

Should you have any questions about our privacy practices or this Privacy Policy, or if you would like to exercise any of the rights available to you, please email us at{'' ''} [contact@northcarolinalegalservices.org](mailto:contact@northcarolinalegalservices.org) .',
  '[{"type":"page_hero","title":"Privacy Policy","description":"We are committed to protecting your privacy. This privacy statement explains what information we collect from you when you visit our website and how we use that information. We collect personal information that you voluntarily provide to us when you fill out forms on our website or contact us by email. We also collect non-personal information, such as the type of browser you are using and the pages you visit on our website. We use the information we collect to improve the content of our website, respond to inquiries, and provide legal services to clients. We do not share your personal information with third parties unless required by law or as necessary to provide legal services to clients. We may use non-personal information to analyze website traffic and usage patterns. Any discounts offered by our law firm are conditional upon income and may not be available to everyone. By using our website, you consent to the collection and use of information as outlined in this privacy statement.","variant":"privacy","background":"primary-100"},{"type":"legal_meta","updated_at":null}]', NULL, NULL,
  'Privacy Policy | North Carolina Legal Services', 'Welcome to our website. By accessing and using this website, you agree to comply with and be bound by the following terms and conditions of use: The content of this website is for informational purposes only and is subject to change without notice.', NULL, NULL,
  'published', 0, 'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'page_ncls_terms', 'org-ncls-blawby', 'site-ncls-blawby',
  '/policies/terms', 'Terms of Use', 'policies-terms',
  'terms', 'Welcome to our website. By accessing and using this website, you agree to comply with and be bound by the following terms and conditions of use: The content of this website is for informational purposes only and is subject to change without notice.', '### Overview

This website is operated by North Carolina Legal Services. Throughout the site, the terms "we", "us" and "our" refer to North Carolina Legal Services. North Carolina Legal Services offers this website, including all information, tools and Services available from this site to you, the user, conditioned upon your acceptance of all terms, conditions, policies and notices stated here.

By visiting our site and/ or purchasing something from us, you engage in our "Service" and agree to be bound by the following terms and conditions ("Terms of Service", "Terms"), including those additional terms and conditions and policies referenced herein and/or available by hyperlink. These Terms of Service apply to all users of the site, including without limitation users who are browsers, vendors, customers, merchants, and/ or contributors of content.

Please read these Terms of Service carefully before accessing or using our website. By accessing or using any part of the site, you agree to be bound by these Terms of Service. If you do not agree to all the terms and conditions of this agreement, then you may not access the website or use any Services. If these Terms of Service are considered an offer, acceptance is expressly limited to these Terms of Service.

Any new features or tools which are added to the current store shall also be subject to the Terms of Service. You can review the most current version of the Terms of Service at any time on this page. We reserve the right to update, change or replace any part of these Terms of Service by posting updates and/or changes to our website. It is your responsibility to check this page periodically for changes. Your continued use of or access to the website following the posting of any changes constitutes acceptance of those changes.

Our store is hosted on Vercel They provide us with the online e-commerce platform that allows us to sell our products and Services to you.

### SECTION 1 - ONLINE STORE TERMS

By agreeing to these Terms of Service, you represent that you are at least the age of majority in your state or province of residence, or that you are the age of majority in your state or province of residence and you have given us your consent to allow any of your minor dependents to use this site.

You may not use our products for any illegal or unauthorized purpose nor may you, in the use of the Service, violate any laws in your jurisdiction (including but not limited to copyright laws).

You must not transmit any worms or viruses or any code of a destructive nature.

A breach or violation of any of the Terms will result in an immediate termination of your Services.

### SECTION 2 - GENERAL CONDITIONS

We reserve the right to refuse service to anyone for any reason at any time.

You understand that your content (not including credit card information), may be transferred unencrypted and involve (a) transmissions over various networks; and (b) changes to conform and adapt to technical requirements of connecting networks or devices. Credit card information is always encrypted during transfer over networks.

You agree not to reproduce, duplicate, copy, sell, resell or exploit any portion of the Service, use of the Service, or access to the Service or any contact on the website through which the service is provided, without express written permission by us.

The headings used in this agreement are included for convenience only and will not limit or otherwise affect these Terms.

### SECTION 3 - ACCURACY, COMPLETENESS AND TIMELINESS OF INFORMATION

We are not responsible if information made available on this site is not accurate, complete or current. The material on this site is provided for general information only and should not be relied upon or used as the sole basis for making decisions without consulting primary, more accurate, more complete or more timely sources of information. Any reliance on the material on this site is at your own risk.

This site may contain certain historical information. Historical information, necessarily, is not current and is provided for your reference only. We reserve the right to modify the contents of this site at any time, but we have no obligation to update any information on our site. You agree that it is your responsibility to monitor changes to our site.

### SECTION 4 - MODIFICATIONS TO THE SERVICE AND PRICES

Prices for our products are subject to change without notice.

We reserve the right at any time to modify or discontinue the Service (or any part or content thereof) without notice at any time.

We shall not be liable to you or to any third-party for any modification, price change, suspension or discontinuance of the Service.

### SECTION 5 - PRODUCTS OR SERVICES (if applicable)

Certain products or Services may be available exclusively online through the website. These products or Services may have limited quantities and are subject to return or exchange only according to our Return Policy.

We have made every effort to display as accurately as possible the colors and images of our products that appear at the store. We cannot guarantee that your computer monitor`''`s display of any color will be accurate.

We reserve the right, but are not obligated, to limit the sales of our products or Services to any person, geographic region or jurisdiction. We may exercise this right on a case-by-case basis. We reserve the right to limit the quantities of any products or Services that we offer. All descriptions of products or product pricing are subject to change at anytime without notice, at the sole discretion of us. We reserve the right to discontinue any product at any time. Any offer for any product or service made on this site is void where prohibited.

We do not warrant that the quality of any products, Services, information, or other material purchased or obtained by you will meet your expectations, or that any errors in the Service will be corrected.

### SECTION 6 - ACCURACY OF BILLING AND ACCOUNT INFORMATION

We reserve the right to refuse any order you place with us. We may, in our sole discretion, limit or cancel quantities purchased per person, per household or per order. These restrictions may include orders placed by or under the same customer account, the same credit card, and/or orders that use the same billing and/or shipping address. In the event that we make a change to or cancel an order, we may attempt to notify you by contacting the e-mail and/or billing address/phone number provided at the time the order was made. We reserve the right to limit or prohibit orders that, in our sole judgment, appear to be placed by dealers, resellers or distributors.

You agree to provide current, complete and accurate purchase and account information for all purchases made at our store. You agree to promptly update your account and other information, including your email address and credit card numbers and expiration dates, so that we can complete your transactions and contact you as needed.

For more detail, please review our Returns Policy.

### SECTION 7 - OPTIONAL TOOLS

We may provide you with access to third-party tools over which we neither monitor nor have any control nor input.

You acknowledge and agree that we provide access to such tools "as is" and "as available" without any warranties, representations or conditions of any kind and without any endorsement. We shall have no liability whatsoever arising from or relating to your use of optional third-party tools.

Any use by you of the optional tools offered through the site is entirely at your own risk and discretion and you should ensure that you are familiar with and approve of the terms on which tools are provided by the relevant third-party provider(s).

We may also, in the future, offer new Services and/or features through the website (including, the release of new tools and resources). Such new features and/or Services shall also be subject to these Terms of Service.

### SECTION 8 - THIRD-PARTY LINKS

Certain content, products and Services available via our Service may include materials from third-parties.

Third-party links on this site may direct you to third-party websites that are not affiliated with us. We are not responsible for examining or evaluating the content or accuracy and we do not warrant and will not have any liability or responsibility for any third-party materials or websites, or for any other materials, products, or Services of third-parties.

We are not liable for any harm or damages related to the purchase or use of goods, Services, resources, content, or any other transactions made in connection with any third-party websites. Please review carefully the third-party`''`s policies and practices and make sure you understand them before you engage in any transaction. Complaints, claims, concerns, or questions regarding third-party products should be directed to the third-party.

### SECTION 9 - USER COMMENTS, FEEDBACK AND OTHER SUBMISSIONS

If, at our request, you send certain specific submissions (for example contest entries) or without a request from us you send creative ideas, suggestions, proposals, plans, or other materials, whether online, by email, by postal mail, or otherwise (collectively, `''`comments`''`), you agree that we may, at any time, without restriction, edit, copy, publish, distribute, translate and otherwise use in any medium any comments that you forward to us. We are and shall be under no obligation (1) to maintain any comments in confidence; (2) to pay compensation for any comments; or (3) to respond to any comments.

We may, but have no obligation to, monitor, edit or remove content that we determine in our sole discretion to be unlawful, offensive, threatening, libelous, defamatory, pornographic, obscene or otherwise objectionable or violates any party''s intellectual property or these Terms of Service.

You agree that your comments will not violate any right of any third-party, including copyright, trademark, privacy, personality or other personal or proprietary right. You further agree that your comments will not contain libelous or otherwise unlawful, abusive or obscene material, or contain any computer virus or other malware that could in any way affect the operation of the Service or any related website. You may not use a false e-mail address, pretend to be someone other than yourself, or otherwise mislead us or third-parties as to the origin of any comments. You are solely responsible for any comments you make and their accuracy. We take no responsibility and assume no liability for any comments posted by you or any third-party.

### SECTION 10 - PERSONAL INFORMATION

Your submission of personal information through the store is governed by our Privacy Policy. To view our Privacy Policy, please see{'' ''} [https://northcarolinalegalservices.org/policies/privacy](https://northcarolinalegalservices.org/policies/privacy) .

### SECTION 11 - ERRORS, INACCURACIES AND OMISSIONS

Occasionally there may be information on our site or in the Service that contains typographical errors, inaccuracies or omissions that may relate to product descriptions, pricing, promotions, offers, product shipping charges, transit times and availability. We reserve the right to correct any errors, inaccuracies or omissions, and to change or update information or cancel orders if any information in the Service or on any related website is inaccurate at any time without prior notice (including after you have submitted your order).

We undertake no obligation to update, amend or clarify information in the Service or on any related website, including without limitation, pricing information, except as required by law. No specified update or refresh date applied in the Service or on any related website, should be taken to indicate that all information in the Service or on any related website has been modified or updated.

### SECTION 12 - PROHIBITED USES

In addition to other prohibitions as set forth in the Terms of Service, you are prohibited from using the site or its content:

*   (a) for any unlawful purpose;
*   (b) to solicit others to perform or participate in any unlawful acts;
*   (c) to violate any international, federal, provincial or state regulations, rules, laws, or local ordinances;
*   (d) to infringe upon or violate our intellectual property rights or the intellectual property rights of others;
*   (e) to harass, abuse, insult, harm, defame, slander, disparage, intimidate, or discriminate based on gender, sexual orientation, religion, ethnicity, race, age, national origin, or disability;
*   (f) to submit false or misleading information;
*   (g) to upload or transmit viruses or any other type of malicious code that will or may be used in any way that will affect the functionality or operation of the Service or of any related website, other websites, or the Internet;
*   (h) to collect or track the personal information of others;
*   (i) to spam, phish, pharm, pretext, spider, crawl, or scrape;
*   (j) for any obscene or immoral purpose;
*   (k) to interfere with or circumvent the security features of the Service or any related website, other websites, or the Internet.

We reserve the right to terminate your use of the Service or any related website for violating any of the prohibited uses.

### SECTION 13 - DISCLAIMER OF WARRANTIES; LIMITATION OF LIABILITY

We do not guarantee, represent or warrant that your use of our service will be uninterrupted, timely, secure or error-free.

We do not warrant that the results that may be obtained from the use of the service will be accurate or reliable.

You agree that from time to time we may remove the service for indefinite periods of time or cancel the service at any time, without notice to you.

You expressly agree that your use of, or inability to use, the service is at your sole risk. The service and all products and Services delivered to you through the service are (except as expressly stated by us) provided `''`as is`''` and `''`as available`''` for your use, without any representation, warranties or conditions of any kind, either express or implied, including all implied warranties or conditions of merchantability, merchantable quality, fitness for a particular purpose, durability, title, and non-infringement.

In no case shall North Carolina Legal Services, our directors, officers, employees, affiliates, agents, contractors, interns, suppliers, service providers or licensors be liable for any injury, loss, claim, or any direct, indirect, incidental, punitive, special, or consequential damages of any kind, including, without limitation lost profits, lost revenue, lost savings, loss of data, replacement costs, or any similar damages, whether based in contract, tort (including negligence), strict liability or otherwise, arising from your use of any of the service or any products procured using the service, or for any other claim related in any way to your use of the service or any product, including, but not limited to, any errors or omissions in any content, or any loss or damage of any kind incurred as a result of the use of the service or any content (or product) posted, transmitted, or otherwise made available via the service, even if advised of their possibility. Because some states or jurisdictions do not allow the exclusion or the limitation of liability for consequential or incidental damages, in such states or jurisdictions, our liability shall be limited to the maximum extent permitted by law.

### SECTION 14 - INDEMNIFICATION

You agree to indemnify, defend and hold harmless North Carolina Legal Services and our parent, subsidiaries, affiliates, partners, officers, directors, agents, contractors, licensors, service providers, subcontractors, suppliers, interns and employees, harmless from any claim or demand, including reasonable attorneys'' fees, made by any third-party due to or arising out of your breach of these Terms of Service or the documents they incorporate by reference, or your violation of any law or the rights of a third-party.

### SECTION 15 - SEVERABILITY

In the event that any provision of these Terms of Service is determined to be unlawful, void or unenforceable, such provision shall nonetheless be enforceable to the fullest extent permitted by applicable law, and the unenforceable portion shall be deemed to be severed from these Terms of Service, such determination shall not affect the validity and enforceability of any other remaining provisions.

### SECTION 16 - TERMINATION

The obligations and liabilities of the parties incurred prior to the termination date shall survive the termination of this agreement for all purposes.

These Terms of Service are effective unless and until terminated by either you or us. You may terminate these Terms of Service at any time by notifying us that you no longer wish to use our Services, or when you cease using our site. If in our sole judgment you fail, or we suspect that you have failed, to comply with any term or provision of these Terms of Service, we also may terminate this agreement at any time without notice and you will remain liable for all amounts due up to and including the date of termination; and/or accordingly may deny you access to our Services (or any part thereof).

### SECTION 17 - ENTIRE AGREEMENT

The failure of us to exercise or enforce any right or provision of these Terms of Service shall not constitute a waiver of such right or provision.

These Terms of Service and any policies or operating rules posted by us on this site or in respect to The Service constitutes the entire agreement and understanding between you and us and govern your use of the Service, superseding any prior or contemporaneous agreements, communications and proposals, whether oral or written, between you and us (including, but not limited to, any prior versions of the Terms of Service). Any ambiguities in the interpretation of these Terms of Service shall not be construed against the drafting party.

### SECTION 18 - GOVERNING LAW

These Terms of Service and any separate agreements whereby we provide you Services shall be governed by and construed in accordance with the laws of the United States.

### SECTION 19 - CHANGES TO TERMS OF SERVICE

You can review the most current version of the Terms of Service at any time at this page.

We reserve the right, at our sole discretion, to update, change or replace any part of these Terms of Service by posting updates and changes to our website. It is your responsibility to check our website periodically for changes. Your continued use of or access to our website or the Service following the posting of any changes to these Terms of Service constitutes acceptance of those changes.

### SECTION 20 - CONTACT INFORMATION

Questions about the Terms of Service should be sent to us at{'' ''} [contact@northcarolinalegalservices.org](mailto:contact@northcarolinalegalservices.org) .

Our contact information is posted below:

[contact@northcarolinalegalservices.org](mailto:contact@northcarolinalegalservices.org)',
  '[{"type":"page_hero","title":"Terms of Use","description":"Welcome to our website. By accessing and using this website, you agree to comply with and be bound by the following terms and conditions of use: The content of this website is for informational purposes only and is subject to change without notice. This website uses cookies to monitor browsing preferences, but we do not collect any personally identifiable information without your consent. We do not guarantee the accuracy, timeliness, or completeness of the information and materials provided on this website, and we are not liable for any errors or inaccuracies. Your use of this website is at your own risk, and we are not responsible for any damages resulting from your use of this website. All materials on this website are owned by or licensed to us and may not be reproduced without our prior written consent. Unauthorized use of this website may give rise to a claim for damages and/or be a criminal offense. This website may contain links to other websites that we do not endorse or control, and we are not responsible for the content of those websites. Any disputes arising from your use of this website are subject to the laws of North Carolina and the United States of America.","variant":"terms","background":"primary-100"}]', NULL, NULL,
  'Terms of Service | North Carolina Legal Services', 'Welcome to our website. By accessing and using this website, you agree to comply with and be bound by the following terms and conditions of use: The content of this website is for informational purposes only and is subject to change without notice.', NULL, NULL,
  'published', 0, 'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'page_ncls_third-party', 'org-ncls-blawby', 'site-ncls-blawby',
  '/third-party-notices', 'Third-Party Notices', 'third-party-notices',
  'third-party', 'The following sets forth attribution notices for third party legal services that may be contacted if outside North Carolina Legal Services service area.', '### [Inner Banks Legal Services](https://ibxlegal.org)

Email: [info@ibxlegal.org](mailto:info@ibxlegal.org)

Phone: [(252) 495-0585](tel:+12524950585)

Services:

*   Business
*   Domestic Violence
*   Estates
*   Family
*   Finance
*   Guardianship

### [Legal Aid of North Carolina](https://www.legalaidnc.org/)

Phone: [1-866-219-5262](tel:+18662195262)

Address: 224 South Dawson Street, Raleigh, NC 27601

Services include but are not limited to:
*   Medicaid Appeals and Disputes
*   Eviction Assistance
*   Consumer Protection
*   Domestic Violence/Sexual Assault
*   Special Education
*   Employment
*   Senior
*   Public Benefits
*   Veterans',
  '[{"type":"page_hero","title":"Third-Party Notices","description":"The following sets forth attribution notices for third party legal services that may be contacted if outside North Carolina Legal Services service area.","variant":"third-party","background":"primary-100"},{"type":"consultation_cta","title":"Get started today","accent":"today","description":"Trust our friendly team for affordable, comprehensive legal services. Contact us today to resolve your legal issues and gain peace of mind.","label":"Request a Consultation","url":"/schedule","background":{"asset_id":"asset_ncls_media_background-cta_79bdbc52","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/735d1ec58bf43ca897ce.webp","role":"consultation_cta_background","source_name":"background-cta.webp"},"featured":{"asset_id":"asset_ncls_media_logo-2_e3a91ed9","url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/9cb15d96c31f5ba5fb2c.webp","role":"consultation_cta_featured","source_name":"logo-2.webp"}}]', NULL, NULL,
  'Third Party Notices | North Carolina Legal Services', 'The following sets forth attribution notices for third party legal services that may be contacted if outside North Carolina Legal Services service area.', NULL, NULL,
  'published', 0, 'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO tenant_compliance (
  id, organization_id, site_id, entity_name, dba_name, entity_type, nonprofit_status,
  registration_number, service_area, service_area_type, disclaimer, footer_disclaimer, document_asset_ids,
  founder_name, founding_date, same_as, contact_points, address_visibility,
  metadata_json, created_at, updated_at
) VALUES (
  'compliance_ncls', 'org-ncls-blawby', 'site-ncls-blawby',
  'North Carolina Legal Services', 'Bull City Legal Services', 'LegalService',
  'https://schema.org/Nonprofit501c3', NULL, 'North Carolina',
  'State', '*DISCLAIMER: The purpose of this website is informational - no
attorney-client relationship is created by using this website or
reading this blog. No legal advice is intended. If you have
questions about a current or potential legal problem, you should
always contact an attorney directly for specific advice. Results
described on this website are meant to describe the work and
experience of our Firm. The uncertainty & risk inherent in
litigation, as well as the specific individual details of each
case mean that results or a particular outcome are never
guaranteed. This website is provided "as is," without any warranty
of any kind, express or implied.', 'Access to Justice for All. We believe that access to the justice system is a fundamental right. At North Carolina Legal Services, we are committed to removing financial barriers that prevent many in our community from obtaining high-quality legal assistance.

North Carolina Legal Services is a registered [**DBA**](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/9f06152ccd5d6f29c11a.pdf) of Bull City Legal Services. See our [**IRS Determination Letter**](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/8de1e5793e0806ece163.pdf). All rights reserved.',
  '["asset_ncls_legal_northcarolinalegalservices-dba-redacted","asset_ncls_legal_finalletter-88-0565637-bullcitylegalservicesinc-redacted"]',
  'Rich Gittings', NULL,
  '["https://linkedin.com/company/north-carolina-legal-services","https://www.facebook.com/northcarolinalegalservices","https://www.instagram.com/northcarolinalegalservices"]', '[{"contact_type":"customer service","telephone":"(984) 777-8288","email":"contact@northcarolinalegalservices.org","area_served":"North Carolina"}]',
  'hidden',
  '{"founder":"Rich Gittings","foundingDate":{},"languages":["English"],"keywords":["North Carolina Legal Services","North Carolina Lawyer","North Carolina Law Firm","Family Law Attorney","Employment Law Consultation","Probate Services NC","Tenant Rights Lawyer","Small Business Legal Advice","Legal Counsel NC"],"logo_dark_url":"https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/3869491ea5373de6bb34.svg","header":{"banner_content":null,"banner_dismissible":false}}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO site_consultation_settings (
  id, organization_id, site_id, mode, cta_label, external_url, schedule_path,
  confirmation_path, tracking_enabled, metadata_json, created_at, updated_at
) VALUES (
  'consultation_ncls', 'org-ncls-blawby', 'site-ncls-blawby',
  'external_url', 'Schedule a consultation',
  'https://ncls.cliogrow.com/book', '/schedule',
  '/contact/confirmed',
  1,
  '{"header_cta_label":"Get Started","contact_form_enabled":false,"source":"react-next-marketing-site-template/northcarolinalegalservices","analyticsBridge":{"provider":"gtm","container_id":"GTM-MDHRQP5","allowed_events":["page_view","book_consultation_click","contact_submit","donation_click"],"allowed_properties":["event","page_type","page_path","cta_destination","tenant"],"custom_head_code_ignored":true},"legacy_source_calendly_url_ignored":"https://calendly.com/rgittings-bcls/consultation?embed_domain=www.northcarolinalegalservices.org&embed_type=Inline&hide_gdpr_banner=1&invitee_uuid=8a35897f-89c1-4ed7-b707-948a7c0e219d"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO site_theme_tokens (id, organization_id, site_id, template_slug, tokens_json, status, created_at, updated_at)
VALUES ('theme-ncls-blawby', 'org-ncls-blawby', 'site-ncls-blawby', 'blawby', '{"bg":"#fbfaf7","surface":"#ffffff","primary":"#25356c","primaryDark":"#161f3b","primary100":"#f2f5ff","primary200":"#b4c5e5","primary800":"#1d294f","accent":"#c19855","accent100":"#faf5ea","accent200":"#f8f0e1","accentButton":"#b58c4f","accentStrong":"#a37732","border":"#e5e7eb","ink":"#162033"}', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO tenant_navigation_items (
  id, organization_id, site_id, area, label, url, item_type, sort_order, status, metadata_json, created_at, updated_at
) VALUES
(
  'nav_ncls_header_0', 'org-ncls-blawby', 'site-ncls-blawby',
  'header', 'Services', '/services',
  'internal', 0,
  'active', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_header_1', 'org-ncls-blawby', 'site-ncls-blawby',
  'header', 'Pricing', '/pricing',
  'internal', 1,
  'active', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_header_2', 'org-ncls-blawby', 'site-ncls-blawby',
  'header', 'About', '/about',
  'internal', 2,
  'active', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_header_3', 'org-ncls-blawby', 'site-ncls-blawby',
  'header', 'Contact', '/contact',
  'internal', 3,
  'active', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_header_4', 'org-ncls-blawby', 'site-ncls-blawby',
  'header', 'Blog', '/blog',
  'internal', 4,
  'active', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_header_5', 'org-ncls-blawby', 'site-ncls-blawby',
  'header', 'Donate', '/donate',
  'internal', 5,
  'active', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_support_0', 'org-ncls-blawby', 'site-ncls-blawby',
  'footer', 'Request a Consultation', '/schedule',
  'internal', 1,
  'active', '{"group":"support"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_support_1', 'org-ncls-blawby', 'site-ncls-blawby',
  'footer', 'Preparing for your consultation', '/article/preparing-for-your-consultation-with-north-carolina-legal-services',
  'internal', 2,
  'active', '{"group":"support"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_support_2', 'org-ncls-blawby', 'site-ncls-blawby',
  'footer', 'Contact', '/contact',
  'internal', 2,
  'active', '{"group":"support"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_support_3', 'org-ncls-blawby', 'site-ncls-blawby',
  'footer', 'Pricing', '/pricing',
  'internal', 3,
  'active', '{"group":"support"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_company_4', 'org-ncls-blawby', 'site-ncls-blawby',
  'footer', 'About', '/about',
  'internal', 1,
  'active', '{"group":"company"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_company_5', 'org-ncls-blawby', 'site-ncls-blawby',
  'footer', 'Donate', '/donate',
  'internal', 2,
  'active', '{"group":"company"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_company_6', 'org-ncls-blawby', 'site-ncls-blawby',
  'footer', 'Blog', '/blog',
  'internal', 3,
  'active', '{"group":"company"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_legal_7', 'org-ncls-blawby', 'site-ncls-blawby',
  'legal', 'Privacy', '/policies/privacy',
  'internal', 1,
  'active', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_legal_8', 'org-ncls-blawby', 'site-ncls-blawby',
  'legal', 'Terms', '/policies/terms',
  'internal', 2,
  'active', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_legal_9', 'org-ncls-blawby', 'site-ncls-blawby',
  'legal', 'Third Party Notices', '/third-party-notices',
  'internal', 3,
  'active', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_social_0', 'org-ncls-blawby', 'site-ncls-blawby',
  'social', 'LinkedIn', 'https://linkedin.com/company/north-carolina-legal-services',
  'external', 0,
  'active', '{"platform":"LinkedIn"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_social_1', 'org-ncls-blawby', 'site-ncls-blawby',
  'social', 'Facebook', 'https://www.facebook.com/northcarolinalegalservices',
  'external', 1,
  'active', '{"platform":"Facebook"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_social_2', 'org-ncls-blawby', 'site-ncls-blawby',
  'social', 'Instagram', 'https://www.instagram.com/northcarolinalegalservices',
  'external', 2,
  'active', '{"platform":"Instagram"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO tenant_redirects (
  id, organization_id, site_id, from_path, to_path, status_code, behavior,
  reason, source, created_at, updated_at
) VALUES
(
  'redirect_ncls_article_divorce-and-children-in-north-carolina_0', 'org-ncls-blawby', 'site-ncls-blawby',
  '/article/divorce-and-children-in-north-carolina-what-to-expect-and-how-to-prepare', '/article/divorce-and-children-in-north-carolina', 301,
  'redirect', 'Pinned React article oldSlugs migration', 'react-adapter',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'redirect_ncls_article_preparing-for-your-consultation-with-north-carolina-legal-services_0', 'org-ncls-blawby', 'site-ncls-blawby',
  '/article/preparing-for-your-consultation', '/article/preparing-for-your-consultation-with-north-carolina-legal-services', 301,
  'redirect', 'Pinned React article oldSlugs migration', 'react-adapter',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'redirect_ncls_article_property-division-in-north-carolina-divorce-protecting-whats-yours_0', 'org-ncls-blawby', 'site-ncls-blawby',
  '/article/property-division-in-north-carolina-divorce', '/article/property-division-in-north-carolina-divorce-protecting-whats-yours', 301,
  'redirect', 'Pinned React article oldSlugs migration', 'react-adapter',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'redirect_ncls_article_writing-your-own-will-how-it-works_0', 'org-ncls-blawby', 'site-ncls-blawby',
  '/article/writing-your-own-will-how-it-works-in-north-carolina', '/article/writing-your-own-will-how-it-works', 301,
  'redirect', 'Pinned React article oldSlugs migration', 'react-adapter',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'redirect_ncls_conference_gone', 'org-ncls-blawby', 'site-ncls-blawby',
  '/conference', NULL, 410,
  'gone', 'Explicitly retire the indexed conference route', 'search-console-2026-07-13',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'redirect_ncls_service_personal_injury', 'org-ncls-blawby', 'site-ncls-blawby',
  '/services/personal-injury', '/services', 301,
  'redirect', 'Preserve the indexed source service URL after the offering was retired', 'search-console-2026-07-13',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'redirect_ncls_legal_file_1', 'org-ncls-blawby', 'site-ncls-blawby',
  '/files/NorthCarolinaLegalServices_DBA__Redacted.pdf', 'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/9f06152ccd5d6f29c11a.pdf', 301,
  'redirect', 'Preserve the indexed legal document URL on approved storage', 'search-console-2026-07-13',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'redirect_ncls_legal_file_2', 'org-ncls-blawby', 'site-ncls-blawby',
  '/files/FinalLetter_88-0565637_BULLCITYLEGALSERVICESINC_Redacted.pdf', 'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/8de1e5793e0806ece163.pdf', 301,
  'redirect', 'Preserve the indexed legal document URL on approved storage', 'search-console-2026-07-13',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO location_qa (
  id, organization_id, site_id, location_id, page_path, google_question_id, question,
  question_author, question_date, answer, answer_author, answer_date,
  is_owner_answer, upvote_count, source, status, sort_order, created_at, updated_at
) VALUES
(
  'qa_ncls_site_1', 'org-ncls-blawby', 'site-ncls-blawby', NULL, NULL, NULL,
  'Why should I hire an attorney?', NULL, NULL, 'At North Carolina Legal Services, we understand that hiring an attorney can be costly. That''s why we aim to provide affordable legal services when you need them. By hiring an attorney, you can have peace of mind and be in a better position to reach your goals.', 'North Carolina Legal Services', NULL,
  1, 0, 'import', 'published', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'qa_ncls_site_2', 'org-ncls-blawby', 'site-ncls-blawby', NULL, NULL, NULL,
  'How much do you charge?', NULL, NULL, 'North Carolina Legal Services is a non-profit law firm that focuses on providing affordable legal services to the the North Carolina Community. We base our prices on the income of our clients, offering discounted rates to qualifying individuals and small businesses.', 'North Carolina Legal Services', NULL,
  1, 0, 'import', 'published', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'qa_ncls_site_3', 'org-ncls-blawby', 'site-ncls-blawby', NULL, NULL, NULL,
  'How do individuals qualify for discounted legal services?', NULL, NULL, 'Discounts are based on current household income, as verified by a recent pay stub, W-2, 1099, previous year''s tax return, or other valid government documentation.', 'North Carolina Legal Services', NULL,
  1, 0, 'import', 'published', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'qa_ncls_site_4', 'org-ncls-blawby', 'site-ncls-blawby', NULL, NULL, NULL,
  'What types of legal issues can you help me with?', NULL, NULL, 'At North Carolina Legal Services we have attorneys who cover a variety of practice areas. If you have a civil legal issue, reach out and we will do everything that we can to help you resolve it quickly and affordably.', 'North Carolina Legal Services', NULL,
  1, 0, 'import', 'published', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'qa_ncls_site_5', 'org-ncls-blawby', 'site-ncls-blawby', NULL, NULL, NULL,
  'Do you charge a consultation fee?', NULL, NULL, 'Yes, our consultation fee is $80 for a half-hour or $160 for a full hour.', 'North Carolina Legal Services', NULL,
  1, 0, 'import', 'published', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'qa_ncls_site_6', 'org-ncls-blawby', 'site-ncls-blawby', NULL, NULL, NULL,
  'How often will I be updated on the status of my case?', NULL, NULL, 'We believe that communication is key to maintaining peace of mind during complicated and difficult legal proceedings. Because of this, we will update you every time there is a substantive change in the status of your proceeding. If there have been no changes, we will inform you as to that every two weeks.', 'North Carolina Legal Services', NULL,
  1, 0, 'import', 'published', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'qa_ncls_site_7', 'org-ncls-blawby', 'site-ncls-blawby', NULL, NULL, NULL,
  'How do businesses qualify for discounted legal services?', NULL, NULL, 'North Carolina Legal Services uses the Small Business Administration''s definition of ''Small Businesses,'' which is determined by industry, annual revenue, or number of employees. Non-profit organizations are always offered discounted rates.', 'North Carolina Legal Services', NULL,
  1, 0, 'import', 'published', 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'qa_ncls_site_8', 'org-ncls-blawby', 'site-ncls-blawby', NULL, NULL, NULL,
  'If I hire an attorney, can I still settle without going to court?', NULL, NULL, 'We often encourage out of court settlement, and will seek to settle if we can achieve a beneficial outcome to you by doing so. It saves time and money, reduces the risk of an unfavorable outcome, and allows parties to tailor the terms of the agreement to meet their specific needs and interests. Settling out of court is often the best option for all parties involved.', 'North Carolina Legal Services', NULL,
  1, 0, 'import', 'published', 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'qa_ncls_site_9', 'org-ncls-blawby', 'site-ncls-blawby', NULL, NULL, NULL,
  'I am concerned that getting an attorney might make things worse. Is that true?', NULL, NULL, 'Bringing in an attorney often calms things down. Attorneys bring professionalism, expertise, and a neutral perspective to situations. We facilitate effective communication in situations that are emotionally charged, help with negotiations, and guide parties to find common ground. We also make sure you understand your rights and potential choices — our goal is resolution without conflict. Most importantly, we ensure all legal procedures are followed properly, preventing any mistakes or delays in your case and maximizing your chance of success.', 'North Carolina Legal Services', NULL,
  1, 0, 'import', 'published', 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'qa_ncls_site_10', 'org-ncls-blawby', 'site-ncls-blawby', NULL, '/schedule', NULL,
  'How long is the consultation?', NULL, NULL, 'Consultations are typically scheduled for 30 minutes. In some matters, part of that time may include reviewing the information and documents you provide in advance.', 'North Carolina Legal Services', NULL,
  1, 0, 'import', 'published', 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'qa_ncls_site_11', 'org-ncls-blawby', 'site-ncls-blawby', NULL, '/schedule', NULL,
  'What kinds of issues can we discuss?', NULL, NULL, 'Consultations are available for a range of North Carolina legal matters, including family law, tenant rights, employment law, special education, probate and estate matters, and some small business concerns.', 'North Carolina Legal Services', NULL,
  1, 0, 'import', 'published', 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'qa_ncls_site_12', 'org-ncls-blawby', 'site-ncls-blawby', NULL, '/schedule', NULL,
  'Is my request confirmed immediately?', NULL, NULL, 'No. Submitting a request does not automatically confirm an appointment. Each request is reviewed before scheduling is confirmed, and you will be contacted with next steps if the matter is one we are able to handle.', 'North Carolina Legal Services', NULL,
  1, 0, 'import', 'published', 11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'qa_ncls_site_13', 'org-ncls-blawby', 'site-ncls-blawby', NULL, '/schedule', NULL,
  'What should I have ready before I schedule?', NULL, NULL, 'Please have the most relevant information about your matter available. That may include court papers, notices, leases, contracts, school records, business records, emails, text messages, pay records, or other documents tied to the issue.

It is also helpful to prepare:

* a short timeline of what happened
* any deadlines, hearings, meetings, or response dates
* the names of the people or organizations involved
* the outcome you are hoping to achieve
* the main questions you want answered

Time spent reviewing documents is part of the consultation time, so it is best to send only the materials most relevant to the issue.', 'North Carolina Legal Services', NULL,
  1, 0, 'import', 'published', 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'qa_ncls_site_14', 'org-ncls-blawby', 'site-ncls-blawby', NULL, '/schedule', NULL,
  'Do you offer online consultations?', NULL, NULL, 'Yes. Depending on the nature of the matter, consultations may be handled remotely. Scheduling details are provided after a request is reviewed.', 'North Carolina Legal Services', NULL,
  1, 0, 'import', 'published', 13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO reviews (
  id, organization_id, site_id, location_id, customer_id, booking_id, booking_type,
  review_request_id, user_id, menu_item_slug, author_name, reviewer_photo_url, rating,
  title, content, google_review_id, owner_reply, owner_reply_at, photo_urls, helpful_count,
  status, source, entered_by_user_id, collection_method, original_review_date,
  original_reference, publication_authorized, ip_hash, user_agent, created_at, updated_at
) VALUES
(
  'review_ncls_owner_1', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  NULL, NULL, NULL, NULL, NULL, NULL,
  'Jonathan Matthews', 'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/15bba3d4f3f3fcb40dac.webp', 5,
  'Financial Advisor at Merrill Lynch', 'A former attorney left me in a very difficult position with my custody dispute, and North Carolina Legal Services where able to step in, and salvage the situation. Not only did they salvage the situation, but they helped my obtain an outcome that was to my benefit.', NULL, NULL, NULL, NULL, 0,
  'approved', 'owner_entered', 'user-ncls-blawby',
  'migration', NULL,
  'Pinned React tenant testimonial import', 1, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'review_ncls_owner_2', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  NULL, NULL, NULL, NULL, NULL, NULL,
  'Morgan Brock-Smith', 'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/238e8a7cc3be720f5725.webp', 5,
  'JD at United States District Court', 'Rich Gittings, the owner of the firm, is a brilliant, creative, and caring lawyer who genuinely cares about providing the best services to his clients. I would highly recommend hiring North Carolina Legal Services for any of your legal needs.', NULL, NULL, NULL, NULL, 0,
  'approved', 'owner_entered', 'user-ncls-blawby',
  'migration', NULL,
  'Pinned React tenant testimonial import', 1, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'review_ncls_owner_3', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  NULL, NULL, NULL, NULL, NULL, NULL,
  'Kyle Beausoleil', 'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/70782b21e0a213f15dbd.webp', 5,
  'Financial Analyst of Duke University', 'Rich is not only a knowledgeable and outstanding lawyer, he is genuinely an amazing person. The very structure of his business was born out of the want to help people and he truly succeeds at his mission. As someone who not only uses North Carolina Legal''s services but also someone who shares a passion to use their skills to help others and better the community they live in, I can attest not only to his legal acumen, but his character as a person, both of which are top tier.', NULL, NULL, NULL, NULL, 0,
  'approved', 'owner_entered', 'user-ncls-blawby',
  'migration', NULL,
  'Pinned React tenant testimonial import', 1, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'review_ncls_owner_4', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  NULL, NULL, NULL, NULL, NULL, NULL,
  'Marcus Morrow', 'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/f169dd677c4e18d8c61c.webp', 5,
  'Co-Owner at Chibangas Neighborhood Market', 'My business partner and I used North Carolina Legal Services to help stand up our business. We loved using them, they gave excellent referrals, walked us through everything we needed to be protected and followed up with us afterwards! I highly recommend reaching out to them for their services!', NULL, NULL, NULL, NULL, 0,
  'approved', 'owner_entered', 'user-ncls-blawby',
  'migration', NULL,
  'Pinned React tenant testimonial import', 1, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'review_ncls_owner_5', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  NULL, NULL, NULL, NULL, NULL, NULL,
  'Kristen Rissell', 'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/903ee6ad336ed296ad1b.webp', 5,
  'Clincal Social Worker of Duke University', 'I utilized NCLS for assistance with my employers contractual matters. Mr. Gittings demonstrated profound expertise and was consistently supportive. His communication was punctual and dependable throughout the entire process. I am genuinely grateful for the presence of such a reputable and cost-effective legal service in North Carolina.', NULL, NULL, NULL, NULL, 0,
  'approved', 'owner_entered', 'user-ncls-blawby',
  'migration', NULL,
  'Pinned React tenant testimonial import', 1, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'review_ncls_owner_6', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  NULL, NULL, NULL, NULL, NULL, NULL,
  'Amy Hahn', 'https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e59d9ce19451c918fd59.webp', 5,
  'Director at Velocity Industries', 'The attorney with whom I spoke demonstrated patience as well as being well-versed in that specialty of the law. I was able to ask and get an answer for each of my questions. . . [W]ow. I did not feel rushed. The attorney provided me with the knowledge and confidence to be successful at court. Words can not adequately express my gratitude. I regret not having previously found North Carolina Legal Services.', NULL, NULL, NULL, NULL, 0,
  'approved', 'owner_entered', 'user-ncls-blawby',
  'migration', NULL,
  'Pinned React tenant testimonial import', 1, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO blog_posts (
  id, organization_id, site_id, title, slug, body, excerpt, category, tags_json, status,
  author_id, featured_image_asset_id, published_at, created_at, updated_at,
  seo_description, seo_keywords, canonical_url, robots
) VALUES
(
  'blog_ncls_getting-a-divorce-in-north-carolina', 'org-ncls-blawby', 'site-ncls-blawby',
  'Getting a Divorce in North Carolina', 'getting-a-divorce-in-north-carolina', '## Divorce Requirements and First Steps

The legal term for a divorce in North Carolina is “absolute divorce.” Spouses can only be eligible to file for divorce if they have been separated for [at least one year](https://ncleg.gov/EnactedLegislation/Statutes/PDF/BySection/Chapter_50/GS_50-6.pdf). Separated, in this context, means that each spouse must have lived apart from the other and that one or both spouses meant for the separation to be permanent. It is not enough for the spouses to remain in the same residence with one staying “downstairs” and one staying “upstairs” or something similar. You each must be in a separate residence for the entire year. You or your spouse must also have lived in North Carolina for at least six months prior to filing for divorce.

Unlike many other states that allow spouses to file a divorce based on fault grounds, North Carolina only allows no-fault divorces. Specifically, the eligibility for divorce is based on [one year](https://ncleg.gov/EnactedLegislation/Statutes/PDF/BySection/Chapter_50/GS_50-5.1.pdf) of separation or incurable insanity.

## Filing for a Divorce in North Carolina

There are numerous documents and processes required to initiate a divorce. The first step is to draft and file a complaint. Divorce complaints list the details of your case and state that you are requesting an absolute divorce. It should also include whether you are requesting equitable distribution, post-separation support, alimony, or spousal support. The EARLIEST date either spouse may file for absolute divorce is one year plus one day. There is no standardized form used for complaints; they must be drafted from scratch.

Other important elements of an initial filing are the civil summons, which will be served on your spouse, and a Domestic Civil Action Cover Sheet. There is also a federal law that requires you to submit a declaration along with your complaint. This declaration discloses your spouse’s military enlistment or active-duty status.

Courts charge a filing fee for divorce complaints, and there may be an additional fee to have your spouse served with the divorce papers. At this time, the filing fee is $225, and the cost for the sheriff to serve the other spouse WITHIN the State of North Carolina is $30. The cost is different if you need to serve your spouse by sheriff outside of North Carolina.

## Spousal Support and North Carolina Divorces

Spousal support, also called post-separation support and alimony, is financial support paid to a dependent spouse during the separation period or following a divorce. If one spouse made considerably less money than the other or made no income and were financially dependent on their husband or wife, they will likely be considered a dependent spouse for the purposes of alimony.

There is no strict guideline or statutory formula for calculating spousal support. Instead, a judge will consider the specific details of each party’s finances, non-financial contributions, behavior during the marriage, and numerous other factors to determine alimony payments. Other factors a judge will likely consider include:

- The length of the marriage
- The age and health of both spouses
- The needs of each spouse
- The earning capacity of each spouse
- Property and assets owned by each spouse

Marital misconduct can affect alimony. If the supporting spouse engaged in infidelity, drug or alcohol abuse, cruelty, or other misconduct, this will be factored into the judge’s decision. Dependent spouses who cheated during the marriage may lose their right to receive spousal support.

Post-separation support and alimony claims must be requested and properly filed before the divorce is finalized. Failing to do so will mean that you forever lose the right to request spousal support from the court.

Alimony can last for a year, a decade, or a lifetime. Essentially, there are no statutory time periods for spousal support. A judge can award support to a dependent spouse that ends after they have time to get on their feet financially or require the supporting spouse to make alimony payments until one of the following occurs:

- Death of either spouse
- Remarriage or cohabitation of the dependent spouse
- A substantial change in circumstances

[![Schedule a Consultation with North Carolina Legal Services](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e47c24ad39e5089d7d79.webp ''Schedule a Consultation with North Carolina Legal Services'')](/schedule)

## Equitable Distribution

Equitable distribution must be requested and properly filed before the divorce is finalized. Failing to do so will mean that you forever lose the right to have your property divided by the court. For a step-by-step guide to categorizing and valuing marital assets, see our article on [property division in North Carolina divorce](/article/property-division-in-north-carolina-divorce-protecting-whats-yours).

Marital property in North Carolina is eligible for equitable distribution, while separate property is not. Classifying assets and debts into these categories is often complex, but the general rule is that separate property is anything owned prior to marriage, and marital property is acquired during the marriage with funds earned during the marriage by either spouse. There are numerous exceptions to this rule. A third category called divisible property may also be important if you or your spouse acquired relevant property after separating but before finalizing the divorce.

The default in North Carolina is to divide property 50/50, but judges can decide that deviation from an even split is equitable for spouses. When evaluating property and equitable distribution, the court will consider, among other things, the following:

- Income and earning capacity of each spouse
- Property and debt of both spouses
- Tax implications
- The length of the marriage

## Divorce with Children

The court will also consider any custody, visitation, and child support matters during your divorce.

### Child Custody and Visitation

There are two types of custody – physical and legal. Legal custody refers to whether one or both parents have the right to make important decisions in their child’s life, such as education and healthcare. Physical custody refers to having the child physically in your care and is often what is meant when discussing which parent the child lives with primarily. Legal and physical custody can be granted solely to one parent or be shared between both.

Numerous factors go into deciding custody and visitation arrangements, but the primary consideration is the child''s best interest. You or your spouse can file for custody during the separation or have it be decided as part of the divorce. For a complete guide to custody arrangements, child support, and helping your children through the process, see our article on [divorce in NC with children](/article/divorce-and-children-in-north-carolina).

### Child Support

Parents are responsible for financially supporting their children, and child support may be ordered even in joint custody arrangements. North Carolina uses the North Carolina Child Support Guidelines to calculate the amount of support one parent will pay to the other, and those guidelines include factors like the gross income of both parents, custody arrangements, cost of work-related childcare, health insurance for the children, and other support obligations.

## Separation Agreements

Separation agreements are not required to be considered legally separated in North Carolina. However, they are useful for establishing terms for your separation and addressing potentially contentious issues that may arise later on. These written agreements are contracts between spouses and can include topics like spousal support, child custody, possession of the marital home, and division of bank accounts. If desired, the separation agreement can be made a part of the final divorce order. This is referred to as “incorporating the separation agreement into the divorce.”

## FAQs About North Carolina Divorce

- **Do both spouses have to want a divorce?**<br>
  No, North Carolina does not require that both spouses agree to the divorce. You can file for divorce if you meet the previously discussed requirements without permission or agreement from your husband or wife. You are required to serve notice to your spouse of the divorce, but they do not need to consent.

- **My spouse and I slept together after separation. Does that mean the one-year separation period restarts?**<br>
  Not necessarily. North Carolina law states that [“isolated incidents of sexual intercourse between parties”](https://ncleg.gov/EnactedLegislation/Statutes/PDF/BySection/Chapter_50/GS_50-6.pdf) do not pause or restart the separation period required for divorce. However, if the totality of the circumstances suggests that a resumption of marital relations has occurred, the separation may be considered to have ended. This would involve a renewal of the spousal relationship, not just isolated incidents of physical intimacy. If renewal of the spousal relationship happens, the one-year period must be restarted from the beginning.

- **Can I file for an expedited divorce if I can prove my spouse cheated?**<br>
  Infidelity does not affect the divorce timeline because North Carolina only allows for no-fault divorces. The requirement for these no-fault divorces is one year of separation. This isn’t to say that the behavior of a husband or wife has no effect on a North Carolina divorce, but it does not speed up the process.

- **What is a divorce from bed and board?**<br>
  A Divorce from Bed and Board is not actually considered a true divorce in North Carolina. It is more closely related to separation and is only available in limited situations. If your spouse committed marital misconduct, you might be able to receive a Divorce from Bed and Board. To be eligible for an absolute divorce, you will still need to stay separated for at least one year.

- **Can I change my last name as part of my divorce?**<br>
  Yes, you can make a request in your divorce complaint to resume the use of your maiden name. Your divorce judgment will include an order that allows you to change your name as part of the divorce.

- **My spouse and I have a high combined income. How will child support be calculated?**<br>
  In cases where the combined income of both spouses exceeds $40,000 per month, the Child Support Guidelines are not used. Instead, the court will consider the reasonable needs of the child in regard to things like education, standard of living, and health. The Guidelines may be used to determine a minimum in these cases, but they will not be the only tool a judge uses to set support.

**North Carolina Family Law Attorney**

Navigating this process without assistance from an experienced family law attorney can seem impossible. If you still have questions about your North Carolina divorce or separation, contact [North Carolina Legal Services](https://www.northcarolinalegalservices.org/services/family).',
  'Going through a divorce is one of the most emotionally taxing and stressful situations that many people will go through in their lives. Part of the difficulty in facing the divorce process lies in the uncertainty of what’s to come and confusion about what is required. This guide to North Carolina divorce is intended to be a helpful resource for answers to many of the most common questions people have about divorce and separation while also clarifying some of the legal requirements in the state.', 'Legal Services', '["Legal Services","Family","North Carolina"]', 'published',
  'user-ncls-blawby', 'asset_ncls_media_getting-a-divorce-in-north-carolina_ffbfbfd0',
  '2023-09-26T00:00:00.000Z',
  '2023-09-26T00:00:00.000Z', '2023-09-27T00:00:00.000Z', 'Going through a divorce is one of the most emotionally taxing and stressful situations that many people will go through in their lives. Part of the difficulty in facing the divorce process lies in the uncertainty of what’s to come and confusion about what is required. This guide to North Carolina divorce is intended to be a helpful resource for answers to many of the most common questions people have about divorce and separation while also clarifying some of the legal requirements in the state.', 'North Carolina Divorce Process, Divorce Procedure in NC, How to File for Divorce in NC, NC Divorce Laws, Divorce Paperwork North Carolina, Divorce Legal Advice NC, NC Divorce Requirements, Separation in North Carolina, Family Law Attorney NC, Divorce Settlements in North Carolina, Child Custody in NC Divorce, NC Alimony Rules, Understanding Divorce in NC, North Carolina Divorce FAQ, DIY Divorce North Carolina, Equitable Distribution NC, North Carolina Legal Services',
  '/article/getting-a-divorce-in-north-carolina', NULL
),
(
  'blog_ncls_equitable-distribution-in-north-carolina-divorces', 'org-ncls-blawby', 'site-ncls-blawby',
  'Equitable Distribution in North Carolina Divorces', 'equitable-distribution-in-north-carolina-divorces', '## What is Equitable Distribution Law in North Carolina?

The purpose of equitable distribution is to decide how to divide a divorcing couple’s property and debts in a just and fair way. It isn’t an automatic process; one or both spouses must request it during the separation period. Additionally, in North Carolina, equitable distribution must be requested prior to the finalization of the divorce. You may lose your ability to have court involvement for property division if you do not have a pending claim for equitable distribution at the time the divorce is granted.

North Carolina General Statute § 50-20 outlines the distribution of marital and divisible property, including the definitions of marital, separate, and divisible property. These terms will be important during the equitable distribution process and hearing because not all property can be divided.

## Assets and Debts in a North Carolina Divorce

Assets and debts are divided into one of three categories: marital property, separate property, or divisible property. [Marital property](https://www.ncleg.net/EnactedLegislation/Statutes/HTML/BySection/Chapter_50/GS_50-20.html) is any real or personal property bought or acquired by either or both spouses during the marriage and before separation using funds earned during the marriage. Marital assets and debts can be divided prior to divorce or after the divorce is final SO LONG AS there is a properly-filed pending claim for equitable distribution. The default in North Carolina is to assume that any asset or debt acquired during this timeframe is marital property unless it meets the criteria for separate property.

[Separate property](https://www.ncleg.net/EnactedLegislation/Statutes/HTML/BySection/Chapter_50/GS_50-20.html) can be acquired prior to the marriage or during the marriage if by inheritance or gift. It is important to note that gifts from one spouse to the other only count as separate property if there was a clear intention for the property to be separate. Otherwise, the gift from one spouse to another is considered marital property. Other classification requirements for separate property:

- Assets acquired in exchange for separate property will remain separate so long as the initial separate property is traceable. For instance, an inheritance deposited into the joint bank account with no way to separate the inheritance portion from the marital portion will become marital property. One spouse using an inheritance to buy a piece of specific property such as an automobile continues to own the new property as separate property. Beware that an inheritance paid toward a marital residence owned by both parties is considered a gift to the marriage unless there is a specific directive otherwise at the time the inheritance is paid toward the marital residence.

- Income derived from separate property is also considered separate property unless the spouse owning the separate property is using his marital time and efforts to acquire the income. Any passive income derived from separate property remains separate property unless an action is taken which purposely or inadvertently changes it to marital property.

- Professional and business licenses that terminate on transfer are separate property

Separate property is not eligible for division in North Carolina equitable distribution because it is considered to belong to only one spouse, however, the court can distribute the separate property directly to the spouse owning the separate property. The spouses may, and often do, disagree with how property is classified and whether it should be subject to equitable distribution.

Lastly, divisible property may be subject to equitable distribution. This type of property consists of increases or decreases in the value of assets and debts which are marital property. Passive changes in value, i.e., the value of the marital residence or other marital property increases or decreases in value due simply to the fluctuation in the market, are considered to be marital so that each party is entitled to receive the value of one-half of such increase or decrease. t If the increase or decrease was directly caused by a spouse’s efforts, i.e., one spouse used his separate funds and efforts to remodel the marital home or the spouse’s actions which decrease the value by not caring for the property, such change in value belongs solely to the spouse using his efforts or neglect. Some types of passive income and passive changes to marital debt could also qualify as divisible property.

## Marital Property Division in North Carolina

North Carolina law states that marital property and the net value of divisible property shall be equally divided unless that solution is not equitable. For a practical step-by-step guide to identifying, valuing, and protecting your marital assets, see our article on [property division in North Carolina divorce](/article/property-division-in-north-carolina-divorce-protecting-whats-yours). Equitable distribution does not mean a 50/50 split will go to each spouse. Either spouse is entitled to request more than 50 percent of the marital estate but, oftentimes, the spouses’ reasons are not sufficient to cause the court to distribute the property other than 50/50. When deciding on marital property division in North Carolina, a court will consider the following factors:

- Income, assets, and liabilities of each spouse

- The duration of the marriage

- The age and health of both spouses

- Pension and retirement accounts

This list does not include each factor listed in North Carolina General Statute § 50-20. The judge will consider a wide range of issues before deciding on how to divide assets and debts between the parties.

[![Schedule a Consultation with North Carolina Legal Services](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e47c24ad39e5089d7d79.webp ''Schedule a Consultation with North Carolina Legal Services'')](/schedule)

## North Carolina Equitable Distribution Process

Remember that at least one spouse must request equitable distribution in a properly-filed claim prior to a final divorce. Beware that an equitable distribution claim pending by one spouse at the time of divorce may be dismissed by this spouse after the divorce is final. If this happens and the other spouse does not also have a properly filed claim pending for equitable distribution, this spouse will have lost the right to equitable distribution. It is not enough for only one spouse to have a properly-filed claim for equitable distribution prior to the divorce becoming final if the one spouse dismisses it after the divorce.
To initiate this process, a complaint must be drafted and filed with the court. This legal document should include the request for equitable distribution, as well as various other details, including both spouses’ names , designation of plaintiff and defendant, the date of marriage, and the date of separation. You or your attorney must sign this document before submitting it to the court but not as a verification which is sworn to in front of a notary.

Once that complaint is filed, the spouse that initiated the claim has 90 days to prepare an [equitable distribution inventory affidavit](https://www.ncleg.net/EnactedLegislation/Statutes/HTML/BySection/Chapter_50/GS_50-21.html) and serve the other party, although these deadlines vary from county to county. Thirty days later, the other spouse who was served must also complete an affidavit outlining the inventory of property for equitable distribution. It can be challenging to create an accurate inventory of years or decades of accumulated property, so courts are lenient with the contents of the initially-filed affidavit as long as a good faith effort was made to complete it. These affidavits can be amended.

Alternately, divorces that involve simple or few assets and debts may be better served using an [equitable distribution worksheet](https://www.nccourts.gov/assets/documents/local-rules-forms/881.pdf?IlZ9dvu5RI1DMX7CPAoMY6l_yQ4ohIvS) instead of an affidavit.

## Equitable Distribution Lawyer in North Carolina

Marital property division in North Carolina is a complex process that can be difficult to navigate, especially when emotions are running high. If you have questions about the North Carolina divorce property settlement process or how a court may handle your assets and debts in a North Carolina divorce, contact our [family law attorneys](/services/family) for guidance on your North Carolina divorce property division.',
  'Dividing property is one of the most significant issues a divorcing couple will need to deal with. When separated spouses cannot agree on how to divide their assets and debts in a divorce, they can request the court’s assistance through a process known as equitable distribution.', 'Legal Services', '["Legal Services","Family","North Carolina"]', 'published',
  'user-ncls-blawby', 'asset_ncls_media_equitable-distribution-in-north-carolina-divorces_99c1fb55',
  '2023-11-27T00:00:00.000Z',
  '2023-11-27T00:00:00.000Z', '2023-11-27T00:00:00.000Z', 'Dividing property is one of the most significant issues a divorcing couple will need to deal with. When separated spouses cannot agree on how to divide their assets and debts in a divorce, they can request the court’s assistance through a process known as equitable distribution.', 'North Carolina Divorce Process, Divorce Procedure in NC, How to File for Divorce in NC, NC Divorce Laws, Divorce Paperwork North Carolina, Divorce Legal Advice NC, NC Divorce Requirements, Separation in North Carolina, Family Law Attorney NC, Divorce Settlements in North Carolina, Child Custody in NC Divorce, NC Alimony Rules, Understanding Divorce in NC, North Carolina Divorce FAQ, DIY Divorce North Carolina, Equitable Distribution NC, North Carolina Legal Services',
  '/article/equitable-distribution-in-north-carolina-divorces', NULL
),
(
  'blog_ncls_7-common-iep-violations-every-north-carolina-parent-should-recognize-and-how-to-fight-back', 'org-ncls-blawby', 'site-ncls-blawby',
  '7 Common IEP Violations Every North Carolina Parent Should Recognize (And How to Fight Back)', '7-common-iep-violations-every-north-carolina-parent-should-recognize-and-how-to-fight-back', 'In North Carolina, your child has a constitutional right to a free and appropriate education, and if they have special needs, **their Individualized Education Program (IEP) sets the standards** for what their school must do to provide that education. A child’s IEP acts as **a legally binding contract** between the parents of a child with a disability and that child’s school district, protecting your child''s right to **appropriate educational services**. Unfortunately, schools don''t always follow these requirements, forcing families to navigate a complex enforcement system. These violations are important to address, as they can impact their child''s educational progress. While this guide is not a substitute for professional assistance by an attorney or qualified parent advocate, it may help you determine whether you need to seek professional assistance to advocate for your child.

We know that teachers and other people working within our education system mean well, and that most of the time, most people want to do what is right. Many IEP-related failures are the result of teachers and administrators dealing with budget cuts, staff shortages, and other **systemic failures**—unfortunately that means that parents need to be extra diligent to make sure their children''s IEP is being followed by their school. **We are here to help.**

Below are some of the most **common IEP violations** that we see come to our office, so if you feel like your special needs child isn’t making the progress that they should at school. We are publishing this to help you recognize when your child''s rights aren’t being honored and empower you to take appropriate action. You don''t have to do this alone, reach out to Disability Rights North Carolina and North Carolina Legal Services if you would like to seek professional assistance today.

## **1\. Excessive Delays in Evaluations**

**An IEP evaluation is triggered when a student is suspected of having a disability that may be affecting their education.** Parents, teachers, or other school personnel can make this referral at any time if they believe the child may need special education services. Once that written referral is made, federal law requires schools to **complete initial evaluations within 60 calendar days** of when you provide written consent to the evaluation. North Carolina law adds another layer of protection, requiring schools to **complete the evaluation, determine eligibility, and develop an IEP within 90 calendar days** of a written referral. Too often, schools fail to meet these deadlines.

At North Carolina Legal Services, we often see delays at this stage that slow down access to needed services. These delays aren''t just bureaucratic inconveniences—they represent violations of your child''s civil rights and can significantly impact their educational development.

**What you can do: Document the dates** when you submitted your consent or referral request. If deadlines pass without communication, send an email requesting an immediate update and completion timeline. **Create a timeline of events** related to your child''s IEP, including when you sent that email, and **save copies** of all communications and documents related to the request. If the delays continue you can file a complaint with the North Carolina Department of Public Instruction if delays continue, but we strongly recommend [meeting with an attorney](/article/preparing-for-your-consultation) before you do so.

![Image](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/4400f49221ae732604ed.webp)

## **2\. Failure to Implement Required Services**

**Your child''s IEP isn''t a suggestion**—their school must follow it, exactly as written. When schools fail to provide required services like speech therapy, occupational therapy, or specialized instruction, **they''re violating your child’s right to a free and appropriate education under federal law and North Carolina''s constitution.**

Common implementation failures include skipping therapy sessions, reducing service frequency without IEP team approval, or providing services that don''t meet IEP standards.

**What you can do:** Track your child''s services weekly using a simple calendar or log. When services are missed, document the date, service type, and reason given (if any). **Send written notice to the school** immediately and request compensatory education to make up for missed services. Schools are required to provide makeup services when they fail to implement the IEP as written.

[![Schedule a Consultation with North Carolina Legal Services](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e47c24ad39e5089d7d79.webp ''Schedule a Consultation with North Carolina Legal Services'')](/schedule)

## **3\. Using Unqualified Personnel**

Federal law requires schools to use appropriately **trained and qualified personnel** to deliver specialized services. When schools assign unqualified staff to provide speech therapy, behavioral support, or other specialized services, they''re not meeting the standards that they agreed to in the IEP, violating your child''s right to appropriate education. Services given by anyone other than a qualified professional do not count as a service under the IEP.

Across North Carolina, staffing shortages sometimes lead schools to substitute trained specialists with general education staff or paraprofessionals who lack necessary credentials and training.

**What you can do:** Ask about the qualifications of anyone providing specialized services to your child. Request written documentation of their credentials, training, and state licensing. If unqualified personnel are providing services, remind school officials in an email that only appropriately credentialed professionals can provide your child with IEP-related services, and request that the school provides makeup services from qualified providers for any services already provided inappropriately.

![Image](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/bf31809ddf6bbbcaf8dd.webp)

## **4\. Excluding Parents from Decision-Making**

Parents are equal members of the IEP team, with the right to meaningful participation in all decisions affecting their child''s education. Schools violate this right when they make decisions before meetings, exclude parents from discussions, or fail to provide adequate interpretation services for non-English speaking families. At North Carolina Legal Services, we often hear from parents who felt decisions were made in advance or who needed interpretation services that were not provided.

Predetermination: when schools decide on services or placement before the IEP meeting: is a serious violation that undermines the collaborative process required by law.

**What you can do:** If you feel excluded from decisions, immediately request another IEP meeting. Bring an advocate or support person if needed. If language barriers exist, request an interpreter in advance. Document any instances where you feel decisions were made without your input and consider filing a procedural complaint if the school continues to exclude you from the process.

![Image](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/5ea1b2ee81b8475abdd2.webp)

## **5\. Wrongful Denial of Eligibility**

Schools sometimes deny special education eligibility based on narrow interpretations of academic performance, overlooking students who struggle with behavioral, social, or emotional functioning. At North Carolina Legal Services, we often see students with solid grades but significant social or emotional needs denied eligibility. High-achieving students with disabilities like autism, ADHD, or anxiety disorders are frequently denied services because they maintain passing grades.

Educational performance encompasses more than just academics: it includes how a child functions socially, behaviorally, and emotionally in the school environment.

**What you can do:** If your child has a diagnosis and continues to struggle despite accommodations, request a detailed written explanation of the eligibility decision. You have the right to an Independent Educational Evaluation (IEE) at public expense if you disagree with the school''s evaluation. The school must either agree to fund the IEE or file for a due process hearing to defend their evaluation—they cannot simply refuse your request. Consider [consulting with a special education advocate or attorney](/article/preparing-for-your-consultation) to review the eligibility determination if you believe it was inappropriate.

![Image](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/f26a1f0b2536d75b50be.webp)

## **6\. Poorly Written or Inadequate IEPs**

Effective IEPs must contain specific, measurable goals that address your child''s unique needs. Vague goals like "will improve reading skills" or "will behave appropriately" don''t provide clear targets for progress monitoring or accountability. Families across North Carolina tell us that vague goals make it hard to measure progress and hold the team accountable.

Every IEP must include your child''s present levels of performance, specific measurable goals, detailed service descriptions with frequency and duration, and appropriate accommodations and modifications.

**What you can do:** Review your child''s IEP carefully for vague language and unmeasurable goals. Request specific data on how goals will be measured and when progress will be reviewed. If goals are too general or don''t address your child''s needs, request an IEP meeting to revise them. Don''t sign an IEP that doesn''t adequately address your child''s needs: you have the right to disagree with proposed services.

![Image](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e8224978251e8c48e0d7.webp)

## **7\. Inappropriate Disciplinary Actions**

Students with disabilities have additional protections when facing school discipline. When schools suspend or recommend expulsion for students with IEPs, a Manifestation Determination Review must be held within 10 school days of the decision to change placement, and must determine whether the behavior was related to the child''s disability. At North Carolina Legal Services, we often see confusion around these requirements, which can lead to missed reviews and improper removals.

Schools violate these protections when they fail to conduct required reviews, ignore the connection between disability and behavior, or impose punishments that deny access to educational services.

**What you can do:** If your child faces disciplinary action, immediately remind the school of their obligation to conduct a Manifestation Determination Review. Request that any behavioral issues be addressed through the IEP process rather than punitive measures. Document all disciplinary incidents and ensure your child continues receiving educational services during any suspension period.

## **Taking Action When Violations Occur**

When you identify IEP violations, start with clear documentation. Keep detailed records of missed services, inappropriate responses, and all communications with school personnel. Send written notices about problems and request written responses within five business days.

Follow your district''s chain of command systematically: begin with your child''s teacher, then move to the principal, special education director, director of pupil services, and finally the superintendent if necessary. Maintain professional communication at each level while clearly stating your concerns and requested resolutions.

If school-level advocacy doesn''t resolve violations, you have several options:

- File a complaint with the North Carolina Department of Public Instruction
- Request mediation through the state
- Initiate due process proceedings
- [Consult with a special education attorney](/article/preparing-for-your-consultation) for serious violations

For more detailed guidance on what to do when your child''s school fails to follow their IEP, see our guide on [when schools fail to follow the IEP](/article/when-schools-fail-to-follow-the-iep-what-north-carolina-parents-can-do).

Remember that these procedural safeguards exist specifically to protect your child''s educational rights. Taking action when violations occur not only helps your child but also ensures schools meet their obligations to all students with disabilities.

## **Moving Forward**

Recognizing IEP violations requires vigilance, but addressing them effectively requires knowledge, documentation, and persistence. You are your child''s best advocate, and understanding these common violations empowers you to ensure they receive the appropriate education they deserve.

When working with schools, maintain professionalism while standing firm on your child''s rights. Most violations can be resolved through clear communication and collaborative problem-solving, but don''t hesitate to seek additional support when needed.

For more detailed information about your rights in the IEP process, you can review our comprehensive guides on [IEP violations in North Carolina](/article/iep-violations-in-north-carolina-how-to-recognize-them-and-protect-your-childs-rights) and [what to do when schools fail to follow IEPs](/article/when-schools-fail-to-follow-the-iep-what-north-carolina-parents-can-do). If you need additional support navigating complex IEP issues, North Carolina Legal Services provides guidance and representation for families facing educational rights violations. If you are a teacher, advocate, or nonprofit staff member, please consider sharing this guide with families you support across North Carolina.

_This information is provided for educational purposes and does not constitute legal advice. Individual situations vary, and families facing complex IEP violations should consult with qualified legal professionals familiar with special education law._',
  'Learn about the 7 most common IEP violations in North Carolina schools—from delayed evaluations to unqualified personnel. Discover how to recognize violations and take action to protect your child''s educational rights.', 'Legal Services', '["Legal Services","North Carolina","Family","Special Education"]', 'published',
  'user-ncls-blawby', 'asset_ncls_media_7-common-iep-violations-every-north-carolina-parent-should-recognize-and-how-to-fight-back-1_2d84c78e',
  '2025-11-17T00:00:00.000Z',
  '2025-11-17T00:00:00.000Z', '2025-11-17T00:00:00.000Z', 'Learn about the 7 most common IEP violations in North Carolina schools—from delayed evaluations to unqualified personnel. Discover how to recognize violations and take action to protect your child''s educational rights.', 'IEP violations North Carolina, Common IEP violations, Special education rights NC, IEP evaluation delays, IEP implementation failures, Unqualified IEP personnel, Parent rights in IEP process, IEP eligibility denial, Manifestation Determination Review, Compensatory education, Special education advocacy, North Carolina Legal Services, IEP compliance, Special education law NC, Disability rights in schools, IEP meeting rights, Free Appropriate Public Education, Special education complaints NC, Due process hearing NC, Independent Educational Evaluation',
  '/article/7-common-iep-violations-every-north-carolina-parent-should-recognize-and-how-to-fight-back', NULL
),
(
  'blog_ncls_disaster-relief-for-north-carolina-homeowners-after-hurricane-helene', 'org-ncls-blawby', 'site-ncls-blawby',
  'Disaster Relief For North Carolina Homeowners After Hurricane Helene', 'disaster-relief-for-north-carolina-homeowners-after-hurricane-helene', 'We will guide you on how to document damage, file insurance claims, and apply for FEMA aid. You''ll also find information on resources for utility support, mortgage relief, and more. No single guide can provide you with all of the information that you will need, but it is our goal to help you get started down the road to recovery.

## What To Do If Your Home Suffers Damage

If your home or personal belongings were damaged by Hurricane Helene, taking quick action can significantly impact your recovery process and potential insurance claims. Here''s what you should do:

1. **Photograph All Damages**: Before cleaning up, document every damaged area and item with clear photos from multiple angles. These images are essential for validating insurance claims and demonstrating the full extent of the loss.

2. **Create a Detailed Inventory**: Make a list of damaged or missing items, including descriptions, estimated values, purchase dates, and any other relevant details. A thorough inventory supports accurate reimbursement and smooths the claims process.

3. **Gather Receipts**: Collect receipts and any relevant documents that show proof of purchase for damaged items. Also, keep receipts for any temporary repairs to demonstrate to insurance providers that you acted to prevent further damage.

4. **Start Cleanup Safely**: Begin the cleanup process to prevent additional damage but prioritize safety. Only enter structurally safe areas, wear protective gear, and avoid any compromised areas until professionals assess them.

Taking these steps will not only aid in the recovery process but also facilitate a smoother interaction with your insurance providers and any available assistance programs.

### Resources

- [Crisis Cleanup (1-844-965-1386)](https://www.crisiscleanup.org/): Severe home damage cleanup assistance.

[![Schedule a Consultation with North Carolina Legal Services](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e47c24ad39e5089d7d79.webp ''Schedule a Consultation with North Carolina Legal Services'')](/schedule)

## Filing Insurance For Damaged Property

If your home was damaged, filing an insurance claim should be your first step. Many homeowners insurance policies do not cover flood damage, so check to make sure your policy does, or if you have separate coverage. Insurance through the National Flood Insurance Program (NFIP), usually covers flood-related damage. [If you don''t have flood insurance, you may need to rely on FEMA assistance for flood-related expenses, which will be covered in the next section.](#fema-and-emergency-assistance)

Many homeowners face delays or denials when filing claims, often due to confusion over what''s covered. What is covered under flood and wind damage protection can be especially confusing. Understanding your policy and keeping detailed documentation are essential steps to help secure fair compensation.

### Tips for Filing a Claim

- **Document Damage for Claims**: Use the photos, item lists, and receipts gathered in your initial assessment to support your claim, and keep records of all interactions with your insurance company, including phone conversations.
- **Know Your Policy Coverage**: Review your homeowners insurance and any flood policy you may have to identify what''s covered. Temporary housing costs, for example, may be covered in cases where homes are uninhabitable, depending on your policy.
- **Appeals**: If your claim is denied, remember that you have the right to appeal. NFIP appeals must typically be filed within 60 days, so respond quickly if your insurance provider does not cover a part of your claim.

### Resources

- [National Flood Insurance Program (NFIP)](https://www.floodsmart.gov) for flood insurance coverage
- **North Carolina Department of Insurance Consumer Helpline (1-855-408-1212)** provides assistance with insurance claims, such as homeowners insurance and disaster-related claims.
- [Consumer Financial Protection Bureau](https://www.consumerfinance.gov/): Understanding Your Homeowners Insurance
- [National Association of Insurance Commissioners](https://www.naic.org/): Tips for Filing an Insurance Claim

## FEMA and Emergency Assistance

If you don''t have flood insurance or need additional help, applying for FEMA assistance following Hurricane Helene is a critical step. FEMA offers grants for various recovery needs, including temporary housing, essential home repairs, and other disaster-related expenses.

After registering, individuals may qualify for financial support to address storm-related damage to their residence and belongings. FEMA can also assist with locating temporary accommodations. Be sure to apply within 60 days of the disaster declaration to maximize eligibility for assistance.

**Tip**: If your FEMA application is denied, don''t give up. Denials can be appealed within a specified period. Keep detailed records of all communications with FEMA. If you have questions or need support with your appeal, please contact us at [North Carolina Legal Services](https://www.northcarolinalegalservices.org/).

### Resources

- [FEMA: Disaster Assistance](https://www.disasterassistance.gov)
- [FEMAAppeals.org](https://www.advocatesfordisasterjustice.org/appeallettertofema/): Create and generate a printable/downloadable FEMA appeal letter

## Utility Support After Disaster

As homeowners begin the recovery process after Hurricane Helene, managing utility bills can pose a significant challenge. Fortunately, several programs are available to help alleviate energy costs:

### Resources

- [Crisis Intervention Program](<https://www.ncdhhs.gov/divisions/social-services/energy-assistance/low-income-energy-assistance/crisis-intervention-program#:~:text=The%20Crisis%20Intervention%20Program%20(CIP)%20is%20a%20Federally%20funded%20program,heating%20or%20cooling%20related%20crisis.>): This program provides emergency assistance for heating or cooling crises. It is available year-round for income-eligible households and can be accessed through your local Department of Social Services (DSS) office.
- [Duke Energy Progress Share the Light Fund](https://www.duke-energy.com/home/billing/special-assistance/share-the-light): Financial support for heating and cooling expenses to eligible Duke Energy customers. Contact Duke Energy directly for application details and eligibility requirements.
- [Disaster Unemployment Assistance](https://www.des.nc.gov/dua%C2%A0): This program provides temporary unemployment benefits to individuals whose employment was impacted by the disaster. Apply through the North Carolina Division of Employment Security.
- [Food and Nutrition Services Recipient Disaster Resources](https://www.ncdhhs.gov/divisions/child-and-family-well-being/food-and-nutrition-services-food-stamps/hurricane-helene-food-and-nutrition-services-fns-flexibilities): This program offers temporary food benefits for eligible recipients affected by Hurricane Helene, available through your local DSS office.

**Please note**: Beginning in December, assistance from the [Low Income Energy Assistance Program](https://www.ncdhhs.gov/divisions/social-services/energy-assistance/low-income-energy-assistance-lieap) may also become available. This program offers a one-time winter payment to help with heating costs, typically available from December to March for qualifying households. Applications can be submitted online or at local DSS offices.

## Mortgage Issues

If your home has been severely damaged and this impacts your ability to make mortgage payments, contact your mortgage servicer as soon as possible. Lenders often offer forbearance or other relief options to help customers manage payments during a recovery period.

**Tip**: In some cases it may be wise to consider forbearance options early to avoid falling behind on payments. Failing to make a payment can result in a negative report on your credit, and could ultimately result in foreclosure. Be sure to keep thorough records of all communications with your mortgage company, including emails and written documentation of agreements.

### Resources

- [U.S. Department of Housing and Urban Development](https://www.hud.gov/press/press_releases_media_advisories/HUD_No_24_256) for mortgage assistance programs.
  - **FHA Resource Center (1-800-304-9320)**: Disaster assistance programs for mortgage and foreclosure.
- **Homeowner''s HOPE Hotline (1-855-890-8073)**: Support for foreclosure prevention.

## Get The Assistance You Need with North Carolina Legal Services

If you''re uncertain whether you need legal help after a hurricane, consulting with an attorney can clarify your rights and ensure that you don''t miss any critical steps in the recovery process. At [North Carolina Legal Services](https://www.northcarolinalegalservices.org/), our experienced attorneys are here to support you with the complexities of hurricane damage claims, including mortgage relief, property repairs, insurance claims, and compensation for lost belongings. If you rent rather than own, see our companion guide on [hurricane disaster relief for North Carolina renters](/article/hurricane-disaster-relief-for-north-carolina-renters). Whether you''re facing substantial property damage or just need guidance on where to start, we''re ready to provide the advice and support to help you take the next steps toward recovery.

### General Resources

- [FEMA](https://www.disasterassistance.gov)
  - [Disaster Assistance](https://www.disasterassistance.gov)
  - **FEMA Helpline**: 1-800-621-3362
- **American Red Cross**
  - [Red Cross Shelters](https://www.redcross.org/get-help/disaster-relief-and-recovery-services/find-an-open-shelter.html): Currently Open
  - **Disaster Services Relief Hotline**: 1-800-RED-CROSS
  - **Safe and Well**: a web system that helps reunite displaced loved ones
    - [English](http://www.redcross.org/safeandwell)
    - [Spanish](https://www.safeandwelles.communityos.org/zf/safe/add)
- **National Disaster Legal Hotline**: 1-888-743-5749
- **Crisis Counseling Assistance Disaster Distress Helpline**: 1-800-985-5990
- [Next of Kin Registry](http://www.nokr.org): missing, injured or deceased family members your emergency contact to help if you or your family member is.
- [How To Replace Important Documents](https://www.usa.gov/replace-vital-documents): Replace important documents like birth certificates, driver''s license, passport, etc.
- [Food and Nutrition Services Recipient Disaster Resources](https://www.ncdhhs.gov/divisions/child-and-family-well-being/food-and-nutrition-services-food-stamps/hurricane-helene-food-and-nutrition-services-fns-flexibilities)
- [Disaster Unemployment Assistance](https://www.des.nc.gov/dua%C2%A0)',
  'The natural beauty and close-knit communities of Western North Carolina have been shaken by Hurricane Helene. Now, as recovery begins, many North Carolinians are challenged with the task of rebuilding homes, restoring finances, and navigating insurance claims. These range from major home damage to financial struggles and challenges with insurance. To many, the recovery process can feel overwhelming. This guide is designed to help you take the right steps early on, so that you can secure the support and resources you need to rebuild.', 'Legal Services', '["Legal Services","Disaster Relief","North Carolina"]', 'published',
  'user-ncls-blawby', 'asset_ncls_media_disaster-relief-for-north-carolina-homeowners-after-hurricane-helene_4bb0a9fb',
  '2024-11-11T00:00:00.000Z',
  '2024-11-11T00:00:00.000Z', '2024-11-11T00:00:00.000Z', 'The natural beauty and close-knit communities of Western North Carolina have been shaken by Hurricane Helene. Now, as recovery begins, many North Carolinians are challenged with the task of rebuilding homes, restoring finances, and navigating insurance claims. These range from major home damage to financial struggles and challenges with insurance. To many, the recovery process can feel overwhelming. This guide is designed to help you take the right steps early on, so that you can secure the support and resources you need to rebuild.', 'Hurricane damage recovery, Filing insurance claims, FEMA assistance, Disaster relief resources, Documenting property damage, Home repair assistance, Utility support programs, Mortgage relief options, Flood insurance coverage, Disaster recovery tips',
  '/article/disaster-relief-for-north-carolina-homeowners-after-hurricane-helene', NULL
),
(
  'blog_ncls_divorce-and-children-in-north-carolina', 'org-ncls-blawby', 'site-ncls-blawby',
  'Divorce in NC with Children: Custody, Support & What to Expect', 'divorce-and-children-in-north-carolina', '## North Carolina Divorce Process

North Carolina requires that spouses go through a one-year period of separation before getting officially divorced, and this requirement exists for all married couples without exception, other than a rare 3-year required separation for a person with certain mental conditions. Unlike many other states, North Carolina only allows [no-fault divorces](https://www.nccourts.gov/help-topics/divorce-and-marriage/separation-and-divorce) and does not grant fault-based divorces.

> What this means is that fault has no effect on filing for divorce in North Carolina. Certain aspects of a divorce, such as alimony and child custody, may be impacted by fault, but it does not change a person’s ability to file for divorce.

So, the first step in [getting a divorce in North Carolina](https://www.northcarolinalegalservices.org/article/getting-a-divorce-in-north-carolina) is being separated from your spouse for one year and one day. This is the very first day a party may file for divorce. Then you can file a divorce complaint, along with the following:

- A summons

- A Servicemembers Civil Relief Act Declaration

- A Domestic Civil Action Cover Sheet

If you want the court to decide how your assets and debts will be divided, you must request what is called [equitable distribution](https://www.northcarolinalegalservices.org/article/equitable-distribution-in-north-carolina-divorces). This request needs to be made before a final divorce judgment is entered. For a practical breakdown of how property is categorized and divided, see our guide to [property division in North Carolina divorce](/article/property-division-in-north-carolina-divorce-protecting-whats-yours). Similarly, if you want the court to decide spousal support and alimony, a request must be properly filed prior to the divorce becoming final.

Spouses with children may also need the court’s assistance with custody, visitation, and support, and those matters can be included in the divorce complaint or as separate filings.

## Child Custody in North Carolina

Parents are not required to have a court order to determine child custody in North Carolina; however, a custody order may be necessary if parents cannot agree on their child’s care. Without a court order or custody set forth in a separation agreement, both legal parents have the same rights as long as they are on the [child’s birth certificate](https://www.nccourts.gov/help-topics/family-and-children/child-custody). Even if separated or divorcing spouses can co-parent effectively without a court order, there may be instances when having one can save time and hassle, such as if schools or doctors’ offices require this documentation.

If a custody and visitation case does go to court, a judge will base the entire custody determination on the best interests of the child. [North Carolina law](https://www.ncleg.net/EnactedLegislation/Statutes/HTML/BySection/Chapter_50/GS_50-13.2.html) states that the court will consider any factor that is relevant to promote the welfare of the child.

Another aspect of North Carolina custody cases to consider is that [mediation is usually required](https://www.nccourts.gov/help-topics/family-and-children/custody-mediation) before a judge will consider a custody matter or enter an order although some counties will allow a hearing for temporary custody prior to the completion of mediation. Mediation is a process in which an objective third-party mediator guides the parents toward compromise and resolution; it is intended to help parents communicate and reach a custody agreement without going to court. The parties’ attorneys do not participate in the mediation process.

A judge may waive this requirement, meaning parents do not have to go through mediation before trial, but a motion requesting a waiver must be filed. This may be granted if you meet one of the reasons for exemption. It is a favorable option to participate in mediation in many cases because [mediation is meant to be an amicable process](https://www.ncleg.gov/EnactedLegislation/Statutes/PDF/BySection/Chapter_50/GS_50-13.1.pdf) that reduces stress surrounding child custody disputes.

[![Schedule a Consultation with North Carolina Legal Services](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e47c24ad39e5089d7d79.webp ''Schedule a Consultation with North Carolina Legal Services'')](/schedule)

## Calculating Child Support in North Carolina

The [North Carolina Child Support Guidelines](https://ncchildsupport.ncdhhs.gov/ecoa/cseGuideLines.htm) are used to calculate child support in most cases. The Guidelines use a set formula that calculates support based on various factors, including:

- Both parents’ income

- Childcare expenses

- Health insurance costs

- Custody and visitation arrangements

- Extraordinary expenses

> Either party may file a request that the court deviate upward or downward from the guideline amount of child support. A court [may not use the child support guidelines](https://www.nccourts.gov/assets/documents/forms/a162.pdf) if it finds using the guideline formula would be unjust or inappropriate.

Deviation upwards from the guidelines most often occurs when the calculated support amount will not meet the reasonable needs of the child or when the parent paying support has a very high income.

## Preparing Your Children for Your Divorce

The hardest part of this process may be preparing your children for your divorce. Children have a limited understanding of the complex nature of adult relationships, and this is especially true if your children are young. In addition to figuring out custody and visitation arrangements, dividing property, moving into a new home, opening separate bank accounts, and preparing for the dozens of other tasks involved in a divorce, you will also have the difficult job of helping your children cope with this change.

An important thing to consider is how destabilizing divorce can be for everyone involved. Children need stability to develop, so keeping them insulated from the whirlwind of separation and divorce is one of the most beneficial ways you can help them during this time.

Here are some tips for preparing your children for your divorce:

### Get on the same page with your spouse.

You may not want to talk to your spouse, and it may seem impossible that you’ll agree on anything, but discussing how you’ll break the news to your kids is critical. It is often a good idea to plan ahead for this conversation with your children and even practice what you’ll say. Think about when, where, and how you’ll talk about the divorce with your kids.

### Be prepared for delayed responses and subtle changes.

Kids cope with stress very differently than adults. Keep in mind that your child is still learning how best to deal with strong emotions and difficult situations. They may seem fine at first but then have outbursts or changed behavior weeks or months later. Your children may also only show small changes in their routines or moods despite struggling with strong emotions. Patience, understanding, and support go a long way toward helping your children cope with your divorce and accepting their new normal.

### Help them understand it’s not their fault.

It’s critical that children understand their parents’ divorce is not their fault. How you approach this will depend on your child, and you are in the best position to determine what they can comprehend. Within reason, you can discuss the divorce to help your kids process it in a healthy way. This does not mean giving your kids details of why your relationship ended, but it does mean explaining that the divorce is in no way because of them.

### Tell your kids what to expect.

Helping your kids understand what to expect from their new situation is reassuring for them. Again, this will depend on how old your children are, as well as numerous other factors, so use your judgment. It can be helpful to explain what will stay the same and what will change and remind them that both of their parents will continue to be a part of their lives.

## Guidance from a North Carolina Divorce Lawyer

Navigating a divorce with children can seem like a full-time job. From preparing for settlement or litigation and adjusting to your new normal to helping your children understand and cope with what divorce means for your family, you have enough on your plate. At [North Carolina Legal Services](/services/family), our North Carolina divorce lawyers will handle your case with the care and dedication it deserves. Contact us to schedule your consultation.',
  'Divorcing in North Carolina with children? A North Carolina family law attorney explains child custody arrangements, child support guidelines, co-parenting requirements, and how courts decide what is best for your child.', 'Legal Services', '["Legal Services","Family","North Carolina"]', 'published',
  'user-ncls-blawby', 'asset_ncls_media_divorce-and-children-in-north-carolina-what-to-expect-and-how-to-prepare_4d8437cf',
  '2024-03-08T00:00:00.000Z',
  '2024-03-08T00:00:00.000Z', '2026-04-09T00:00:00.000Z', 'Divorcing in North Carolina with children? A North Carolina family law attorney explains child custody arrangements, child support guidelines, co-parenting requirements, and how courts decide what is best for your child.', 'Divorce and Children in North Carolina, NC Child Custody and Divorce, Preparing Children for Divorce NC, North Carolina No-Fault Divorce, Child Support Guidelines NC, Divorce Mediation in NC, NC Child Custody Mediation, Handling Divorce with Kids in NC, North Carolina Divorce Lawyer for Families, Co-Parenting Tips North Carolina, Divorce Impact on Children in NC, Legal Rights in NC Child Custody, Child Support Calculation North Carolina, Navigating Divorce with Children NC, Separation and Children in NC, Divorce Legal Services North Carolina, North Carolina Legal Services Family Law',
  '/article/divorce-and-children-in-north-carolina', NULL
),
(
  'blog_ncls_employee-disability-rights-in-north-carolina', 'org-ncls-blawby', 'site-ncls-blawby',
  'Employee Disability Rights in North Carolina', 'employee-disability-rights-in-north-carolina', 'Your supervisor is wrong—under federal and North Carolina law, your employer is required to work with you to find a way to let you work, so long as doing so doesn’t create an unreasonable burden on your employer. They’re not doing you a favor, it''s your right as a worker.

And you don’t have to ask perfectly, or jump through a bunch of hoops to invoke that right. There are no magic words you need to say or special forms or processes you have to fill out in order to trigger your employers obligations to accommodate you. This post will tell you what your rights are, common things employers get wrong, and what you can do to protect yourself at work.

## Does Employee Disability Apply to Me?

Your condition doesn''t have to stop you from working. What matters is whether it makes the work harder without support—a stool at a cash register, time off to see a doctor, a different workstation setup. Employers provide these kinds of changes every day.

The key question is whether you can still do the real work of your job with an adjustment. Not every task on a job description counts. Think about it this way: if your job is data entry and you develop carpal tunnel, the question isn''t whether you can also carry boxes to the mailroom. It''s whether you can do the data entry—and whether it''s practical for your employer to make that possible.

The most important thing to remember is this: if you can perform the essential core duties of your job—even if you need a little help or a change in routine to do it—you are a **qualified individual** protected by law ([N.C. Gen. Stat. §168A-3](https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/ByChapter/Chapter_168A.html))

Don''t wait for your condition to become a crisis. The law protects you as soon as the limitation exists ([42 U.S.C. §12102](https://www.ada.gov/law-and-regs/ada/))—not after you''ve been written up for performance issues no one knew were connected to a medical condition.

## How to Request For Accommodations

You don''t need a formal letter or a specific form. You need to tell your employer that a medical condition is affecting your work and you need something to change—whether you''re in your first week or your tenth year.

That can sound like:

- "My doctor says I need to limit standing—can we figure out a different setup for my station?"
- "I have treatment appointments on Tuesdays—can we adjust my schedule?"
- "My condition is making the current setup hard—I''d like to talk about options."

Each time you talk to your employer about your accommodation, send a follow-up email and bcc your personal address. You''ll want these saved in case you ever need to prove what you asked for and when.

## What Your Employer Can Do

Your employer doesn''t have to grant every request. They can say no if an accommodation would be too expensive or too difficult to implement, or if it would eliminate the essential duties of the job.

They can also ask for documentation from your doctor—but they''re only entitled to a short letter about how your condition affects your work. They don''t get to know your condition unless you want to tell them, and you probably shouldn''t. The more information you provide, the more likely you are to have something used wrongfully against you or in ways you won''t see. Call your doctor''s office to make sure they''re not sending over more information than they need to and that you''re comfortable with having disclosed. Once it''s sent, you can''t take it back.

Here''s where it gets abused: By law, your employer must provide these changes unless it would cause an "undue hardship" (a significant difficulty or expense) for the business ([42 U.S.C. §12112(b)(5)](https://www.eeoc.gov/statutes/titles-i-and-v-americans-disabilities-act-1990-ada)).What counts as too expensive or too difficult depends on the employer''s size and resources. A 500-person company claiming it can''t adjust your schedule has a very different burden than a five-person shop. Think about it this way: if your job requires heavy lifting and your condition limits that, your employer doesn''t have to remove all lifting. But if a dolly, a back brace, or a different rotation would let you do the work safely—that''s a reasonable accommodation, and refusing to explore it is where the law gets broken.

Most HR departments aren''t staffed or trained for this. The person handling your request may not know what the law requires. That doesn''t excuse the violation—your rights don''t depend on whether HR got adequate training—but it explains why so many requests stall.

Whether your request is denied or simply ignored, and whether it was deliberate or because of a lack of training, get it on the record. If your request is denied, send an email to the person you spoke with: "I''m following up on our conversation about my accommodation request. I asked for [X], and I was told my request is being denied because of [Y]. Is there anything I can do to appeal this decision?" Don''t be confrontational—your goal isn''t to win an argument, it''s to create a record.

[![Schedule a Consultation with North Carolina Legal Services](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e47c24ad39e5089d7d79.webp)](/schedule)

## What Your Employer Can''t Do

Before making you a job offer, an employer generally cannot ask about medical conditions. They can ask whether you can do the job with or without accommodation. After a conditional offer, they can require a medical exam—but only if everyone in that job category faces the same requirement.

Don''t volunteer medical information before you have an offer. You''re not required to, and it creates the possibility that a hiring decision was shaped by information the employer shouldn''t have had.

## What Your Employer Must Do

Once you ask, your employer is required to work with you on a solution ([29 C.F.R. §1630.2(o)(3)](https://www.eeoc.gov/laws/guidance/enforcement-guidance-reasonable-accommodation-and-undue-hardship-under-ada#interactive))—a modified schedule, accessible equipment, reassigned non-essential tasks, medical leave, remote work. Whatever lets you keep doing the job. The point isn''t to remove the real work. It''s to make it possible.

When you meet to discuss the accommodation, don''t minimize your condition to seem cooperative. Don''t say "it''s not that bad most days" or "I could probably manage without it"—that kind of language can end up in your employer''s notes and justify a denial.

Before the meeting begins, you should know what your limitations are and what you need to be able to do your job. You don''t have to know how it will be provided. For example, if you need to work in a dark room for migraines, that''s what you need to discuss with your boss, and it is their job to see if they can provide you with that accommodation. It isn''t your job to find solutions, just to express what you need.

## Disability Discrimination and Retaliation

Disability discrimination is when your employer treats you worse because of a medical condition. It doesn''t always mean being told "we don''t hire people with disabilities"—sometimes it looks like being passed over for a promotion you were qualified for, or being moved to a less desirable shift after disclosing a condition, or having your responsibilities quietly reduced so the company can justify eliminating your position later.

Retaliation is when your employer punishes you for asserting your rights. It doesn''t require anything as overt as being fired the day after you file a complaint. Sometimes it looks more like your employer enforcing rules against you more strictly than your colleagues after you requested accommodation, or suddenly documenting minor issues that were never mentioned before.

When you''re being mistreated at work, or treated differently than your peers—whether it is discrimination because of your disability or retaliation because you asked for help—it is illegal.

If you''re being written up for things that were never a problem before, your hours get cut, you''re being left out of meetings that you used to attend—or if anything else happens that makes your job worse or more unpleasant—it might be time to talk to an attorney. You likely need to prepare either to be fired or to take action to prevent yourself from being wrongfully terminated.

### Keeping Your Own Records

You need to begin to collect records before you lose access to your email or other company systems. Forward any communications related to your accommodation or disability to your personal email—whether that is your request for accommodation, disparaging remarks, records of unequal treatment, or anything else that could later be used to support your claim of discrimination or retaliation.

If you are terminated, don''t sign anything without having an attorney look at it first. It is common for employers to require terminated employees to sign an agreement to not sue them for wrongful termination in order to receive severance. In fact, getting you to sign that waiver may be the whole reason severance was offered in the first place.

For guidance on your options, visit our [employment law services](/services/employment) page. If your case may involve a hearing or legal proceeding, our [guide to preparing for court without a lawyer](/article/understanding-the-legal-process-preparing-for-court-without-a-lawyer) explains the process step by step. When you''re ready to speak with an attorney, [learn how to prepare for your consultation](/article/preparing-for-your-consultation) to make the most of that time.

## Frequently Asked Questions About Employee Disability Rights in North Carolina

**What laws protect disability employment rights in North Carolina?**

_The [Americans with Disabilities Act (ADA)](https://www.ada.gov/law-and-regs/ada/) is the primary federal law that prohibits disability discrimination in employment. North Carolina also enforces the [North Carolina Persons with Disabilities Protection Act](https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/ByChapter/Chapter_168A.html), which mirrors ADA protections at the state level._

**What is a reasonable accommodation?**

_A reasonable accommodation is any adjustment to a job, work environment, or hiring process that allows a qualified individual with a disability to: perform essential job functions, apply for a job, or access equal employment benefits._

**Are employers required to provide reasonable accommodations?**

_Yes. Employers must provide reasonable accommodations unless it causes undue hardship, defined as significant difficulty or expense relative to the business size and resources. ([42 U.S.C. §12112(b)(5)](https://www.eeoc.gov/statutes/titles-i-and-v-americans-disabilities-act-1990-ada))_

**What are common examples of reasonable accommodations?**

_Typical accommodations include: modified work schedules, remote or hybrid work arrangements, assistive technology or equipment, adjusted training materials or policies, and physical workspace modifications._

**Do employees have to request accommodations?**

_Yes. The employee must initiate the request. The request does not need specific legal language but must clearly indicate that a disability exists and an adjustment is needed for work. Employers may request medical documentation if the disability is not obvious._

**Can an employer deny an accommodation request?**

_Yes. A request can be denied if: it creates undue hardship, it removes essential job duties, or it is not supported by sufficient documentation. Employers must still attempt alternative accommodations through the interactive process._

**Can an employer retaliate for requesting accommodations?**

_No. Retaliation is illegal under both federal and North Carolina law. This includes firing, demotion, reduced hours, or harassment after a request is made._

**Do employers have to hire a person with a disability over other candidates?**

_No. Employers are not required to give preference. They must hire the most qualified candidate, but cannot reject someone solely due to disability if they are qualified._

**What counts as disability discrimination in the workplace?**

_Discrimination includes: refusal to hire due to disability, termination based on disability, failure to provide reasonable accommodation, unequal pay or job assignments, and harassment related to a disability._

**Are there limits to required accommodations?**

_Yes. Employers are not required to: provide personal-use items (glasses, hearing aids), remove essential job functions, lower performance standards, or violate safety requirements or seniority systems._

**Does the law apply to job applicants?**

_Yes. Disability protections apply to: job applications, interviews, hiring decisions, and employment conditions and benefits._

**What if the disability is not visible?**

_Non-visible disabilities are fully protected. Employers can request reasonable medical documentation to verify: the existence of a disability and the need for accommodation._

**What is the interactive process?**

_The interactive process is a required discussion between employer and employee to identify a workable accommodation. ([29 C.F.R. §1630.2(o)(3)](https://www.eeoc.gov/laws/guidance/enforcement-guidance-reasonable-accommodation-and-undue-hardship-under-ada#interactive)) Both parties must communicate in good faith, share relevant information, and explore reasonable solutions._

**Do small employers have to follow ADA rules?**

_The ADA applies to employers with 15 or more employees. North Carolina state law may apply more broadly depending on the situation._

## When You Need a Lawyer

If your employer engages with your request and you reach a solution, this post gives you what you need. But if they refuse to engage, if the request triggers retaliation, if you''re being pushed out, or if you''ve been terminated—legal representation changes what happens next. Sometimes just a letter from an attorney is enough to get things moving.

At North Carolina Legal Services, we handle disability accommodation disputes, workplace discrimination, and wrongful termination. If any part of this post describes what you''re going through, [schedule a consultation](https://www.northcarolinalegalservices.org/schedule).

If you work with employees navigating disability accommodations—whether as an HR professional, social worker, union representative, or advocate—please share this resource. The more workers understand their rights, the less often employers get away with ignoring them.',
  'Your back has been hurting for weeks, and you finally decide to ask your supervisor if you can use a stool at your station—standing for a full shift just is not going to work for a while. She says she will get back to you, but one week goes by, then another. You follow up. This time she tells you that standing is part of the job—and if you can not do it, you might need to find a new place to work.', 'Legal Services', '["Legal Services","North Carolina","Employee Rights"]', 'published',
  'user-ncls-blawby', 'asset_ncls_media_employee-disability-rights-in-north-carolina_a7671b0b',
  '2026-03-03T00:00:00.000Z',
  '2026-03-03T00:00:00.000Z', '2026-03-03T00:00:00.000Z', 'Your back has been hurting for weeks, and you finally decide to ask your supervisor if you can use a stool at your station—standing for a full shift just is not going to work for a while. She says she will get back to you, but one week goes by, then another. You follow up. This time she tells you that standing is part of the job—and if you can not do it, you might need to find a new place to work.', 'employee disability rights nc, ada accommodation north carolina, workplace disability discrimination, reasonable accommodation at work, nc employment law disability, americans with disabilities act nc, wrongful termination disability, interactive process ada, nc workplace rights, disability retaliation nc',
  '/article/employee-disability-rights-in-north-carolina', NULL
),
(
  'blog_ncls_fairness-is-not-a-zero-sum-game-why-dei-benefits-everyone', 'org-ncls-blawby', 'site-ncls-blawby',
  'Fairness Is Not a Zero-Sum Game: Why DEI Benefits Everyone', 'fairness-is-not-a-zero-sum-game-why-dei-benefits-everyone', '# Breaking the Misconception: DEI in the Real World

**Inequality isn''t just about identity—it''s woven into our systems.** It shows up in **education, healthcare, and access to basic resources**. Yes, **communities of color, women, and LGBTQ+ folks** face barriers, but **diversity, equity, and inclusion (DEI) programs don’t stop there**.

**Rural Americans, low-income families, and people with disabilities** all benefit from DEI initiatives. These programs aren’t about historic grievances or giving someone an unfair advantage. **DEI is about breaking down the barriers that hold all of us back**.

Take **Title I funding**, for example. It was designed in the 1960s to help **low-income schools**—many in **rural areas hit hard by economic shifts**. Here in North Carolina, that meant schools in **textile towns like Alamance County** and **farming communities like Duplin County**.

> **Title I isn’t about dividing people or lowering standards**. It’s about leveling the playing field so kids from struggling communities can get a good public education, setting them up to succeed alongside their peers who had more advantages.

Title I is just one example of how DEI works to level the playing field. But the impact of DEI goes far beyond education—it’s about creating a society where **everyone has a fair shot**.

## Why DEI Matters to All of Us

This isn’t just about policies—it’s about **who we are as a society**. Do we turn our backs on people who are struggling, or do we **come together to make sure everyone has an opportunity to succeed**?

Allowing systemic barriers to block someone’s path to success isn’t just unfair—it **holds us all back**.

Think about it this way:

- When you visit a **doctor** or hire an **attorney**, you don’t want someone who got the job because the system made it easier for them.

- You want the **best person**—the one who''s there because of their **skills, hard work, and dedication**.

- **That’s what DEI does**. DEI ensures that **merit**, not the circumstances of one''s birth, determines success.

> When we invest in **diversity, equity, and inclusion**, we build **stronger, more resilient communities**—and that benefits everyone.

## Why DEI Matters in the Justice System

**Justice is meant to be blind**, and the justice system is supposed to be impartial and **fair to everyone, regardless of their background**. But **systemic barriers** prevent millions of people from accessing the legal support they need, especially those **who don’t qualify for free legal aid, but also can’t afford the high costs of traditional law firms**.

At North Carolina Legal Services, we see people fall into this gap every day.

- **A family facing an [illegal eviction](/article/your-landlord-cannot-evict-you-without-a-court-order-heres-what-to-do-when-they-try)**
- **A worker fighting a discriminatory termination** by an employer
- **A domestic violence survivor, trying to find a way to start a new life with her children**.

> **DEI isn’t just about representation**—though that is also important—**it is about creating a system that works for everyone**.

By offering **income-based fees** and offering **payment plans**, we help break down financial barriers that often block meaningful to the justice system. But this **doesn’t just help our clients—it strengthens the communities that we serve**.

Think about it this way:

- If a **small business fails**—not because they lacked a good product or a strong work ethic, but because a larger competitor broke a contract and they couldn’t afford a lawyer to fight back—**that’s not just their loss**, it’s a **loss for their family and the community** that missed out on their great new idea.
- If a **child struggles in school**—not because they didn’t try, but because their landlord refused to fix mold in their apartment and their parents couldn’t take legal action—**that’s not just their problem**, it’s a **loss of potential that affects the entire community**.
- If an **employee is passed over for a promotion**—not because they weren’t the best candidate, but because their employer had a **personal prejudice against them**, whether because of their race, sex, religion, sexual orientation, age, [disability](/article/employee-disability-rights-in-north-carolina), or national origin—**that, by definition, is not a system that rewards merit**.
  These are all problems that access to legal services could fix. When everyday people can’t afford to assert their rights, we are all worse off. A justice system that only serves those who can pay isn’t just unfair—it holds back entire communities.

## DEI Strengthens Meritocracy and Calls Us to Action

DEI is challenging—it requires us to rethink how we’ve been doing things, **from our courts to our classrooms**, for hundreds of years.
Of course, there have been and will be mistakes and failures along the way, but **that doesn’t mean it’s not worth trying**. **Building a more equitable society is hard work**, but it’s essential for creating **a future that works for everyone**.
And while the people who benefit directly from **DEI** initiatives see the most immediate impact, we all benefit from the **downstream effects—stronger communities, a more robust economy, and a fairer society**.
Whether you’re from a **rural town or an urban neighborhood**, whether you’re **white, Black, Asian, Latino, or Native American**—whether you’re **Christian, Jewish, Muslim, or a non-believer**—**we all deserve the same opportunities**.

> **You deserve to live in a system where you can thrive, where your children have a chance at a good life and success, not because of where you were born, how you worship, who you love, or the color of your skin.**

And that’s what we are doing at **North Carolina Legal Services**—**working to make the justice system is actually just**.

## Conclusion: How You Can Support DEI and Access to Justice

If you care about these issues but don’t know where to start, that’s okay. You can:

- **Donate** to organizations striving to make a difference.

- **Volunteer** with local organizations supporting equity.

- **Stay informed** about policies that promote fairness.

- **Engage with community leaders** to advocate for equity and inclusion.

- **Have conversations** with friends and family to **challenge misconceptions** about DEI.

**Whatever issue drives you**, whether it’s wages, housing, healthcare, or my passion—equitable access to the justice system—**there’s a place for you to make your community more fair, inclusive, and just**. You don''t have to be perfect—I certainly am not—you just have to be willing to **give it your best shot**. Because, at the end of the day, whether you’re from the Appalachian foothills, the Outer Banks, or the heart of the Triangle, **we all have a role to play in building a better, stronger future**.

[![Schedule a Consultation with North Carolina Legal Services](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e47c24ad39e5089d7d79.webp)](/schedule)',
  'DEI isn''t about historic grievances—it''s about breaking systemic barriers that hold everyone back. Learn how Diversity, Equity, and Inclusion (DEI) impacts education, the justice system, and economic opportunity for all.', 'Diversity Equity Inclusion', '["Diversity Equity Inclusion","Legal Services","North Carolina","Social Justice"]', 'published',
  'user-ncls-blawby', 'asset_ncls_media_fairness-is-not-a-zero-sum-game-why-dei-benefits-everyone-crop_a2271426',
  '2025-02-18T00:00:00.000Z',
  '2025-02-18T00:00:00.000Z', '2025-02-27T00:00:00.000Z', 'DEI isn''t about historic grievances—it''s about breaking systemic barriers that hold everyone back. Learn how Diversity, Equity, and Inclusion (DEI) impacts education, the justice system, and economic opportunity for all.', 'What is DEI?, DEI in the justice system, Legal aid and DEI, Systemic inequality in North Carolina, DEI and economic opportunity, DEI and small businesses, North Carolina DEI policies, Low-income legal services NC, Title I funding North Carolina, DEI and public education, Workplace discrimination and DEI, Access to justice for low-income families, How DEI helps rural communities, Affordable legal services in North Carolina, DEI in employment law, Workplace discrimination and DEI, Diversity, equity, and inclusion, What does diversity, equity, and inclusion mean, Discrimination, Social justice, Racial justice',
  '/article/fairness-is-not-a-zero-sum-game-why-dei-benefits-everyone', NULL
),
(
  'blog_ncls_hurricane-disaster-relief-for-north-carolina-renters', 'org-ncls-blawby', 'site-ncls-blawby',
  'Hurricane Disaster Relief For North Carolina Renters', 'hurricane-disaster-relief-for-north-carolina-renters', '## Your Rights as a Renter in North Carolina

In North Carolina, renters are entitled to live in a habitable property where the home is safe, livable, and free from hazards, with working plumbing, heating, electrical systems, and compliance with local and state housing codes. In the context of a natural disaster, flooding, wind damage, or other destructive events may render the property uninhabitable. If your home has been damaged by Hurricane Helene and you’ve experienced the following, your home may not be considered habitable under North Carolina law:

- Flooding
- Fires
- Storm Surge
- Landslides
- Wind Damage
- Structural Damage

## What Is Considered an Uninhabitable Rental Property?

A rental property is considered uninhabitable when it is unsafe for human habitation due to damage such as:

- Compromised essential living conditions (e.g., lack of running water, electricity, or heat)
- Health or safety hazards
- Unstable building structures

## Your Rights As A Renter

North Carolina law provides several protections for renters. As a renter, you have the right to demand habitable living conditions.

### Repairs:

If your home has sustained damages and you are still living there, inform the landlord right away, and document your communications. Landlords are legally required to repair the home within a reasonable amount of time, but only if they are aware of the damage.

### Temporary Housing:

In cases where damage is extreme and your home has been deemed uninhabitable, landlords may be obligated to provide temporary housing or compensate you for living elsewhere.

## Breaking Your Lease

If your landlord does not make necessary repairs in a timely manner, you might have options regarding breaking your lease. If your landlord attempts to force you out without a court order, that is an illegal self-help eviction — see our guide on [what to do when your landlord tries to evict you illegally](/article/your-landlord-cannot-evict-you-without-a-court-order-heres-what-to-do-when-they-try). However, each situation is unique, and it''s essential to consult with an attorney to understand your specific rights and the best course of action. Keep in mind that rent is still due until the lease ends, which is the day you vacate the property.

## Document The Process

If you’re looking to request damages from your landlord, be sure to always document the situation. This includes making sure you are submitting your requests by email or text message, taking photos, recording videos, and maintaining a log of all communications with your landlord, including timestamps and dates. This evidence will be crucial in case of disputes over repairs or lease termination.

### Resources

- [North Carolina Housing Coalition](https://www.nchousing.org)
- [Legal Aid of North Carolina](https://www.legalaidnc.org) for tenant rights assistance

[![Schedule a Consultation with North Carolina Legal Services](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e47c24ad39e5089d7d79.webp ''Schedule a Consultation with North Carolina Legal Services'')](/schedule)

## Renters'' Insurance Claims

If you have renters'' insurance, now is the time to file a claim for any personal belongings that were damaged by the storm. While many policies don’t cover flood damage, they often include coverage for wind damage, theft, or vandalism.

Contact your insurance provider as soon as possible. Provide detailed documentation of all damages, including photos, receipts, and an inventory of lost items.

### Resources

- [National Flood Insurance Program](https://www.floodsmart.gov) for flood insurance coverage
- **North Carolina Department of Insurance Consumer Helpline (1-855-408-1212)** provides assistance with insurance claims, including renters'' insurance and disaster-related claims.

## FEMA and Emergency Assistance For Renters

Renters, especially ones without renter’s insurance, are encouraged to file a claim for FEMA assistance. This can include temporary housing, personal property, and other disaster-related expenses. The deadline for applying is within 60 days of the disaster declaration. Be sure to document and photograph all damaged property.

**Tip:** If your FEMA claim is denied, don’t give up. Denials can be appealed. Maintain detailed records of all communications and reach out to [North Carolina Legal Services](https://www.northcarolinalegalservices.org/) to answer your questions.

### Resources

- [FEMA: Disaster Assistance](https://www.disasterassistance.gov)
- [FEMAAppeals.org](https://www.advocatesfordisasterjustice.org/appeallettertofema/): Create and generate a printable/downloadable FEMA appeal letter

## Don’t Navigate Hurricane Damage Alone - Consult Our Legal Experts!

Even if you''re unsure about whether you need an attorney to recover damages after a hurricane, consulting with a lawyer can help you understand your rights as a renter and ensure that you aren’t missing any important steps. At [North Carolina Legal Services](/services/tenant-rights), our experienced attorneys are here to help you navigate the complexities of hurricane damage claims, including lease termination, landlord disputes, and compensation for lost property. If you own your home, see our companion guide on [disaster relief for North Carolina homeowners after Hurricane Helene](/article/disaster-relief-for-north-carolina-homeowners-after-hurricane-helene). Whether you''re dealing with an uninhabitable rental or need guidance on how to proceed, we can provide the support and advice you need. Schedule a consultation today and take the next steps toward recovering from the storm.

## General Resources

- [FEMA](https://www.disasterassistance.gov)
  - [Disaster Assistance](https://www.disasterassistance.gov)
  - **FEMA Helpline:** 1-800-621-3362
- **American Red Cross**
  - [Red Cross Shelters](https://www.redcross.org/get-help/disaster-relief-and-recovery-services/find-an-open-shelter.html): Currently Open
  - **Disaster Services Relief Hotline:** 1-800-RED-CROSS
  - **Safe and Well:** a web system that helps reunite displaced loved ones
    - [English](http://www.redcross.org/safeandwell)
    - [Spanish](https://www.safeandwelles.communityos.org/zf/safe/add)
- **National Disaster Legal Hotline:** 1-888-743-5749
- **Crisis Counseling Assistance Disaster Distress Helpline:** 1-800-985-5990
- [Next of Kin Registry](http://www.nokr.org): For missing, injured, or deceased family members.
- [How To Replace Important Documents](https://www.usa.gov/replace-vital-documents): Information on replacing birth certificates, driver’s license, passport, etc.
- [Food and Nutrition Services Recipient Disaster Resources](https://www.ncdhhs.gov/divisions/child-and-family-well-being/food-and-nutrition-services-food-stamps/hurricane-helene-food-and-nutrition-services-fns-flexibilities)
- [Disaster Unemployment Assistance](https://www.des.nc.gov/dua%C2%A0)',
  'Hurricane Helene caused widespread damage across North Carolina, with severe flooding and landslides disrupting communities, washing out major roads, and leaving many homes uninhabitable. As the state begins recovery, many North Carolina renters face the daunting task of addressing damage to their rental home. If you’re a renter who has been affected by the hurricane, here are some legal resources in recovering damages.', 'Legal Services', '["Legal Services","Disaster Relief","North Carolina"]', 'published',
  'user-ncls-blawby', 'asset_ncls_media_hurricane-disaster-relief-for-north-carolina-renters_3cf40846',
  '2024-10-23T00:00:00.000Z',
  '2024-10-23T00:00:00.000Z', '2024-10-23T00:00:00.000Z', 'Hurricane Helene caused widespread damage across North Carolina, with severe flooding and landslides disrupting communities, washing out major roads, and leaving many homes uninhabitable. As the state begins recovery, many North Carolina renters face the daunting task of addressing damage to their rental home. If you’re a renter who has been affected by the hurricane, here are some legal resources in recovering damages.', 'Hurricane Helene, North Carolina renters'' rights, Uninhabitable rental property, Rental home damage, Temporary housing for renters, Renters'' insurance claims, Legal Aid of North Carolina, FEMA disaster assistance, Breaking a lease after a disaster, Landlord repair obligations',
  '/article/hurricane-disaster-relief-for-north-carolina-renters', NULL
),
(
  'blog_ncls_iep-violations-in-north-carolina-how-to-recognize-them-and-protect-your-childs-rights', 'org-ncls-blawby', 'site-ncls-blawby',
  'IEP Violations in North Carolina: How to Recognize Them and Protect Your Childs Rights', 'iep-violations-in-north-carolina-how-to-recognize-them-and-protect-your-childs-rights', '# Advocating for Your Child''s Education in North Carolina — Blog Series, Part 1

When your child struggles in school because of a disability, getting support shouldn''t feel
like an uphill battle. Yet for too many North Carolina families, the IEP (Individualized
Education Program) process leads to confusion, delays, and denials.

At North Carolina Legal Services, we help parents turn frustration into action—and fight for
the education every child deserves.

In this two-part blog series, we''ll walk you through the most common IEP violations in North
Carolina and how to recognize early warning signs that your child''s rights may be at risk.
Whether you''re just starting or have been advocating for years, this guide is for you.

---

### **1. Delays in Evaluation: Time Is Not On Your Side**

**Legal Requirements:** Under federal law (IDEA), schools must complete an initial evaluation within **60 calendar days** of parental consent (34 CFR § 300.301). North Carolina state regulations are more specific: schools must complete the evaluation, determine eligibility, and develop the IEP within **90 calendar days** of a written referral, as outlined in the NC Policies Governing Services for Children with Disabilities (NC DPI).

Schools also have a legal **Child Find obligation** (20 U.S.C. § 1412(a)(3)) to proactively identify and evaluate any student suspected of having a disability. Section 504 of the Rehabilitation Act reinforces this obligation (34 CFR § 104.35).

**Common Violations:** Schools may delay evaluations by insisting on a prolonged Response to Intervention (RTI) process. Federal guidance, including from the Learning Disabilities Association of America, clarifies that RTI cannot delay or deny a formal evaluation. In some cases, parents are told an evaluation won''t be done because the student is "doing fine" academically, even when social, emotional, or behavioral issues exist.

**What This Means to You:** If you''ve made a written request or referral and the school has not acted within 90 calendar days, they''re out of compliance—regardless of staffing shortages or internal delays. Document every request and communication. If timelines are missed, you can file a formal complaint with the North Carolina Department of Public Instruction (DPI) or request a due process hearing.

**Real Case Example:** A 2022–2023 DPI report shows that North Carolina parents filed **233 special education complaints**. Over **70% were found valid**, many citing evaluation delays (NC DPI Special Education State Complaint Report, 2023).

---

### **2. Flawed or Incomplete Evaluations: Don''t Accept a Rubber Stamp**

**Legal Requirements:** The IDEA mandates that evaluations must be **comprehensive, use a variety of tools, and assess all areas of suspected disability** (34 CFR § 300.304). Section 504 requires nondiscriminatory evaluation procedures tailored to the individual child (34 CFR § 104.35). Tests must be in the student''s **primary language** and performed by **trained professionals**.

**Common Violations:** Some evaluations rely on just one IQ or academic test, omitting vital assessments such as behavioral evaluations, speech and language screening, or functional behavior assessments (FBAs). Inadequate evaluations often miss diagnoses like ADHD, autism, or dyslexia, especially when cultural or language barriers exist.

**What This Means to You:** You have a powerful right to request an **Independent Educational Evaluation (IEE)** at the school district''s expense if you disagree with their assessment (34 CFR § 300.502). If the district denies your IEE request, they must file for due process to defend their evaluation—which rarely happens.

**Real Case Example:** A 2023 systemic complaint against Wake County Schools revealed that many students with behavioral concerns were not receiving proper FBAs, leading to misdiagnoses and discipline instead of support (Legal Aid of NC, 2023).

[![Schedule a Consultation with North Carolina Legal Services](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e47c24ad39e5089d7d79.webp)](/schedule)

---

### **3. Wrongful Denial of Eligibility: Grades Aren''t the Whole Story**

**Legal Requirements:** Eligibility under IDEA requires that a student has a disability and needs special education services (34 CFR § 300.8). Section 504 has a broader threshold: any physical or mental impairment that substantially limits a major life activity qualifies a student for accommodations (34 CFR § 104.3).

**Common Violations:** Districts often deny eligibility because a student "is doing fine in class" or has passing grades. However, **educational performance** includes behavioral, social, and emotional functioning—not just academics. High-functioning students with autism, ADHD, or anxiety disorders are frequently overlooked.

**What This Means to You:** If your child has a diagnosis and continues to struggle, request a written explanation of the eligibility decision. You can pursue an IEE or initiate due process if your child was wrongly found ineligible. Even if denied an IEP, you can request a Section 504 Plan for accommodations.

**Real Case Example:** Legal Aid of NC''s investigations found that Wake County Schools failed to identify students with emotional disabilities, resulting in **systematic denial of services** for students who desperately needed them.

---

### **4. Poorly Written IEPs: A Document Isn''t Enough**

**Legal Requirements:** Every IEP must contain **specific, measurable goals**, the child''s **present levels of performance**, services with clear **frequency and duration**, and must incorporate data from evaluations and parent input (34 CFR § 300.320).

**Common Violations:** Common issues include copy-pasted goals ("will improve reading"), missing behavioral plans despite clear need, or predetermined service decisions based on district policies rather than individual needs. IEPs are also sometimes written without including parent input or the results of private evaluations.

**What This Means to You:** You have the right to request changes to the IEP at any time—not just during the annual review. If your input is ignored, the school must provide Prior Written Notice explaining why. You can also request mediation or file a complaint with DPI.

**Legal Reference:** In _Endrew F. v. Douglas County School District_ (2017), the U.S. Supreme Court ruled that IEPs must be **reasonably calculated to enable progress**, not just minimal benefit. This is now the gold standard for assessing IEP adequacy.

**Real Case Example:** In one DPI investigation, a school district was found in violation for failing to include specific speech therapy services despite the student''s need—a clear denial of FAPE (Free Appropriate Public Education).

---

**[Part 2: When Schools Fail to Follow the IEP](/article/when-schools-fail-to-follow-the-iep-what-north-carolina-parents-can-do):** In our next post, we break down what to do when IEPs aren''t being followed, how school discipline intersects with disability rights, what costs parents can be reimbursed for under IDEA, and how to handle systemic issues affecting your school or district. Read it now.

---

**Need help navigating the IEP process or filing a complaint?** Contact **North Carolina Legal Services** for affordable, compassionate legal guidance: visit our [special education and IEP advocacy services](/services/special-education-and-iep-advocacy) page or call (984) 777-8288.

[![Schedule a Consultation with North Carolina Legal Services](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e47c24ad39e5089d7d79.webp)](/schedule)',
  'Learn how to spot common IEP violations in North Carolina schools—from delayed evaluations to flawed IEPs. Protect your child''s education rights with North Carolina Legal Services.', 'Special Education', '["Special Education","Family Law","North Carolina"]', 'published',
  'user-ncls-blawby', 'asset_ncls_media_iep1a_e918957a',
  '2025-04-29T00:00:00.000Z',
  '2025-04-29T00:00:00.000Z', '2025-04-29T00:00:00.000Z', 'Learn how to spot common IEP violations in North Carolina schools—from delayed evaluations to flawed IEPs. Protect your child''s education rights with North Carolina Legal Services.', 'IEP violations North Carolina, Special education rights NC, IDEA compliance, Section 504 rights, IEP evaluation timeline, Special education evaluation, IEP eligibility requirements, IEP goals and objectives, Free Appropriate Public Education, Special education complaints NC, Due process hearing NC, Independent Educational Evaluation, Child Find obligation, IEP meeting rights, Special education services NC, Disability discrimination in schools, Special education advocacy, Parent rights in IEP process, Special education law NC, Education rights for disabled students',
  '/article/iep-violations-in-north-carolina-how-to-recognize-them-and-protect-your-childs-rights', NULL
),
(
  'blog_ncls_know-your-rights-what-to-do-if-you-witness-an-ice-arrest', 'org-ncls-blawby', 'site-ncls-blawby',
  'Know Your Rights: What to Do If You Witness an ICE Arrest', 'know-your-rights-what-to-do-if-you-witness-an-ice-arrest', 'Imagine that you are walking outside to check the mail when you notice an unmarked SUV outside of your home. You then see two men approach your neighbor who is outside watching her children while they play. These men are agents from Immigration and Customs Enforcement, or ICE. ICE agents are members of federal law enforcement, and everyone in the United States, regardless of citizenship or immigration status, has rights when interacting with law enforcement.

## Understanding Your Rights and Responsibilities

Before we discuss specific documentation strategies, it''s crucial to understand that interactions with law enforcement can be complex and often require on-the-spot decisions. While you have constitutional rights, how you assert these rights matters greatly. The potential for misunderstandings or escalation is real, so it''s important to know both what you can do and how to do it safely.

### Limits on ICE Arrests

If ICE is conducting an arrest in a public place, agents do not need a warrant. However, if ICE is attempting to enter a home or business, they must have a valid judicial warrant signed by a judge. ICE administrative warrants (Form I-200 or I-205) do not grant the authority to enter private property without consent. If ICE is at your door, you are not required to open it unless they provide a warrant issued by a court. If you are unsure, ask to see the warrant and verify that it is signed by a judge before allowing entry.

### Your Constitutional Right to Record

You always have a right to record law enforcement officials, including ICE agents, as long as that recording is not interfering with their performance of their duty. However, there''s an important distinction between having a right and exercising it safely.

The police may not want to be recorded, and they may threaten you with arrest for recording. They may say that you are interfering by recording, even if you are not. This would be illegal, but that doesn''t mean it won''t happen. Always assess your personal tolerance for risk before beginning to record. Ask yourself what will happen if you are held in jail for 24 hours. Will you miss work and be fired? Will there be someone to take care of your kids? If you are wrongfully arrested, you will likely not be charged or the charges may be dropped, but it is best to have a plan in place in case you are wrongfully arrested.

## What to Expect When Documenting an ICE Arrest

This can be a frightening situation, especially if you yourself are an undocumented immigrant, have had negative interactions with police in the past, or have never had any sort of contact with law enforcement. The important thing to remember is that you have rights. Whether the person being arrested is innocent or guilty and regardless of their immigration status, your right to document the arrest remains protected under the Constitution.

### Making the Decision to Document

Before you begin recording, assess your personal safety and comfort level. If video recording doesn''t feel safe or possible, remember that there are other effective ways to document what''s happening:

- Use your phone''s notes app to record what you see
- Send yourself detailed text messages
- Write on a piece of paper
- Make voice recordings

Whatever method you choose, your notes could become important evidence during future legal proceedings. Be sure to include detailed descriptions of:

- Officer appearance and behavior
- Vehicle descriptions
- Any use of force or aggressive tone
- Duration and location of arrest
- Nearby surveillance cameras

  [![Schedule a Consultation with North Carolina Legal Services](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e47c24ad39e5089d7d79.webp ''Schedule a Consultation with North Carolina Legal Services'')](/schedule)

### Safe Recording Practices

If you choose to video record, here are key guidelines to protect yourself and others:

1. Film Openly and Transparently

When documenting the arrest, film openly. Do not be secretive about it, don''t try to hide your phone or recording device. Say out loud the time of day, the date, and where you are located.

Do not disrupt the arrest. If you do so, you will be arrested and may be physically injured in that process. If the agents tell you to stop filming, you do not have to do so, simply tell them "I am exercising my right to document this arrest."

2. Comply with Lawful Orders:

If your presence is disrupting lawful police activity, they are within their authority to demand that you step back. You are required to do so, within reason. If this happens, point your camera down toward your feet and record yourself stepping backward to document your compliance. If you feel comfortable continuing to record, you may do so, and point your camera back at the arresting officers.

3. Focus on Law Enforcement

If your video gets picked up online and becomes widespread, it is possible that people will retaliate against other people included in the recording, so please try to protect their privacy. You can do this by always keeping the arresting officers as the focus of your recording, rather than the person being arrested, their family, or other bystanders. Record context, such as street signs or other landmarks nearby. If you can, try to identify the location of any other cameras in the area, such as home security or doorbell cameras. These may provide other evidence.

4. Stay Calm

If the arrest becomes violent, do not shout. This will make it harder to hear the interaction on the recording. You may, and should, however, remind police to not use unlawful force and that you are recording the event. This may encourage them to use restraint.

5. Protect the Arrestee''s Rights

Do not state the name of the person being detained. You are not required to answer any questions that law enforcement asks regarding that person''s activities, identity, or immigration status. Anything you say can be used as evidence in court.

6. Protect Yourself

Remember that law enforcement officers are legally allowed to lie to you, but you are not allowed to lie to them. It is best to exercise your right to remain silent. If you are arrested, ask for an attorney before you answer questions.

You have the right to remain silent. In North Carolina, you are generally not required to provide ID unless you are operating a vehicle or law enforcement has reasonable suspicion that you are involved in a crime. However, if you are being detained, refusing to identify yourself could escalate the situation, even if it is not legally required. If you are under arrest, you will be required to provide your name. If you choose not to answer questions, simply state, "I am exercising my right to remain silent."

You do not need to discuss your activities, you should not answer questions about yourself, where you live, what you do for work, your own immigration status, or provide any information about anybody else. Again, do not lie to law enforcement, simply remain silent. You may tell them that you are exercising your right to silence.

If law enforcement officials order you to delete footage, you do not have to comply. If you are not under arrest, law enforcement cannot take your phone without your consent or a warrant. However, if you are arrested, officers may seize your phone and attempt to access it if they have a valid warrant. The Fifth Amendment protects your privacy and your right to your cell phone in this situation. Make sure your phone is password protected, at least 6 digits is preferred. However, face and fingerprint ID are not protected. To protect your privacy, it is best to disable these features in advance.

### After the Encounter: What to Do Following an ICE Arrest

The moments immediately following an encounter with ICE are critical. Taking the right steps can help ensure that important evidence is preserved, legal rights are protected, and the affected individual receives the necessary support. Here are key actions to take after witnessing or experiencing an ICE arrest:

#### 1. Secure and Back Up Any Footage

To prepare for this sort of situation, it is best to have your phone set to automatically backup your recordings, though there are privacy and other considerations that impact that decision

If you recorded video or took photos of the encounter, it is essential to secure the footage as soon as possible. Backup your files to a secure location, such as cloud storage or an external device, to prevent loss or accidental deletion. If possible, share copies with trusted individuals or organizations that can help ensure the footage remains accessible if needed for legal proceedings.

#### 2. Document Additional Details While Your Memory Is Fresh

Write down everything you remember about the incident as soon as possible. Key details to include are:

- The date, time, and location of the encounter
- Descriptions of ICE agents, including their clothing, badges, or identifying information
- Statements made by agents during the arrest
- Names and contact information of any witnesses
- How the arrest was conducted, including whether the agents used force or entered a home without consent

A detailed account can serve as crucial evidence if legal action is necessary.

#### 3. Report the Incident to Local Immigrant Rights Organizations

Consider reaching out to local immigrant rights groups or advocacy organizations that provide support to individuals targeted by ICE. These organizations can help track enforcement activity, connect families with legal resources, and raise awareness of potential rights violations. Many groups also maintain rapid response networks to assist individuals facing immigration enforcement. Some organizations in North Carolina that you should consider contacting are:

- [North Carolina Justice Center - Immigrant and Refugee Rights Project](https://www.ncjustice.org/projects/immigrant-refugee-rights/overview/our-networks-2/)
- [Carolina Migrant Network](https://carolinamigrantnetwork.org/)
- [Comunidad Colectiva](https://carolinamigrantnetwork.org/colectiva/)
- [Legal Aid of North Carolina’s Immigration Pathways for Victim’s service](https://legalaidnc.org/resource/battered-immigrant-project/)

If you''re looking to consult with a lawyer, our guide on [how to prepare for your legal consultation](/article/preparing-for-your-consultation) can help you make the most of your time with an attorney.

- [El Colectivo NC](https://www.facebook.com/elcolectivonc/)
- [Siembra NC](https://www.siembranc.org/)
- [Association of Mexicans in North Carolina](https://www.amexcannc.org/?lang=en)
- [U.S. Committee for Refugees & Immigrants, North Carolina](https://refugees.org/nc/)
- Your local [Church World Service chapter](https://cwsglobal.org/)
- [Apoyo NC](https://www.facebook.com/apoyoNC/)
- [El Centro Hispano](https://elcentronc.org/)
- [El Pueblo](https://elpueblo.org/)
- [Refugee Support Center](https://refugeesupportcenter.org/)
- [The Center for New North Carolinians](https://cnnc.uncg.edu/)

- [Compañeros Inmigrantes de la Montañas en Acción](https://www.cimawnc.org/) (CIMA)

#### 4. Contact a Qualified Immigration Attorney

Legal guidance is essential in any situation involving ICE enforcement. If you or someone you know has been detained, seek out an experienced immigration attorney as soon as possible. An attorney can help determine the best course of action, advise on legal rights, and potentially intervene in the case. If you are unsure where to turn, local advocacy groups may be able to provide referrals to reputable legal counsel.

Taking these steps can help protect the rights of individuals affected by ICE enforcement and ensure that important evidence is preserved for any necessary legal proceedings.',
  'With increasing ICE activity across our communities, many people have reached out to our firm asking what they can do to support their neighbors who may be targeted. Whether you''re a bystander, a neighbor, or simply a concerned community member, you have the legal right to document an ICE arrest—and doing so can be crucial in protecting those being detained.', 'Legal Services', '["Legal Services","Immigration Law","Civil Rights","North Carolina","ICE Enforcement 2025"]', 'published',
  'user-ncls-blawby', 'asset_ncls_media_ice-north-carolina-legal-services_5c6db278',
  '2025-02-04T00:00:00.000Z',
  '2025-02-04T00:00:00.000Z', '2025-02-04T00:00:00.000Z', 'With increasing ICE activity across our communities, many people have reached out to our firm asking what they can do to support their neighbors who may be targeted. Whether you''re a bystander, a neighbor, or simply a concerned community member, you have the legal right to document an ICE arrest—and doing so can be crucial in protecting those being detained.', '2025 ICE enforcement, Immigration rights 2025, ICE raids documentation, Witness rights North Carolina, Constitutional rights immigration, Immigration enforcement 2025, Legal documentation ICE, Community protection, Civil liberties immigration, Bystander rights ICE arrests, Trump immigration policy 2025, ICE arrest documentation, Immigrant community support, North Carolina immigration rights, Safe documentation practices',
  '/article/know-your-rights-what-to-do-if-you-witness-an-ice-arrest', NULL
),
(
  'blog_ncls_pet-custody-in-nc-divorce-how-equitable-distribution-affects-your-dog-or-cat', 'org-ncls-blawby', 'site-ncls-blawby',
  'Pet Custody in NC Divorce: How Equitable Distribution Affects Your Dog or Cat', 'pet-custody-in-nc-divorce-how-equitable-distribution-affects-your-dog-or-cat', 'Here''s the reality we share with North Carolinians every day: North Carolina law treats pets as property. In court, your dog is in the same legal category as a chair or a car. That may feel wrong, but understanding this reality is the first step to protecting your bond with your pet.

This guide explains how judges actually handle pets in divorce, what evidence matters, and the most effective ways to ensure your furry family member stays safe.

## **What the Law Says About Pets in Divorce**

![Image](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/4661569ca43b62b79e63.webp)

To [file for an absolute divorce](/article/getting-a-divorce-in-north-carolina) in North Carolina, you and your spouse must live "separate and apart" for at least one continuous year, with one of you having lived in NC for at least six months.

When it comes time to divide marital property, pets are handled through a process called "[equitable distribution](/article/equitable-distribution-in-north-carolina-divorces)." North Carolina law doesn''t recognize "pet custody" like it does for children, only who owns a pet and has the right to possess it.

**The key distinction:** If you owned your pet before marriage, it''s likely your separate property. If you acquired the pet during marriage, it becomes marital property subject to division.

At North Carolina Legal Services, we often see couples surprised by this legal framework. While it may feel harsh, understanding how equitable distribution applies to your pet helps you prepare effectively.

## **What Actually Matters to a Judge**

![Image](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/95815cecb8c4bbc346fc.webp)

When dividing marital property, judges aim to make a fair split that gives each spouse their share of the jointly accumulated wealth. Here''s what surprises most people: most pets have little financial value in court. When determining "value," courts look at resale value, not emotional bonds. The exceptions are working animals, show dogs, or expensive breeds with documented resale value.

Since financial value of a pet is often minimal, judges focus on practical factors:

**Primary Caregiving Evidence:**

- Veterinary receipts showing who pays for care
- Food and grooming bills in your name
- Text messages or emails demonstrating daily care responsibilities
- Documentation of training classes or pet registration

**Financial Investment:**

- Bank or credit card statements showing purchase or adoption costs
- Records of ongoing expenses like food, toys, and medical care
- Insurance policies listing you as the owner

**Ownership History:**

- If you had your pet before marriage, it''s probably separate property
- Adoption papers or veterinary records from before the marriage are crucial proof
- Registration documents in your name

**Family Considerations:**

- If your children are bonded with the pet, judges may keep them together
- Courts consider the stability this provides for the children''s wellbeing

**Documentation is critical.** Families across the state tell us they wish they had kept better records of their pet care responsibilities.

## **Practical Steps to Protect Your Pet**

The single most effective way to secure your pet''s future is reaching an agreement with your spouse and recording it in a separation agreement.

**Why Agreements Work:**
Because pets are property, judges almost always honor what both parties agree to voluntarily. A comprehensive agreement can address:

- Who keeps the pet permanently
- Any visitation or shared-care schedule
- Who pays for veterinary bills, food, and other ongoing costs
- What happens if the pet needs expensive medical treatment

Once signed and incorporated into your divorce, this agreement carries the force of a court order.

**Gathering Your Evidence:**
Start collecting documentation now:

- Organize veterinary records showing your involvement
- Keep receipts for food, supplies, and care expenses
- Save photos and videos showing you with your pet
- Document your daily care routine with timestamps

## **When Safety Is a Concern**

![Image](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/9e68787a4d6880c03406.webp)

If you''re experiencing domestic violence, you can request that the court include your pet in a Domestic Violence Protective Order (DVPO). Under N.C. Gen. Stat. § 50B-3, judges may grant you possession of the animal and forbid the other party from harming it.

The law recognizes that abusers often threaten or harm pets to control their victims. If you''re in this situation, don''t hesitate to contact your local domestic violence prevention agency for assistance in planning for your safety. Legal Aid North Carolina may provide you with a free attorney to help obtain a protection order. The safety of both you and your pet matters.

[![Schedule a Consultation with North Carolina Legal Services](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e47c24ad39e5089d7d79.webp ''Schedule a Consultation with North Carolina Legal Services'')](/schedule)

## **When to Get Help**

At North Carolina Legal Services, we recommend seeking legal guidance when:

- You can''t reach an agreement about your pet
- Your spouse is threatening to harm or abandon your pet
- You''re facing domestic violence that involves your pet
- Your pet has significant financial value
- You need help drafting a separation agreement

We help families, including their furry members, create enforceable agreements that protect what matters most. When informal arrangements aren''t enough, we ensure your rights and your pet''s safety are protected. Learn more about our [family law services](/services/family) and how we can help during your separation or divorce.

## **Separate Property, Gifts, and Inheritance: When a Pet Is Yours Alone**

Under North Carolina’s equitable distribution rules, a pet is your separate property if:

- You owned the pet before the marriage.
- You inherited the pet.
- The pet was clearly given to you as a gift.

Judges look for evidence of intent and ownership. Gift law can apply even if the pet was acquired during the marriage: if there is clear proof that the animal was gifted to you (not to both spouses), a judge may treat it as your separate property.

Practical examples of helpful proof:

- Adoption contract or bill of sale listing only you as the owner.
- Veterinary and microchip registration in your name from the start.
- Written gift evidence: a birthday/holiday card, note on the adoption paperwork, email, or text from your spouse or the giver stating the pet is “yours.”
- Proof of inheritance, such as a letter or email from family or estate documents.
- Purchase or adoption receipts paid from your personal account, paired with messages or documents showing the pet was intended for you alone.

Organization tips:

- Keep originals and clear copies (paper and digital).
- Create a simple timeline showing when you acquired the pet compared to your marriage date.
- Keep registrations consistent with your position (for example, avoid adding both names if you intend to claim separate ownership).

## **How Judges Weigh the Totality of the Circumstances**

Because pets are legally treated as property, judges have discretion when spouses disagree. They consider the “totality of the circumstances” to decide who should receive the pet. The goal is to understand the practical reality of who the true caregiver is.

Common factors judges consider:

- Daily care: who feeds, walks, cleans litter, and handles training.
- Veterinary care: who schedules, pays for, and attends appointments; who gives medication.
- Expenses: who regularly pays for food, supplies, insurance, grooming, and medical bills.
- Planning and logistics: who arranges sitters or boarding and manages travel or routine disruptions.
- Children’s bond: whether the pet is closely bonded with your children and who ensures that connection and stability.

How to tip the scales with evidence:

- Keep a simple care log with dates and short notes (walks, feedings, meds, training).
- Save receipts and bank/credit statements for ongoing expenses.
- Download vet portal records and visit summaries; keep them in a dated folder.
- Screenshot texts/emails that show you arranging care, sitters, grooming, or vet visits.
- Save photos/videos with timestamps that show your consistent caregiving.

Judicial discretion is real. Clear, organized records help a judge see the full picture of your role and can make a decisive difference.

## **Frequently Asked Questions**

**Can I get custody of my pet like I would for children?**
North Carolina doesn''t recognize "custody" for pets. However, if you and your spouse agree to a custody-like arrangement in writing, courts will usually enforce it.

**What if I owned my pet before marriage?**
That pet is likely your separate property. Keep adoption records, veterinary bills, and registration documents from before the marriage as proof.

**What if we can''t agree on who keeps our pet?**
The judge decides as part of equitable distribution, typically weighing caregiving history, financial investment, and practical considerations.

**Is there "pet support" in North Carolina?**
No legal requirement exists, but you and your spouse can agree to share ongoing costs in your separation agreement.

**Can I get a temporary order for my pet during the divorce process?**
Temporary property orders for pets are rare. If safety is a concern, a DVPO offers the most effective protection.

**Who owns the pet if there is no agreement or equitable distribution case filed before the divorce is final\*\***?\*\*
When the judge grants the divorce officially ending the marriage, if there is no agreement, previous court order, or a pending case about your pet then the person who has possession will assume sole ownership. This default rule applies to most of the personal property held by each party on the day the divorce becomes official.

## **The Bottom Line**

![Image](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/ffca5f1905bf4cb3f07e.webp)

Your pet isn''t "just property" to you, but North Carolina law treats them that way. That''s why documentation and proactive planning matter so much.

Here''s what we recommend at North Carolina Legal Services:

- Gather records showing your caregiving role
- Consider negotiating a separation agreement
- Prioritize your pet''s safety if domestic violence is involved
- Know that you don''t have to handle complex situations alone

## **Ready to Protect Your Pet''s Future?**

At North Carolina Legal Services, we understand that pets are family members, even when the law sees them differently. We help North Carolinians create practical, enforceable arrangements that prioritize both legal requirements and your pet''s wellbeing.

Whether you need help with separation agreements, domestic violence protection, or navigating property division, we''re here to support you through this challenging time.

Contact us today to discuss your situation. We offer sliding-scale fees to make legal help accessible when you need it most.

_Teachers, social workers, and community advocates: Please share this resource with families who might benefit from this information. Together, we can help North Carolinians protect their beloved companions during difficult transitions._',
  'Divorce is heartbreaking for everyone involved, including the four-legged members of your family. At North Carolina Legal Services, we regularly help families facing these questions: What happens to your dog, cat, or other pets when you and your spouse separate?', 'Legal Services', '["Legal Services","North Carolina","Family","Divorce","Pet Custody","Family"]', 'published',
  'user-ncls-blawby', 'asset_ncls_media_pet-custody-in-nc-divorce-how-equitable-distribution-affects-your-dog-or-cat-6_0d933ffe',
  '2025-10-20T00:00:00.000Z',
  '2025-10-20T00:00:00.000Z', '2025-10-20T00:00:00.000Z', 'Divorce is heartbreaking for everyone involved, including the four-legged members of your family. At North Carolina Legal Services, we regularly help families facing these questions: What happens to your dog, cat, or other pets when you and your spouse separate?', 'North Carolina Legal Services, North Carolina Divorce, Divorce Legal Services, Pet Custody North Carolina, Pet Custody Divorce NC, Family Law North Carolina',
  '/article/pet-custody-in-nc-divorce-how-equitable-distribution-affects-your-dog-or-cat', NULL
),
(
  'blog_ncls_preparing-for-your-consultation-with-north-carolina-legal-services', 'org-ncls-blawby', 'site-ncls-blawby',
  'Preparing for Your Consultation with North Carolina Legal Services', 'preparing-for-your-consultation-with-north-carolina-legal-services', '## Welcome to North Carolina Legal Services

We are honored you have chosen North Carolina Legal Services (NCLS) for your legal needs. Our commitment is to provide accessible legal services to everyone, regardless of income constraints. Here at NCLS, we are proud to serve our community by offering affordable legal services to working families and community members. Thank you for trusting us with your case.

## How to Prepare for Your Consultation

Here are some key points to ensure you get the most out of your consultation:

### Be prepared for your consultation by:

- **Gathering any relevant documents** that you think are needed for our discussion.
- **Writing down any questions** you might have. This will ensure we do not miss anything and will keep our time efficient.
- **Making note of any upcoming deadlines** or events that are relevant to your case or any other events that may be important.

### Remember:

- All details shared during our consultation remain strictly confidential even if we do not take the case.
- Legal situations can make us feel anxious, but we are here to ensure that you do not feel alone.
- We are here to assist you every step of the way.

## Rescheduling and Contact Information

If you need to reschedule your consultation, instructions for how to do so are included in your consultation request email confirmation. Should any questions arise before your consultation please contact us at contact@northcarolinalegalservices.org.

[![Schedule a Consultation with North Carolina Legal Services](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e47c24ad39e5089d7d79.webp ''Schedule a Consultation with North Carolina Legal Services'')](/schedule)

## What to Expect During Your Consultation

During your consultation, our legal team will:

1. Listen carefully to your situation and concerns
2. Ask clarifying questions to better understand your case
3. Explain the legal options available to you
4. Discuss potential next steps and strategies
5. Provide information about our services and how we can help

We understand that legal matters can be complex and sometimes overwhelming. Our goal is to provide you with clear information and guidance so you can make informed decisions about your legal situation. If you may need to appear in court, our [guide to preparing for court without a lawyer](/article/understanding-the-legal-process-preparing-for-court-without-a-lawyer) walks you through what to expect.

## Confidentiality and Trust

At North Carolina Legal Services, we take client confidentiality very seriously. Everything you share with us during your consultation is protected by attorney-client privilege, even if we ultimately don''t take your case. You can speak freely about your situation without worrying that your information will be shared with others.

## After Your Consultation

Following your consultation, we will:

- Provide you with a summary of what was discussed
- Outline any next steps or actions needed
- Give you clear information about our services and fees
- Answer any remaining questions you may have

We''re committed to making the legal process as transparent and accessible as possible for all our clients.

## Contact Us

If you have any questions before your consultation or need to reschedule, please don''t hesitate to reach out to us at contact@northcarolinalegalservices.org. We''re here to help and look forward to assisting you with your legal needs.',
  'We are honored you have chosen North Carolina Legal Services (NCLS) for your legal needs. Our commitment is to provide accessible legal services to everyone, regardless of income constraints. Here at NCLS, we are proud to serve our community by offering affordable legal services to working families and community members.', 'Legal Services', '["Legal Services","Consultation","North Carolina"]', 'published',
  'user-ncls-blawby', 'asset_ncls_media_preparing-for-your-consultation_e377f00a',
  '2025-04-09T00:00:00.000Z',
  '2025-04-09T00:00:00.000Z', '2025-04-09T00:00:00.000Z', 'We are honored you have chosen North Carolina Legal Services (NCLS) for your legal needs. Our commitment is to provide accessible legal services to everyone, regardless of income constraints. Here at NCLS, we are proud to serve our community by offering affordable legal services to working families and community members.', 'Legal Consultation Preparation, How to Prepare for Legal Meeting, What to Bring to Legal Consultation, Legal Consultation Tips, North Carolina Legal Services, Legal Consultation Questions, Preparing for Legal Advice, Legal Consultation Checklist, Legal Consultation Documents, Legal Consultation Process, Legal Consultation Guide, Legal Consultation Expectations, Legal Consultation Confidentiality, Legal Consultation Deadlines, Legal Consultation Rescheduling',
  '/article/preparing-for-your-consultation-with-north-carolina-legal-services', NULL
),
(
  'blog_ncls_property-division-in-north-carolina-divorce-protecting-whats-yours', 'org-ncls-blawby', 'site-ncls-blawby',
  'Property Division in North Carolina Divorce - Protecting What’s Yours', 'property-division-in-north-carolina-divorce-protecting-whats-yours', 'If you are going through a separation or divorce and beginning this process, don''t worry. We are here to help. If you''re at the very beginning, our [guide to getting a divorce in North Carolina](/article/getting-a-divorce-in-north-carolina) covers filing requirements, timelines, and what to expect. This post walks you through property division step by step so you can understand what''s at stake and set yourself up for success.

## How is Property Divided?

In North Carolina, the process of dividing marital property is called “equitable distribution.” It is important to note that dividing the assets fairly does not necessarily mean dividing them equally. Equitable distribution generally aims to divide your assets in a way that is fair. In some cases, the Court may determine that an unequal distribution is more equitable. This allows for flexibility to help ensure the most just outcome possible.

### Types Of Property

First, it is important to understand the two types of property that we will be looking at during this process:

- Marital Property is all of the property that you or your spouse acquired while you were married. This includes but is not limited to joint bank accounts, your home, and personal possessions ranging from furniture to even your pets.
- Separate Property is all of the property that each party to the divorce owned before getting married. This can also include some things that you acquired individually, such as gifts and inheritances.

Understanding these categories is key to knowing what’s up for division—and what’s not.

So, first, we need to determine what is considered “marital property” and what property belongs to each party individually.

## Step 1: Review Your Prenuptial Agreement (if you have one)

The first step in the equitable distribution process is to determine whether you or your spouse have a prenuptial agreement. A valid prenuptial agreement can establish clear guidelines for dividing property, saving time and reducing potential conflicts.

### Why Start with a Prenup?

Prenuptial agreements can:

- Clarify Ownership: Specify which assets and debts are considered separate property and not subject to division.
- Define Marital Property Rules: Outline how specific marital assets will be divided, such as bank accounts, real estate, or retirement funds.
- Simplify the Process: Remove certain assets or debts from the equitable distribution process altogether.

### What Happens If There’s No Prenup?

If no prenuptial agreement exists—or if the agreement doesn’t address all areas of property division—North Carolina’s equitable distribution laws will guide the process. This means the court will step in to ensure a fair division of marital property and debts, following a structured process that begins with identifying and categorizing assets.

[![Schedule a Consultation with North Carolina Legal Services](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e47c24ad39e5089d7d79.webp ''Schedule a Consultation with North Carolina Legal Services'')](/schedule)

## Step 2: Identify and Separate Property

If your prenuptial agreement doesn’t cover all assets—or if you don’t have one—the next step in equitable distribution is determining what property is marital and what is separate. This distinction is crucial because only marital property is subject to division under North Carolina law.

### What Is Marital Property?

Marital property includes assets and debts acquired by either spouse during the marriage, such as:

- Real estate purchased together.
- Joint bank accounts or investments.
- Retirement accounts that grew during the marriage.
- Personal property, including vehicles, furniture, and even pets — see our guide on [pet custody in NC divorce](/article/pet-custody-in-nc-divorce-how-equitable-distribution-affects-your-dog-or-cat) for how courts handle animals.

### What Is Separate Property?

Separate property generally refers to assets owned by one spouse before the marriage or acquired individually during the marriage, such as:

- Inheritances or gifts given exclusively to one spouse.
- Items explicitly protected by a prenuptial agreement.
- Property kept separate from marital funds (e.g., an inheritance deposited in an individual account).

### How to Classify Property

Determining whether an asset is marital or separate often requires a detailed review of:

- Acquisition Date: When was the property obtained? Anything acquired before the marriage is likely separate property.
- Source of Funds: Was the property purchased with marital income or separate funds?
- Commingling: Were separate assets combined with marital funds, making them harder to classify as separate?

If you’re unsure about how to classify specific assets, schedule a consultation and we’ll have one of our family law attorneys help you through this process. Misclassifying property can lead to costly disputes and even litigation, so it is best to get things right from the beginning.

### Next Steps

Once your assets are categorized, the process moves to assigning values and dividing marital property equitably. Even if you and your spouse disagree on the classification of some items, understanding the basics of marital and separate property is a key step in moving forward.

---

## Step 3: Evaluate the Value of Marital Properties

After identifying and categorizing all property, the next step in the equitable distribution process is to assign a value to each marital asset.

#### How to Value Property

1.  Identify All Property: Now that you have identified all of your marital property in Step 2, make a comprehensive list of everything you and your spouse own together, including assets and debts such as:

- Real estate.
- Bank accounts.
- Retirement funds.
- Personal property (e.g., vehicles, furniture, or collectibles).
- Debts like mortgages, credit card balances, or car loans.

3.  Appraise Assets: Each item must be assigned a fair market value. This can be done a few different ways, depending upon the type of asset:

- Professional Appraisals: For real estate, businesses, or unique items like jewelry.
- Account Balances: For bank and retirement accounts, use statements from the date of separation.
- Market Comparisons: For personal property like vehicles, check resale values through reliable sources.

5.  Categorize Debts: Assign values to marital debts as well, using their outstanding balances at the date of separation.

#### Why Accurate Valuation Matters

Valuing property correctly ensures a fair division of assets. Inaccurate or incomplete valuations can lead to costly and time consuming litigation if a dispute arises..

#### What Comes Next?

Once all marital property is valued, the focus shifts to dividing these assets equitably. The court or both parties will evaluate several factors to determine what’s fair.

## Step 4: Protect Your Property in Divorce

Going through a divorce can feel like a tug-of-war, but there are steps you can take to protect your interests:

### Understanding Your Rights Before and After Filing

If you are in the process of separating or have recently been notified that your spouse has filed for divorce, it’s essential to know that you must file for equitable distribution (ED) if you want to divide marital assets. Filing for divorce alone does not automatically trigger the division of property.

If you file for divorce first, be sure to request equitable distribution early in the process. If you’ve been notified that your spouse has already filed, it’s important to act quickly and file your request for ED to protect your rights. Once the divorce is finalized, your ability to claim property distribution is generally lost, so timely action is crucial.

### Document Everything

Before filing for divorce, create a detailed list of all your assets and debts. Include:

- Bank statements.
- Tax returns.
- Deeds or titles to property.
- Receipts for valuable items like jewelry or electronics.

### Avoid Making Serious Mistakes

Hiding assets or running up debts before the divorce is finalized can backfire. North Carolina courts take economic misconduct seriously and may penalize anyone who tries to cheat the system.

## What Happens If You and Your Spouse Can’t Agree?

Any divorce is difficult. Disagreements are natural, but your financial future is at stake. It is important to get things right, including how to divide. You don’t have to do this alone. At North Carolina Legal Services, we’ll help you protect your rights, avoid costly mistakes, and set yourself up for success in the next chapter of your life.

Contact us today to schedule a consultation and start moving forward with your case. Let us handle the complexities, so you can focus on what matters most. Learn more about our [family law services](/services/family) and how we can help you through this process.',
  'Divorce is difficult, even under the best circumstances. Beyond the emotional challenges, there are practical logistical questions to consider, like how the separating couple should divide marital assets.', 'Divorce', '["Divorce","Property Division","North Carolina"]', 'published',
  'user-ncls-blawby', 'asset_ncls_media_property-division-in-north-carolina-divorce_b0a257d6',
  '2024-12-21T00:00:00.000Z',
  '2024-12-21T00:00:00.000Z', '2024-12-21T00:00:00.000Z', 'Divorce is difficult, even under the best circumstances. Beyond the emotional challenges, there are practical logistical questions to consider, like how the separating couple should divide marital assets.', 'Property Division North Carolina, Equitable Distribution, Marital Property, Separate Property, Divorce Asset Division, North Carolina Divorce Law, Property Valuation Divorce, Prenuptial Agreement NC, Divorce Property Rights, NC Divorce Attorney',
  '/article/property-division-in-north-carolina-divorce-protecting-whats-yours', NULL
),
(
  'blog_ncls_protecting-your-freelance-business-in-north-carolina-contracts-compliance-and-best-practices', 'org-ncls-blawby', 'site-ncls-blawby',
  'Protecting Your Freelance Business in North Carolina Contracts, Compliance, and Best Practices', 'protecting-your-freelance-business-in-north-carolina-contracts-compliance-and-best-practices', 'Freelancing offers incredible flexibility and independence, but it also comes with unique challenges—especially when it comes to contracts, intellectual property (IP), and compliance. Whether you''re designing websites, consulting, or managing social media accounts, protecting your business and ensuring you meet legal obligations is essential.

Many freelancers and small business owners hesitate to get legal help because they are concerned about the expense and unsure as to whether it is actually needed. But legal mistakes can be costly, sometimes they can even cause a growing business to fail, and they''re often preventable with the right guidance. Let me show you how a small investment in legal services now can help prevent or mitigate the risk around major financial and legal headaches down the road.

This blog will walk you through the foundational elements that every North Carolina freelancer should address to build a solid business foundation, avoid disputes, and secure your rights.

## Why Freelancers Need Solid Contracts

Contracts are not just formalities—they''re your first line of defense against misunderstandings, late payments, and IP disputes. A well-drafted contract clearly defines expectations, protects your work, and ensures legal compliance. Here''s what every freelancer''s contract should include:

### 1. Scope of Work

Outline exactly what services you will provide and what deliverables the client can expect. A detailed scope of work prevents "scope creep"—when clients request extra work outside the original agreement.

### 2. Payment Terms

Specify how and when you will be paid:

- Hourly or Fixed-Rate Terms: Clearly define whether the work is paid hourly or at a fixed rate.
- Invoicing Schedule: Include the invoicing frequency (e.g., weekly, monthly, or upon project completion).
- Late Payment Penalties: Add a clause for late fees to encourage timely payment.

### 3. Intellectual Property (IP) Ownership

IP ownership is a critical area where freelancers often lose rights to their work. In your contract:

- State that ownership transfers to the client only after payment is received in full.
- Retain ownership of draft materials or tools you developed unless explicitly stated otherwise.
- Clarify the client''s permitted usage of your work (e.g., exclusive, non-exclusive, or limited).

### 4. Termination Clauses

Protect yourself in case a project is canceled prematurely. Include:

- How termination is handled.
- Payment for work completed up to the termination date.

### 5. Dispute Resolution

Include a clause that specifies how disputes will be handled. Mediation or arbitration can help avoid costly lawsuits.

### 6. Compliance with North Carolina Laws

Ensure your contract aligns with North Carolina''s legal requirements, especially around independent contractor status to avoid being misclassified, as outlined in N.C. Gen. Stat. § 95-25.22.

[![Schedule a Consultation with North Carolina Legal Services](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e47c24ad39e5089d7d79.webp ''Schedule a Consultation with North Carolina Legal Services'')](/schedule)

## Regular Compliance Checks: Avoid Issues Before They Arise

As a freelancer, compliance is crucial to maintaining your professional reputation and avoiding legal troubles. Here are areas to monitor regularly:

### 1. Business Registration

If you operate as a sole proprietor, consider registering as an LLC in North Carolina. This provides legal protections and makes it easier to open a business bank account.

### 2. Tax Compliance

Freelancers are responsible for:

- Paying self-employment taxes to the IRS.
- Filing quarterly estimated taxes to avoid penalties, as required under N.C. Gen. Stat. § 105-163.15.
- Collecting and remitting sales tax for certain services (check whether your services are taxable under N.C. Gen. Stat. § 105-164.4).

### 3. Employment Law Compliance

Ensure you are properly classified as an independent contractor when working with clients. Misclassification can lead to tax audits and fines.

### 4. Data Protection Laws

If you handle client data, ensure you comply with state and federal privacy regulations, such as the North Carolina Identity Theft Protection Act (N.C. Gen. Stat. § 75-65).

### 5. Industry-Specific Regulations

Certain professions (e.g., healthcare consultants, financial advisors) may require additional licenses or permits. Check with North Carolina''s professional boards for guidance.

## Best Practices to Protect Your Freelance Business

### 1. Use a Professional Contract Template

Start with a solid contract template tailored to your industry. Customize it to suit the specifics of each project. [Contact us](/schedule) to have an attorney review your contract and ensure it''s airtight and compliant with North Carolina laws.

### 2. Keep Detailed Records

Maintain comprehensive records of:

- Contracts and signed agreements.
- Invoices and receipts.
- Client communications.
  These records can protect you in case of disputes.

### 3. Invest in Insurance

Consider liability insurance to protect yourself against claims related to your work, such as:

- Errors and omissions insurance.
- General liability insurance.

## Protect Your Business: The Value of Legal Services and Next Steps

Many freelancers hesitate to seek legal services, assuming it''s an unnecessary expense. However, investing in legal guidance early on can save you thousands of dollars in the long run. If your freelance work has grown into a more formal business, our article on [the legal needs of small businesses in North Carolina](/article/the-legal-needs-of-small-businesses-in-north-carolina) covers the next level of legal planning. Learn more about our [small business and nonprofit legal services](/services/small-business-and-nonprofits). A well-structured contract or a compliance check today can prevent expensive disputes, IRS investigations, or lawsuits with clients, partners, or contractors later.

Consider these common risks that freelancers face:

- **IRS Audits and Tax Penalties** – Misclassifying yourself or failing to file estimated taxes properly can trigger costly penalties or audits. [An attorney can help](/schedule) ensure you''re meeting federal and North Carolina tax obligations.
- **Client Disputes** – Without a clear contract, you may struggle to collect payments, enforce deadlines, or retain ownership of your work. [A lawyer can help](/schedule) you draft strong agreements that protect your rights.
- **Intellectual Property Theft** – Without an IP clause in your contract, a client might claim ownership of your work—even if they haven''t paid in full. [An attorney can help](/schedule) you structure contracts that preserve your creative rights.
- **Misclassification Issues** – Some clients try to classify freelancers as independent contractors when they legally qualify as employees. If misclassified, you could be denied benefits and legal protections, and the IRS could hold you liable for unpaid employment taxes.

For many freelancers, legal services are a low-cost investment in security. [A simple contract review or compliance consultation](/schedule) can prevent disputes that could cost thousands of dollars and months of stress.

## Next Steps for North Carolina Freelancers

Freelancing offers freedom, but it also requires careful planning and ongoing compliance to avoid pitfalls. Here are actionable steps to protect your business:

1. **Review and Update Your Contracts** – Ensure they include critical clauses like IP ownership and termination terms.
2. **Conduct a Compliance Audit** – Check your tax filings, business registration, and licenses to ensure everything is up to date.
3. **Consult a Legal Professional** – Work with a North Carolina attorney who understands freelance and small business law. They can help you craft contracts, protect your rights, and stay compliant.

At North Carolina Legal Services, we''re here to support freelancers in navigating the legal complexities of their businesses. [Schedule a consultation today](/schedule) to take the first step toward securing your freelance career.

[![Schedule a Consultation with North Carolina Legal Services](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e47c24ad39e5089d7d79.webp ''Schedule a Consultation with North Carolina Legal Services'')](/schedule)',
  'Navigate the legal landscape of freelancing in North Carolina with confidence. Learn essential contract elements, compliance requirements, and best practices to protect your business and ensure long-term success.', 'Legal Services', '["Legal Services","Business Law","North Carolina","Freelancing"]', 'published',
  'user-ncls-blawby', 'asset_ncls_media_north-carolina-legal-services-freelancer-contract-law_2bd6b781',
  '2025-02-02T00:00:00.000Z',
  '2025-02-02T00:00:00.000Z', '2025-02-02T00:00:00.000Z', 'Navigate the legal landscape of freelancing in North Carolina with confidence. Learn essential contract elements, compliance requirements, and best practices to protect your business and ensure long-term success.', 'Freelance contracts, Business compliance, North Carolina business law, Independent contractor rights, Intellectual property protection, Business insurance, Self-employment taxes, Legal compliance, Contract templates, Business protection',
  '/article/protecting-your-freelance-business-in-north-carolina-contracts-compliance-and-best-practices', NULL
),
(
  'blog_ncls_the-legal-needs-of-small-businesses-in-north-carolina', 'org-ncls-blawby', 'site-ncls-blawby',
  'The Legal Needs of Small Businesses in North Carolina', 'the-legal-needs-of-small-businesses-in-north-carolina', 'Approximately [20% fail within one year](https://www.chamberofcommerce.org/small-business-statistics/), and half fail within the first five years. Additionally, it is estimated that nearly 600,000 businesses close each year.

Many of the roadblocks that small businesses face could be avoided or effectively addressed with help from a business attorney. Some of the [most common reasons that small businesses fail](https://www.chamberofcommerce.org/small-business-statistics/) are a lack of adequate management, poor business models and infrastructure, and insufficient startup capital. Obtaining legal counsel throughout the various stages of operation can make a significant difference in the success and longevity of a business.

> An attorney can help your small business with alternative dispute resolution, business entity formation, regulatory compliance, contracts, partnership agreements, and much more.

When you have the guidance you need to help you navigate a competitive market and challenging startup process, your chances of success improve exponentially.

## Alternative Dispute Resolution

Alternative dispute resolution, or ADR, is a way for disagreeing parties to resolve their conflict without court involvement. Mediation and arbitration are popular options for business disputes because the processes take less time and money than litigation. Plus, settling an issue using ADR is a collaborative effort that often allows parties to maintain a healthier business relationship than they would have had after litigating in court.

A small business attorney in North Carolina can represent you in ADR proceedings, enforce arbitration rulings, or appoint mediators and arbitrators for your dispute.

## Business Entity Formation

There are seemingly endless aspects of business startups. From choosing the appropriate business structure and completing formation documents to writing bylaws and operating agreements, the work of an entrepreneur never ends. For small business owners who either aren’t familiar with or don’t have time to handle all these tasks, the risk of failure is a real concern.

A business attorney is a valuable resource even before your business is fully up and running. A lawyer can clarify the pros and cons of different types of business structures, such as a limited liability company, sole proprietorship, limited partnership, and C-corporation, and help [get a business registered properly](https://www.sosnc.gov/Guides/launching_a_business/register_your_business). Many entrepreneurs also leverage an attorney’s knowledge of federal, state, and local regulations regarding permits, licenses, registrations, and taxes.

## Regulatory Compliance

Depending on the type of business you are operating, there may be extensive state and federal requirements and laws that dictate how you start and maintain your company. Some businesses must comply with securities laws, for example, or FDA regulations. Additionally, there are often annual reports and corporate records that must be provided periodically. Regardless of the industry, a business attorney will help you identify and comply with the applicable regulatory requirements.

## Contracts

Contracts are an inescapable and integral part of running a business. This is an area that many entrepreneurs think they can handle on their own. With a little help from online templates, you can have an effective contract, right? Probably not.

> There is no one-size-fits-all when it comes to business contracts. The needs of each company are unique, so a boilerplate template is unlikely to be effective.

Consulting a lawyer allows you to explain your business, needs, and goals so that they can create a personalized contract for your company. An attorney can draft, review, and negotiate contracts and business agreements so you don’t have to worry whether something is missing, incorrect, or unnecessary.

[![Schedule a Consultation with North Carolina Legal Services](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e47c24ad39e5089d7d79.webp ''Schedule a Consultation with North Carolina Legal Services'')](/schedule)

## Partnership Agreements

If you do not own or operate your business alone, you will need some sort of partnership agreement to clearly define the roles and responsibilities of each partner. This includes ownership, management structure, dispute resolution processes, profit and loss sharing, decision-making responsibilities, and dissolution procedures.

## Other Ways a Business Attorney Can Help You

Intellectual property (IP) protection is another common area of concern for business owners. Intellectual property is an intangible asset that is a [creation of the mind](https://www.uschamber.com/intellectual-property/intellectual-property-businesses-guide). You may want to consider IP protection for your logo, slogan, recipes, processes, or designs.

What happens when clients or customers do not pay you for the services or goods you provided? Collecting past due bills is an arduous process and another task that a business attorney is well-suited to complete. When your business is owed money, your lawyer can draft and send demand letters for non-payment.

Businesses with physical offices, warehouses, or storefronts must also navigate real estate and leasing processes, which can be overwhelming without guidance from someone with experience in this area.

An experienced business attorney also provides services like:

- Representation during contract negotiations

- Audit assistance

- Contract drafting and advice

- Litigation

Consulting with an attorney is something any business owner should do in order to mitigate risks and create a solid foundation for success. [North Carolina Legal Services](/services/small-business-and-nonprofits) helps clients in North Carolina achieve success in their business ventures by handling the red tape and legal aspects so they can focus on running their business. If you work as a freelancer or independent contractor, see our detailed guide on [protecting your freelance business in North Carolina](/article/protecting-your-freelance-business-in-north-carolina-contracts-compliance-and-best-practices). Contact us to schedule a consultation and learn more about how we can help you.',
  'Small businesses are a vital part of every community’s economic and social health. Despite their importance, small businesses often struggle to succeed.', 'Legal Services', '["Legal Services","Business","North Carolina"]', 'published',
  'user-ncls-blawby', 'asset_ncls_media_the-legal-needs-of-small-businesses-in-north-carolina_d4d447c9',
  '2024-05-19T00:00:00.000Z',
  '2024-05-19T00:00:00.000Z', '2024-05-19T00:00:00.000Z', 'Small businesses are a vital part of every community’s economic and social health. Despite their importance, small businesses often struggle to succeed.', 'Small business failure rates, Business attorney assistance, Legal counsel for startups, Alternative dispute resolution (ADR), Mediation and arbitration, Business entity formation, Regulatory compliance, Business contracts, Partnership agreements, Intellectual property protection, Debt collection, Real estate and leasing, Contract negotiations, Litigation services, Business success strategies',
  '/article/the-legal-needs-of-small-businesses-in-north-carolina', NULL
),
(
  'blog_ncls_understanding-the-legal-process-preparing-for-court-without-a-lawyer', 'org-ncls-blawby', 'site-ncls-blawby',
  'Understanding the Legal Process: Preparing for Court Without a Lawyer', 'understanding-the-legal-process-preparing-for-court-without-a-lawyer', 'Most people who walk into a North Carolina courtroom without a lawyer are not there by choice. They are there because hiring an attorney was not an option—or because their case seemed simple enough to handle alone. Either way, the courtroom does not adjust its expectations. The rules, the procedures, the language—all of it applies to you the same way it applies to a lawyer who has done this hundreds of times.

Here''s what that actually means: judges in North Carolina will give you some leeway as a self-represented party, but they cannot give you legal advice from the bench, and they cannot ignore the rules on your behalf. If you miss a filing deadline, your case can be dismissed. If you bring the wrong documents, the judge may not be able to consider your evidence. If you don''t know how to object, the other side''s attorney can present things that shouldn''t be in front of the judge—and you won''t know it happened.

That is not meant to scare you out of representing yourself. It is meant to make clear that preparation is the difference between walking in ready and walking in hoping it works out. This guide covers what you need to do before your court date so that when you stand up and speak, you are presenting a case—not just telling your story.

## Know What Kind of Case You Have

The type of case determines the court you will be in, the rules you must follow, the legal claim you are making, and what the judge can do for you. Small claims courts handle disputes up to $10,000—many landlord/tenant matters, property damage claims, and debt collection cases land here. District court hears family law situations like custody, child support, or protective orders, while District criminal court handles misdemeanor charges. Each track runs on its own process: small claims is informal and fast, family law sprawls over months, and criminal matters carry constitutional protections that change how everything works.

Before doing anything else, answer these three questions clearly: What court is my case in? What specific legal claim or charge am I facing? What facts do I need to prove or disprove to win? If you cannot answer those, you are not ready to step into the courtroom—start here, because everything else builds on this foundation.

## Understand What You Need to Prove

Every case has a standard for how convincing your evidence must be. Most civil cases in North Carolina use preponderance of the evidence, which means your facts only need to tip the scale slightly in your favor—show that your version is more likely true than not. Criminal cases demand a much higher bar: beyond a reasonable doubt. Representing yourself in a criminal matter is risky; if at all possible, get legal representation, because a conviction impacts employment, housing, custody, and freedom.

For civil matters, sit down and write: what facts must the judge believe, and what documents, photos, messages, or witnesses prove each one? Fact by fact, list the supporting evidence. Judges will not credit what lacks proof, no matter how true it feels.

## Get Your Documents Ready—All of Them

Courts run on paperwork. The single biggest mistake self-represented parties make is having the right story and the wrong paperwork. Collect everything relevant: contracts, leases, texts, emails, photos, medical records, pay stubs, receipts, inspection reports, police reports—whatever applies. Do not edit early; gather first, then organize.

Make three copies of everything: one for you, one for the judge, one for the opposing party. If you hand the judge a document without giving the other side a copy, the judge will likely refuse to read it. North Carolina courts expect both sides to see and respond to every piece of evidence.

Organize chronologically, label or tab so you can quickly point to “page 12 of my packet,” and prepare your exhibits ahead of time. Every document you plan to show—photos, texts, contracts—should be printed, labeled (Exhibit A, Exhibit B), and ready. If evidence lives on your phone, print the full thread with timestamps instead of planning on showing the judge your screen.

## Know the Deadlines That Can End Your Case

North Carolina courts enforce deadlines. Miss one and you may lose your right to respond, present evidence, or even keep your case alive.

- If you were served with a complaint, you usually have 30 days to file a written answer. Miss that window and the court can grant a default judgment simply because you did not respond.
- If you are the one filing, confirm the statute of limitations for your claim—personal injury typically has three years, contract disputes have their own timelines. File after the clock runs out and the court will dismiss your case before it starts.
- If you have a hearing, call the clerk or check online to confirm the date. Hearings move, and you may not receive notice of every change.

## Learn How to Present Yourself

This is not about theatrics—it''s about removing distractions so the judge focuses on your case.

- Address the judge as “Your Honor.” Stand when speaking. Sit when you are not presenting. When in doubt, stand.
- Dress like you are going to a job interview: clean, simple, professional, with no large logos or slogans.
- Do not interrupt. Write down points you want to respond to and wait for your opportunity. Interrupting damages credibility more than any argument the other side makes.
- Check your court''s phone policy before the hearing. If phones are prohibited, have your evidence printed as a backup.

## Practice What You Are Going to Say

You will likely have limited time and attention. In small claims, you may only get 15–20 minutes total. The judge will not sit through your entire history—give the short version that connects the facts, the law, and what you are asking the judge to do.

Structure it simply: what happened, why it was wrong (which law or agreement was violated), the evidence you have, and what remedy you want. Practice out loud, time yourself, and cut anything longer than five minutes. Lead with your strongest facts—the judge can ask follow-up questions.

Consider what the other side will say. What are their best arguments? What facts will they emphasize? What will they say about your evidence? Prepare responses to the three strongest obvious points so the surprises are minimized.

## Know When Self-Representation Reaches Its Limit

There is no shame in representing yourself, and there is also no shame in recognizing when you need help. If your case involves complex legal issues, significant money, child custody, or criminal charges that carry jail time, the stakes are high enough that even limited help can change the outcome.

Many attorneys, including our team at North Carolina Legal Services, offer limited-scope representation—reviewing documents, advising on strategy, or helping you prepare without taking over the whole case. That middle ground exists and is worth exploring before your court date.

If any of this feels overwhelming, or if you are not sure whether your case is one you can handle alone, [schedule a consultation here](/schedule). Before your appointment, see our guide on [how to prepare for your legal consultation](/article/preparing-for-your-consultation) to make the most of your time. A conversation about your case is not a commitment to hiring a lawyer—it is a way to find out what you are actually facing and what your options are.

If you work with people navigating the court system—advocates, case managers, social workers, or community organizers—please share this guide. The people who need it most are often the ones with the least access to legal information before their court date.',
  'Imagine you''re sitting in a courtroom. The attorneys up front are shuffling papers, reviewing notes, preparing to present arguments they''ve spent hours crafting. Then someone walks in alone. They''re wearing their Sunday best. They don''t have a legal pad or a file folder with tabs—they have a phone full of screenshots and a stack of papers they printed last night. They have a good case, they may even be in the right. But they have a full life, and they could not afford an attorney. So they took time off work to be here. They may have missed their kid''s baseball game or gymnastics meet just to prepare. I''ve watched this play out more times than I can count—it is why I started this firm.', 'Legal Services', '["Legal Services","North Carolina"]', 'published',
  'user-ncls-blawby', 'asset_ncls_media_representing-yourself-in-court-north-carolina_d67a2b49',
  '2024-07-26T00:00:00.000Z',
  '2024-07-26T00:00:00.000Z', '2026-03-03T00:00:00.000Z', 'Imagine you''re sitting in a courtroom. The attorneys up front are shuffling papers, reviewing notes, preparing to present arguments they''ve spent hours crafting. Then someone walks in alone. They''re wearing their Sunday best. They don''t have a legal pad or a file folder with tabs—they have a phone full of screenshots and a stack of papers they printed last night. They have a good case, they may even be in the right. But they have a full life, and they could not afford an attorney. So they took time off work to be here. They may have missed their kid''s baseball game or gymnastics meet just to prepare. I''ve watched this play out more times than I can count—it is why I started this firm.', 'represent yourself in court, pro se legal advice, self-representation in court, understanding court procedures, court filing deadlines, legal terminology basics, gathering legal documents, organizing court evidence, filing court pleadings, preparing court arguments, courtroom etiquette tips, presenting legal case, standard of proof in civil cases, seeking limited legal advice, preparing for court outcomes, self-representation challenges, legal process patience, benefits of legal consultation, North Carolina legal services, pro se litigant resources, north carolina court preparation, small claims procedure, district court practice, criminal and civil standards, evidence organization strategy, statute of limitations awareness, limited scope representation, courtroom presentation skills, professional courtroom etiquette, north carolina legal consultation',
  '/article/understanding-the-legal-process-preparing-for-court-without-a-lawyer', NULL
),
(
  'blog_ncls_when-schools-fail-to-follow-the-iep-what-north-carolina-parents-can-do', 'org-ncls-blawby', 'site-ncls-blawby',
  'When Schools Fail to Follow the IEP - What North Carolina Parents Can Do', 'when-schools-fail-to-follow-the-iep-what-north-carolina-parents-can-do', '**Advocating for Your Child’s Education in North Carolina — Blog Series, Part 2**

In our [last post](/article/iep-violations-in-north-carolina-how-to-recognize-them-and-protect-your-childs-rights) we covered common legal violations in the special education evaluation and eligibility process. Now, let’s explore what happens after your child’s Individualized Education Plan (IEP) is created—and what you can do if schools fail to implement the plan, discipline your child unfairly, or exclude you from decisions.

This post stands on its own. Whether you’ve read Part 1 or not, you’ll learn about your rights and how to enforce them.

---

## 1. What to Do When Your Child’s IEP Isn’t Followed

Your child’s IEP isn’t something that their school is doing to be nice—it is a legally binding document, required by our State Constitution. When your child’s school fails to follow the IEP, they are violating your child’s civil rights.

### Legal Requirements

For your child’s school to be in compliance with IEP requirements under federal and state law, they must:

1. Provide all services exactly as described in your child’s IEP; and
2. Use qualified, trained personnel to provide those services.

### Common Violations

Unfortunately, many schools fail to meet these obligations. Some frequent problems we see are:

- Failing to provide required services, such as speech or occupational therapy services.
- Not providing the required services through a qualified professional, often by substituting a trained specialist with someone who lacks the specialized skills necessary to deliver essential services like speech therapy, occupational therapy, or individualized behavioral support.
- Providing required accommodations inconsistently or incompletely.

### What You Can Do

If your child’s school is not fully implementing their IEP, there are simple steps you can take to help get things back on track:

1. Document every missed service and notify the school in writing immediately;
2. Request that the school provide makeup services (compensatory education) to correct their mistakes and shortfalls;

If the school does not address your complaint and get into compliance with the IEP, contact an attorney promptly to discuss next steps—we can help.

---

## 2. What to Do if Your Child with Disabilities Gets into Trouble at School

Is your child being disciplined at school because of behavior related to their disability? That''s not just frustrating—it''s wrong. Children in the United States have rights under federal law that protect them against unfair discipline for behavior related to their disabilities.

Before schools can suspend or expel a child with an IEP for extended periods, they have to follow a process put in place to protect your children’s rights.

### Legal Requirements

The Individuals with Disabilities Education Act (IDEA) provides specific protections for students with disabilities regarding discipline:

- If a student with disabilities is suspended for 10 or more days in a single school year, their school must follow a specific process to determine if a student’s behavior is linked to their disability—this process is called a Manifestation Determination Review (MDR).
- If the behavior is linked to their disability, the school cannot suspend or expel students for behavior directly caused by, or significantly related to, their disability.
- Unfortunately, schools sometimes try to skip or rush through this process—especially if a child''s behavior is challenging—because it''s easier for them to remove the child from school rather than provide the required supports.

[![Schedule a Consultation with North Carolina Legal Services](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e47c24ad39e5089d7d79.webp)](/schedule)

### Common Violations

Despite clear legal protections, schools often make serious mistakes when disciplining students with disabilities. Common issues include:

- Failing to conduct an MDR after the required 10 days of suspension.
- Incorrectly determining that a student''s behavior is unrelated to their disability, without clear evidence.
- Failing to provide necessary educational services during suspensions, leaving students behind academically.

### What You Can Do

If your child faces disciplinary actions such as repeated suspensions or a potential long-term suspension:

- Demand a MDR meeting. During this meeting, the school must determine whether the behavior is related to your child''s disability.
- Request an updated Functional Behavior Assessment (FBA) and a revised Behavior Intervention Plan (BIP) to address the underlying issues.
- If the school refuses or fails to comply with these requirements, consider speaking to a special education attorney about what you should do next. Getting legal guidance first can help ensure the best possible outcome.

---

## 3. Lack of Parental Participation: You Must Be Heard

Your voice matters—especially when it comes to protecting your child’s right to a Free Appropriate Public Education. Federal law (IDEA) explicitly guarantees your right to meaningful participation in decisions about your child’s education.

To make sure you can help your child, federal law gives you the power to make a difference, and schools have to make sure you are given the ability to have meaningful participation in the process of determining and protecting your child’s needs. Unfortunately, many schools fall short of fully involving parents, but you have the power to make sure they don’t cut you out.

Schools must respect your rights at every stage—from scheduling meetings to deciding critical educational issues. When schools fail to involve you properly, they''re not just ignoring best practices—they''re breaking the law.

### Legal Requirements

Federal law, specifically IDEA, clearly outlines the responsibilities of your child’s school when it comes to your enabling your participation. Specifically, schools must:

- Include parents as equal and meaningful participants in all IEP meetings and decisions.
- Make it possible for you to attend IEP meetings by ensuring that they are scheduled at times you can attend.
- Provide qualified interpreters if you need language assistance during meetings or to help you review documents.
- Offer Prior Written Notice (PWN) before making any significant changes to your child''s education plan, and they must clearly explain those changes.

### Common Violations

Despite all of this, schools can make mistakes or take actions that limit your involvement or that even exclude you altogether. Common violations include:

- Holding meetings without parents present or making important decisions without meaningful input from parents.
- Failing to provide adequate interpretation or translation support for parents who need that support—this is not optional, a language barrier does not negate your rights as a parent.
- Making important decisions before discussing them with you. This is known as "predetermination," and it makes your participation less meaningful, undermining your rights as a parent.

### What You Can Do

Being a parent can be hard—your child’s school cannot make it harder by cutting you out of making important decisions that impact your child’s education. If your right to meaningful participation has been violated or ignored, consider taking these steps:

- If decisions were made before your IEP meeting or if something happened that made your participation more difficult or less meaningful: Request another IEP meeting immediately. The school has no choice but to respect your right to participate in your child’s education.
- If the school makes changes to your child’s education plan that you disagree with or aren’t sure about: Demand Prior Written Notice. They must explain why those changes were made and support their decisions with data.
- If the school refuses or if they continue to exclude you from decision-making: Consult with a special education attorney. Knowing your rights and the rights of your child isn’t enough—we can help you take action to protect and enforce them by helping you understand all of your options.

---

## 4. Reimbursement Rights: What the Law Covers (and Doesn’t)

When schools fail to provide required special education services, working families are often faced with a difficult question: Can I afford to help my child?

At North Carolina Legal Services, we’re committed to making sure that when the education system fails your family, the justice system won’t.

We do this in three ways:

1. We offer income-based discounts for legal services and representation, trying to bridge the gap between free legal services that are often hard to qualify for and traditional firms, which often charge more than $400 per hour.
2. We’ll do our best to work with you on a payment plan that you can afford, rather than requiring the full cost of your case up-front, as most law firms do.
3. We’ll fight to make sure that you are reimbursed for the costs associated with enforcing your child''s special education rights, including independent evaluations and private services when justified. We believe you shouldn’t have to spend your hard-earned money to make your child’s school follow the law.

The law provides certain avenues for recovering expenses related to IEP violations, but not all expenses are eligible—knowing what qualifies and how to get reimbursed is critical.

### Legal Requirements

You can to seek reimbursement in these specific situations if:

- You disagree with the school''s evaluation of your child, or if you believe it was incomplete or inadequate, you may have the right to seek reimbursement for an Independent Educational Evaluations (IEE).
- Your public school district failed to provide a Free Appropriate Public Education, you might be able to be reimbursed for private school tuition or specialized private services.
- You prevail at trial the law allows reimbursement of attorney’s fees.

### What You Can Do

If you think you might need take action to correct the school''s failure to meet its legal obligations, meet with an attorney. We can help you come up with a strategy that meets your child’s needs and your family’s budget. This could mean providing you with full representation throughout the process, or it could mean helping you represent yourself.

It’s always better to meet with an attorney early in the process, rather than waiting—making decisions without legal guidance may limit your ability to recover expenses later.

---

## 5. Addressing Systemic Problems: You’re Not Alone

If your child’s IEP isn’t being followed, other families may be experiencing similar difficulties. Systemic issues—like staffing shortages, inadequate training, or widespread non-compliance—can impact many students at once.

### What You Can Do

Contact advocacy groups such as Disability Rights North Carolina or the Office for Civil Rights (OCR), which can investigate broader patterns and push for lasting solutions. If you know other families are having similar problems, they may help you file a systemic complaint with the North Carolina Department of Public Instruction.

---

## Conclusion: Empowerment Through Knowledge

When schools fail their obligations, you have the law on your side—you have the power to protect your child’s rights. If you don’t know how, we can help.

At North Carolina Legal Services, we help families navigate and resolve challenges like these every day. You are not alone. Learn more about our [special education and IEP advocacy services](/services/special-education-and-iep-advocacy), or explore our comprehensive guide on [7 common IEP violations every NC parent should recognize](/article/7-common-iep-violations-every-north-carolina-parent-should-recognize-and-how-to-fight-back).

[![Schedule a Consultation with North Carolina Legal Services](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e47c24ad39e5089d7d79.webp)](/schedule)',
  'Learn what to do when your child''s IEP isn''t followed, how to handle unfair discipline, and how to ensure your voice is heard in your child''s education. North Carolina Legal Services is here to help.', 'Special Education', '["Special Education","Family Law","North Carolina"]', 'published',
  'user-ncls-blawby', 'asset_ncls_media_iep-north-carolina-legal-services-2_73252e09',
  '2025-05-14T00:00:00.000Z',
  '2025-05-14T00:00:00.000Z', '2025-05-14T00:00:00.000Z', 'Learn what to do when your child''s IEP isn''t followed, how to handle unfair discipline, and how to ensure your voice is heard in your child''s education. North Carolina Legal Services is here to help.', 'IEP implementation failures, Special education discipline rights, Parental participation in IEP, Reimbursement for special education services, Systemic issues in special education, Manifestation Determination Review, Compensatory education, Prior Written Notice, Free Appropriate Public Education, Special education advocacy, North Carolina legal services, IEP compliance, Special education law, Parent rights in education, Disability rights in schools, Special education attorney, IEP meeting rights, Special education services, Education law, Parent advocacy',
  '/article/when-schools-fail-to-follow-the-iep-what-north-carolina-parents-can-do', NULL
),
(
  'blog_ncls_writing-your-own-will-how-it-works', 'org-ncls-blawby', 'site-ncls-blawby',
  'Last Will and Testament in North Carolina: A Complete Guide', 'writing-your-own-will-how-it-works', '## What is a will?

First, it’s important to understand what a will is. There are numerous estate planning documents that are used for various reasons, so knowing what the purpose of a will is can help point you in the right direction to get started creating one.

In North Carolina, a last will and testament is a legal document that allows you to decide what will happen to your property after you pass away. It’s not intended for healthcare or financial decisions while you are still alive, although there are separate estate planning documents for those purposes. A will is used to do the following:

- Designate an executor (this is the person who will manage your final affairs and wrap up any existing debts to be paid.

- List your assets (assets can include personal belongings, real estate, and financial accounts)

- Name your beneficiaries (the people who will inherit your property)

- Allocate which assets will pass to which beneficiaries (including friends, family, schools, and charitable organizations)

- Choose a guardian for your minor children (in case the other parent also passes away or is otherwise unable to have custody. You will still have to pursue an official custody order in court.

## What is an example of a valid will?

There isn’t a scripted version of a will that you are required to use, but it’s always a good idea to incorporate clear language to avoid confusing language in any legal document. If there is any unclear or subjective language, your will may be declared invalid and family members may contest the will, or your wishes may not be followed. Plus, if any crucial elements are missing, the will may be deemed invalid, and it won’t serve the intended purpose.

Anyone who is of [sound mind and at least 18 years old](https://www.ncleg.gov/enactedlegislation/statutes/pdf/bysection/chapter_31/gs_31-1.pdf) may make a will in North Carolina.

It is strongly suggested that you consult with an estate planning attorney when wanting a will prepared. However, legal services aren’t an option for everyone, so consider the following steps as a guideline for getting started with your will:

- Take inventory of your assets (list them and their locations)

- Determine if any of your assets are non-probate assets. Non-probate assets are things like insurance, stock, annuities or other policies where you have pre-designated a beneficiary or beneficiaries.

- Choose beneficiaries for all of your property that requires you to provide a name and/or address.

- Name an executor. You should also name an alternate in case your first choice is unavailable for any reason.

- Designate a guardian for minor children . You should also designate an alternate for this.

If you plan on using a will template or typing your will, make sure to follow the legal requirements of attested written wills by signing the document in front of two competent witnesses and having them sign, as well. You aren’t required to type your will, however, because North Carolina accepts [three basic types of wills](https://www.ncleg.net/EnactedLegislation/Statutes/PDF/ByChapter/Chapter_31.pdf) – attested written wills, holographic wills, and nuncupative wills.

An attested written will is signed by the testator and by two competent witnesses. Notarization is not required for basic validity; it is used to make the will self-proved under N.C.G.S. § 31-11.6. A holographic will is handwritten and signed by the person to whom the will belongs, known as the testator. No witness signatures are required for a holographic will.

In some situations a person in North Carolina can have an oral or spoken will that is legally binding, also known as a nuncupative will. There are a few restrictions on this type of will, and it really should only be used in situations where the testator is unable to create a written or holographic will — these are valid when the testator is facing an imminent risk of death. The testator must state that it is their will and have two people bear witness to the oral will, and they must write down the testator’s instructions as soon as possible after they are given. Please also note that this type of will is never valid will exists, no matter what the intentions of the testator.

## What are non-probate assets?

Not all assets need to be included in your will. [Non-probate assets](https://www.nccourts.gov/help-topics/wills-and-estates/estates) don’t need to be included because they aren’t required to pass through estate administration or probate.

> Probate is the legal process of settling an estate and includes submitting the original will to the clerk of court for certification, having the named executor appointed and take control of managing the assets of the estate. This will include collecting and distributing assets.

Many assets are considered probate assets, meaning they must go through the estate administration process in order to be passed to the appropriate beneficiary. However, North Carolina may classify the following property as non-probate assets in certain scenarios:

- Life insurance policies

- Bank accounts

- Retirement benefits

- Investment funds

- Trusts

Some accounts allow you to name a beneficiary with the financial institution or establish transfer-on-death terms, in which case you will likely not need to include those assets in your will.

[![Schedule a Consultation with North Carolina Legal Services](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e47c24ad39e5089d7d79.webp ''Schedule a Consultation with North Carolina Legal Services'')](/schedule)

## What is the difference between a will and a simple will?

The complexity of the estate planning process is often cited as a reason people procrastinate in creating a will. If this has been stopping you from starting this process, you have the option to create what’s known as a simple will. This legal document is a pared-down version of a complex will and is often best suited for testators with no dependents and few assets.

Simple wills are sufficient for many people, but knowing which one is right for you can be difficult without a thorough understanding of estate and probate law. If you’d like to discuss which type of will is the best option for you, [contact North Carolina Legal Services](https://www.northcarolinalegalservices.org/contact).

## FAQs About Wills in North Carolina

### When is the best time to make a will?

Aside from the legal requirement that you must be 18 years old or older to make a will, there are no age restrictions. Many people wait until they’re older to start thinking about estate planning, but this is a mistake. There is no way to predict when you will need to have an estate plan in place, so starting earlier is usually recommended. If you don’t already have a will, the best time to make one is now.

### Is a living will the same thing as a will?

No, a will and a living will are two very different things. In North Carolina, an [Advance Directive for a Natural Death](https://www.sosnc.gov/documents/forms/advance_healthcare_directives/advance_directive_for_a_natural_death.pdf) is more commonly referred to as a living will. A living will is used to designate how you want certain healthcare decisions to be made if you are unable to make them yourself. For example, if you are unconscious and doctors are uncertain when you will awaken, a living will can be used to inform the medical staff of your life support choices.

### Can I have a trust and a will in North Carolina?

Yes, you can create both a trust and a will. While these estate planning instruments serve some similar purposes, there are distinct differences. Most trusts do not pass through probate, while wills must go through probate to be determined valid. Trusts are complex but offer various benefits that wills do not. If you think your estate would benefit from establishing a trust, you may wish to speak with an attorney about the advantages and disadvantages of this option.

### Is a handwritten will good enough?

Handwritten wills might be considered valid if they are written completely by the testator. Additionally, the testator must either [sign or write their name on the will](https://www.ncleg.net/EnactedLegislation/Statutes/PDF/ByChapter/Chapter_31.pdf). One concern with handwritten wills is the increased risk of disputes, but North Carolina does accept this type of will if it meets the statutory requirements.

### Are online wills legitimate?

When you use an online template for your will, you run the risk that required provisions or important terms will be missing. With that being said, online wills may be valid in some situations. It’s important to note that North Carolina requires wills to be signed by the testator and two competent witnesses in order to be legitimate. So, if you use an online will, you cannot simply fill out the template and save a digital version; it must be printed, signed, and witnessed according to state law.

### Do you need an estate lawyer when creating a will?

North Carolina does not require you to work with an attorney to create your will. However, having a lawyer to help you navigate the complex estate planning and probate laws is beneficial. Our [North Carolina estate planning attorneys](/services/probate-and-estate) are client-focused and dedicated to lowering the barrier to quality legal services. Contact us today to schedule a consultation.',
  'Learn how to create a valid last will and testament in North Carolina — requirements, witnesses, what happens without one, and when to hire an attorney from a North Carolina estate planning lawyer.', 'Legal Services', '["Legal Services","Family","North Carolina"]', 'published',
  'user-ncls-blawby', 'asset_ncls_media_writing-your-own-will-how-it-works_c1f1ad9b',
  '2024-02-07T00:00:00.000Z',
  '2024-02-07T00:00:00.000Z', '2026-04-09T00:00:00.000Z', 'Learn how to create a valid last will and testament in North Carolina — requirements, witnesses, what happens without one, and when to hire an attorney from a North Carolina estate planning lawyer.', 'Writing a Will in NC, How to Write a Will Yourself, DIY Will Writing, North Carolina Will Requirements, Estate Planning in North Carolina, Legal Requirements for Wills in NC, Drafting Your Own Will, Do-It-Yourself Legal Wills, How to Distribute Assets in a Will, NC Estate Law Basics, Protecting Your Estate NC, Self-Written Will Legality in NC, Wills and Trusts NC, Personal Assets Distribution NC, Last Will and Testament Guide NC, Avoiding Probate in North Carolina',
  '/article/writing-your-own-will-how-it-works', NULL
),
(
  'blog_ncls_your-landlord-cannot-evict-you-without-a-court-order-heres-what-to-do-when-they-try', 'org-ncls-blawby', 'site-ncls-blawby',
  'Your Landlord Cannot Evict You Without a Court Order — Here''s What to Do When They Try', 'your-landlord-cannot-evict-you-without-a-court-order-heres-what-to-do-when-they-try', 'Here''s the reality: your landlord cannot do this. Not legally. Not in North Carolina. The only person who can physically remove you from your home is a sheriff executing a Writ of Possession after a court process. Everything else—changing locks, cutting utilities, removing doors, hauling your belongings to the curb—is an illegal self-help eviction. North Carolina courts have consistently held that landlords cannot bypass the summary ejectment process in Chapter 42 of the General Statutes, and for many residential tenancies, the Residential Rental Agreements Act adds further protections.

That does not mean it will not happen. Landlords do it because most tenants do not know the law is on their side. You do now. Learn more about our [tenant rights legal services](/services/tenant-rights) and how we can help you fight back. This guide walks you through what to do in the first hour, how to build a record that protects you, and what the actual legal eviction process looks like so you can tell the difference between a lawful proceeding and an illegal power play.

## What Counts as an Illegal Eviction

North Carolina law is clear—a residential tenant can only be removed through the court procedures in Chapter 42 of the General Statutes. That means:

- **Changing your locks, adding a padlock, or blocking your entry is illegal**—your landlord cannot do this, and neither can their maintenance crew or property manager.
- **Utility interference to force a tenant out is illegal**—your landlord cannot shut off water, power, or gas to pressure you into leaving.
- **Removing doors, windows, or making the unit uninhabitable is illegal.** Making your home unlivable to drive you out is constructive removal.
- **Moving or removing your belongings is illegal** when done to force you out.

The only lawful path for a landlord to remove a tenant is by getting a court order and Writ of Possession, then requesting the Sheriff''s office to execute it. Nobody else can remove you. Not the landlord, not the property manager, not a locksmith they hired.

If what is happening to you right now does not involve a sheriff with a writ, you have the law on your side.

This is an illegal eviction in North Carolina, and tenant rights in North Carolina protect you from these self-help tactics.

## Can a Landlord Evict You Without a Court Order in North Carolina?

No. Under North Carolina eviction law, a landlord cannot remove a tenant without first filing a **summary ejectment** case in court and obtaining a **Writ of Possession** executed by the sheriff.

Actions like changing the locks, shutting off utilities, removing doors, or blocking entry are called **self-help eviction** and are illegal in North Carolina.

## What If My Landlord Changed the Locks in North Carolina?

If your landlord changed the locks, added a padlock, or blocked your entry without a court order, it is an **illegal lockout**. North Carolina law does not allow landlords to lock tenants out of their homes without the eviction process going through court.

## What to Do Right Now

If you believe your landlord has taken illegal action to pressure you to move out, this section is for you. Stay calm and start collecting evidence. What you do in the next few hours could make all the difference.

### Quick Reference: Is What Your Landlord Did Legal?

| What your landlord did                                                                    | Is it legal in North Carolina?                                                                                                                                                             |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Changed your locks, added a padlock, or blocked your entry                                | Changing locks to force a tenant out is illegal in North Carolina. Landlords cannot lock you out of your home without a court order and a Writ of Possession executed by the sheriff.      |
| Shut off water, power, or gas to pressure you to leave                                    | Shutting off utilities to force a tenant out is illegal in North Carolina. Landlords cannot interfere with your water, power, or gas as a way to make you leave.                           |
| Removed doors or windows, or made the unit uninhabitable                                  | Removing doors, windows, or making a rental unit uninhabitable to force a tenant out is illegal in North Carolina. This is considered constructive removal under state law.                |
| Moved or removed your belongings to force you out                                         | Removing a tenant''s belongings as part of a self-help eviction is unlawful in North Carolina. Only a sheriff executing a court-ordered Writ of Possession can oversee removal of property. |
| Went to court, obtained a judgment and Writ of Possession, and had the sheriff execute it | This is the only legal way to remove a residential tenant in North Carolina. A landlord must go through the summary ejectment court process and have the sheriff carry out the removal.    |

_If your landlord has broken the law, start documenting it immediately._

### Step 1: Document the situation immediately

Take photos and video of the new lock, the padlock, the blocked entrance, any posted notices, removed doors or windows. If utilities are off, video the faucets not running, the lights not working, the thermostat dead. Screenshot any utility portal showing the account status.

Save every text, email, and voicemail from the landlord or property manager—especially messages where they threaten you or tell you to move out by a certain date. Do not delete anything. Even messages that seem unimportant now may matter later.

Write down a quick timeline of your interactions from the day you signed your lease through the present. Include the date and time you discovered the lockout or shutoff, exactly what changed, who did it if you know, and whether anyone witnessed it.

### Step 2: Gather your proof of tenancy

You need to show you live there. Pull together whatever you have—your lease, rent receipts or payment screenshots, mail addressed to you at the property, an ID showing the address, photos of your belongings inside, and any payment records for rent or utilities.

**Send one written message to the landlord**

Keep it short and factual. Text or email—something timestamped:

> "On [date], you [changed the locks / shut off utilities / blocked
>
> > entry] at [address]. North Carolina law requires eviction through
> > court. Restore access and utilities immediately and confirm in
> > writing."

This message creates a record. Don''t argue, don''t threaten, don''t negotiate. The landlord has taken drastic action they almost certainly know is illegal. One message is enough. You have rights—you don''t need to argue about them. You need evidence that they were violated.

### Step 3: Call the police

You are not asking the police to take your side. This is about documentation. When you call, tell them you believe your landlord has engaged in illegal self-help eviction and that you would like to file an incident report. Stay calm.

If they ask to see evidence, do not hand them your phone—ask where you can email your photos, videos, and other evidence. If you haven''t been locked out and still have access to the inside of the home, speak with the police outside. If they enter your home without your permission, politely tell them you didn''t authorize entry and state that you will speak with them outside.

If they ask questions unrelated to your request, tell them you''re only participating in the investigation related to your home, and exercise your right to remain silent—tell them you are doing so.

Police sometimes tell tenants this is a "civil matter" and decline to act. That is frustrating, but it does not mean you are wrong or that the system has failed you. The officer may not know landlord-tenant law well. What matters is that you called and that the call is logged. Ask for the incident report number or the officer''s name and badge number before they leave. That record still helps you.

[![Schedule a Consultation with North Carolina Legal Services](https://media.krabiclaw.com/sites/site-ncls-blawby/media/imports/e47c24ad39e5089d7d79.webp)](/schedule)

## North Carolina Eviction Laws Tenants Should Know

North Carolina eviction laws require a landlord to file summary ejectment, attend court, obtain judgment, and then have the sheriff execute a writ before any physical removal can happen.

## What the Legal Eviction Process Actually Looks Like

The landlord does not get to decide when you leave—a judge does. If your landlord claims they "already evicted" you because they filed paperwork, set a deadline you missed, or for any reason other than having a Writ of Possession executed by the sheriff, they are wrong. Here is what the lawful process requires:

The landlord files a summary ejectment case in small claims court. You get served with papers, and an eviction hearing in North Carolina is held where both sides present their case. The judge or magistrate enters a judgment.

If the judgment is in the landlord''s favor, you still have the right to appeal and to remain in the home until the appeal window has passed or your appeal is resolved. Attempts by the landlord to remove you during this period are illegal.

If you were served with eviction papers, do not ignore them. The hearing is your chance to present your side. Bring your timeline, all your evidence, and be ready to explain your case. If you are representing yourself, you can [learn how the North Carolina eviction court process works](https://www.northcarolinalegalservices.org/article/understanding-the-legal-process-preparing-for-court-without-a-lawyer).

### How to Appeal and Staying in Your Home

If the magistrate rules against you, you have 10 days to appeal to district court. During that window, the landlord still cannot remove you—attempts to lock you out or shut off utilities during the appeal period are illegal, just as they would be at any other time.

To stay in the home while your appeal is heard, you will typically need to complete a Bond to Stay Execution through the clerk''s office. The bond amount is usually based on your rent—expect something in that range, though it can vary by county. This is the court''s way of ensuring the landlord is protected during the appeal. If you cannot afford the bond, ask the clerk about indigency options—the process varies by county, and clerks can tell you what forms apply locally. If you''re not sure what to ask for, contact North Carolina Legal Services before the 10-day window closes.

## When the Eviction Is Retaliation

If you requested repairs, reported code violations, complained about unsafe conditions, or exercised any tenant right shortly before the eviction threat—that timing matters. Under [N.C.G.S. § 42-37.1](https://www.ncleg.net/EnactedLegislation/Statutes/HTML/BySection/Chapter_42/GS_42-37.1.html), retaliatory eviction is a real legal defense, and it comes up more often than most tenants realize.

Example: you tell your landlord the heat has been broken for two weeks. Three days later, you get a notice to vacate. That sequence is not a coincidence—and the law recognizes that.

If this is your situation, preserve everything that connects your complaint to the landlord''s response. Repair requests and their dates. Inspection notices. Photos of the conditions you reported. Any messages that show the timeline from complaint to eviction threat. That chain of events is your defense.

## Leaving Voluntarily

If conditions become so bad that you feel you have no choice but to leave—no heat, no water, doors removed—that decision has legal consequences worth understanding. A tenant who leaves an uninhabitable unit may have a claim for constructive eviction, but that claim generally requires that you actually vacated because of the conditions. A tenant who stays and endures the conditions has a different set of claims—for habitability violations, for damages, potentially for unfair and deceptive trade practices—but the legal framing shifts.

Neither choice is wrong. But if you are weighing whether to stay or go, know that your decision affects the legal path forward. If you can, get legal advice before you leave.

### Start a Loss Log

If your landlord used self-help tactics, you may be entitled to recover actual damages under North Carolina''s ejectment statutes. But you have to prove what you lost—and the best time to start tracking is now, while the details are fresh.

Every time you spend money because of what your landlord did, write it down:

- **Hotel or temporary housing**—keep every receipt
- **Food spoilage**—photograph your fridge and freezer contents before you throw anything away
- **Transportation**—extra costs from being displaced
- **Storage**—anything you paid to secure your belongings
- **Missed work**—hours lost and your hourly or daily rate
- **Medication replacement**—pharmacy receipts for prescriptions you could not access
- **Phone and charging costs**—if you lost power for an extended period

Date every entry. Attach the receipt, photo, or screenshot. This is the document that turns disruption into a recoverable claim—and if your case goes to court, a detailed loss log is the difference between "my landlord caused me harm" and "here is exactly what that harm cost."

## Frequently Asked Questions About Illegal Evictions in North Carolina

**Can my landlord evict me without going to court?**

_No. In North Carolina, the only lawful way to remove a residential tenant is through the court process—called a **summary ejectment**—ending with a sheriff executing a **Writ of Possession**. Anything else is illegal self-help eviction, no matter what reason the landlord gives._

**How long does an eviction take in North Carolina?**

_The timeline varies, but a lawful eviction is never instant. The landlord files in small claims court, you get served and a hearing is scheduled, a judge or magistrate enters a judgment, and then there is generally a 10-day appeal window before a writ can be executed. From filing to physical removal typically takes weeks at minimum—not hours or days. If your landlord is telling you to leave today, they are not following the legal process._

**What should I do if my locks were changed while I was out?**

_Treat it as an illegal lockout. Take photos of the new lock or padlock and any posted notices. Save all messages from the landlord. Send one short written message requesting immediate restoration of access. Call the police to file an incident report. The full step-by-step is in the What to Do Right Now section above._

**What if my landlord shut off water, power, or gas to make me leave?**

_This is an illegal self-help eviction tactic. Video the utilities not working, screenshot any utility account status, and save all communications from the landlord. Start a Loss Log immediately—track every cost the shutoff causes (hotel, food spoilage, missed work). Then follow the documentation and reporting steps above._

**The landlord says they "already evicted" me because they filed paperwork. Is that true?**

_No. Filing a case is not removal. A court case means a hearing will be scheduled where both sides present their case. Even if the landlord wins at the hearing, you still have appeal rights, and physical removal only happens when the sheriff carries out a court order—called a **Writ of Possession**—that authorizes the eviction. Filing paperwork is the beginning of the legal process—not the end._

**I lost in small claims. Can my landlord lock me out immediately?**

_No. After a magistrate''s decision, you generally have 10 days to appeal. During that window, the landlord still cannot remove you. To stay in the home while an appeal is heard, you will typically need to complete a bond process through the clerk''s office—see the Appeal and Staying in Your Home section for details._

**What evidence should I gather?**

_Four categories: proof you live there (lease, rent receipts, mail at the address, payment records), proof of what the landlord did (photos, video, screenshots of messages and utility status), a timeline of events from lease signing through the present, and a loss log tracking every cost the landlord''s actions caused. The documentation section above walks through each one._

**Can a landlord change the locks in North Carolina?**

_No. Changing the locks without a court order and a sheriff executing a writ of possession is an illegal eviction under North Carolina law._

**Can a landlord shut off utilities to force you to move?**

_No. Shutting off water, power, or gas to force a tenant out is illegal under North Carolina landlord-tenant law._

## When You Need a Lawyer

This guide gives you the tools to document, communicate, and protect your position in the critical first hours. For a straightforward illegal lockout—one where you catch it early, build your record, and the landlord backs down—these steps may be enough.

But if your landlord files a summary ejectment case, if the appeal and bond process is in play, if retaliation is part of the picture, or if the self-help tactics caused real financial damage—those are situations where legal representation changes what happens next. Sometimes just a letter from a law firm is enough to get things moving in your direction.

At North Carolina Legal Services, we deal with situations like this every day. If any part of this guide describes what you are going through, you can schedule a consultation with one of our attorneys by using this [link](/schedule). You may also want to [prepare for your consultation](/article/preparing-for-your-consultation) so you can make the most of your time with an attorney. If your situation involves a natural disaster, see our guide on [hurricane disaster relief for North Carolina renters](/article/hurricane-disaster-relief-for-north-carolina-renters).

---

_If you work with tenants—as a social worker, case manager, housing counselor, or community advocate—please share this free guide. The families who need it most often do not know these protections exist until after the it is already too late._

---',
  'You come home from work and your key does not turn. There is a new padlock on the door. Or maybe the power is off—not a grid outage, just your unit. Your landlord told you last week that you needed to be out, and now they are making it happen on their own terms. If your landlord changed the locks, shut off utilities, or tried to evict you without court in North Carolina, this guide explains your tenant rights and what to do immediately.', 'Legal Services', '["Legal Services","North Carolina","Tenant Rights"]', 'published',
  'user-ncls-blawby', 'asset_ncls_media_illegal-eviction-in-north-carolina_a197771d',
  '2026-03-03T00:00:00.000Z',
  '2026-03-03T00:00:00.000Z', '2026-03-03T00:00:00.000Z', 'You come home from work and your key does not turn. There is a new padlock on the door. Or maybe the power is off—not a grid outage, just your unit. Your landlord told you last week that you needed to be out, and now they are making it happen on their own terms. If your landlord changed the locks, shut off utilities, or tried to evict you without court in North Carolina, this guide explains your tenant rights and what to do immediately.', 'illegal eviction, self help eviction, north carolina tenant rights, illegal lockout, utility shutoff protection, writ of possession, summary ejectment, tenant documentation, loss log, limited scope representation, illegal eviction north carolina, nc eviction laws, north carolina eviction process, eviction hearing nc, eviction court nc, tenant legal aid north carolina, how to stop eviction nc, landlord changed locks nc, can landlord evict without court nc, can landlord change locks nc, can landlord shut off utilities nc, locked out of apartment nc, landlord eviction without notice nc, renters rights north carolina eviction, tenant rights lockout nc',
  '/article/your-landlord-cannot-evict-you-without-a-court-order-heres-what-to-do-when-they-try', NULL
);
