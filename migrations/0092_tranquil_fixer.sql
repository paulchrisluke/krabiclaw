PRAGMA foreign_keys=OFF;

CREATE TABLE `__new_content_blocks` (
  `id` text PRIMARY KEY NOT NULL,
  `document_id` text NOT NULL,
  `parent_block_id` text,
  `type` text NOT NULL,
  `position` integer DEFAULT 0 NOT NULL,
  `level` integer,
  `data_json` text NOT NULL,
  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (`document_id`) REFERENCES `content_documents`(`id`) ON DELETE cascade,
  CONSTRAINT "content_blocks_type_check" CHECK(type IN ('heading', 'markdown', 'image', 'gallery', 'faq', 'how_to', 'divider', 'ai_assistance', 'cta', 'callout', 'hero', 'button_group', 'feature_grid', 'testimonial_grid', 'contact_cta', 'booking_cta', 'donation_choices', 'offering_grid', 'location_grid'))
);
INSERT INTO `__new_content_blocks` SELECT * FROM `content_blocks`;
DROP TABLE `content_blocks`;
ALTER TABLE `__new_content_blocks` RENAME TO `content_blocks`;
CREATE INDEX `content_blocks_document_position_idx` ON `content_blocks` (`document_id`,`position`);
CREATE INDEX `content_blocks_parent_idx` ON `content_blocks` (`parent_block_id`);

CREATE TABLE `__new_content_documents` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_type` text NOT NULL,
  `owner_id` text NOT NULL,
  `draft_revision_id` text,
  `published_revision_id` text,
  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  CONSTRAINT "content_documents_owner_type_check" CHECK(owner_type IN ('platform_blog', 'platform_doc', 'tenant_blog', 'tenant_page'))
);
INSERT INTO `__new_content_documents` SELECT * FROM `content_documents`;
DROP TABLE `content_documents`;
ALTER TABLE `__new_content_documents` RENAME TO `content_documents`;
CREATE INDEX `content_documents_owner_idx` ON `content_documents` (`owner_type`,`owner_id`);
CREATE UNIQUE INDEX `content_documents_owner_unique` ON `content_documents` (`owner_type`,`owner_id`);

CREATE TABLE `__new_tenant_pages` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `site_id` text NOT NULL,
  `path` text NOT NULL,
  `title` text NOT NULL,
  `slug` text,
  `page_type` text DEFAULT 'custom' NOT NULL,
  `recipe` text,
  `summary` text,
  `body` text,
  `components_json` text,
  `cta_label` text,
  `cta_url` text,
  `seo_title` text,
  `seo_description` text,
  `canonical_url` text,
  `robots` text,
  `status` text DEFAULT 'draft' NOT NULL,
  `sort_order` integer DEFAULT 0 NOT NULL,
  `source` text DEFAULT 'manual' NOT NULL,
  `source_ref` text,
  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `updated_by` text,
  FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE cascade,
  FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON DELETE cascade,
  CONSTRAINT "tenant_pages_path_check" CHECK(path LIKE '/%'),
  CONSTRAINT "tenant_pages_status_check" CHECK(status IN ('draft', 'published', 'archived'))
);
INSERT INTO `__new_tenant_pages` SELECT id, organization_id, site_id, path, title, slug,
  CASE WHEN page_type IN ('custom', 'recipe', 'legal', 'system') THEN page_type ELSE 'system' END,
  NULL, summary, body, components_json, cta_label, cta_url, seo_title, seo_description,
  canonical_url, robots, status, sort_order, source, source_ref, created_at, updated_at, updated_by
  FROM `tenant_pages`;
DROP TABLE `tenant_pages`;
ALTER TABLE `__new_tenant_pages` RENAME TO `tenant_pages`;
CREATE INDEX `tenant_pages_site_status_sort_idx` ON `tenant_pages` (`site_id`,`status`,`sort_order`);
CREATE UNIQUE INDEX `tenant_pages_organization_id_site_id_path_unique` ON `tenant_pages` (`organization_id`,`site_id`,`path`);

CREATE TABLE `tenant_page_variants` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `site_id` text NOT NULL,
  `page_id` text NOT NULL,
  `locale` text NOT NULL,
  `draft_document_id` text,
  `published_revision_id` text,
  `published_path` text NOT NULL,
  `title` text NOT NULL,
  `summary` text,
  `seo_title` text,
  `seo_description` text,
  `canonical_url` text,
  `robots` text,
  `status` text DEFAULT 'draft' NOT NULL,
  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `updated_by` text,
  FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE cascade,
  FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON DELETE cascade,
  FOREIGN KEY (`page_id`) REFERENCES `tenant_pages`(`id`) ON DELETE cascade,
  FOREIGN KEY (`draft_document_id`) REFERENCES `content_documents`(`id`) ON DELETE set null,
  FOREIGN KEY (`published_revision_id`) REFERENCES `content_revisions`(`id`) ON DELETE set null,
  CONSTRAINT "tenant_page_variants_path_check" CHECK(published_path LIKE '/%' AND published_path NOT LIKE '//%'),
  CONSTRAINT "tenant_page_variants_status_check" CHECK(status IN ('draft', 'published', 'archived'))
);
CREATE INDEX `tenant_page_variants_site_status_path_idx` ON `tenant_page_variants` (`site_id`,`status`,`published_path`);
CREATE INDEX `tenant_page_variants_page_idx` ON `tenant_page_variants` (`page_id`);
CREATE UNIQUE INDEX `tenant_page_variants_page_locale_unique` ON `tenant_page_variants` (`page_id`,`locale`);
CREATE UNIQUE INDEX `tenant_page_variants_site_locale_path_unique` ON `tenant_page_variants` (`site_id`,`locale`,`published_path`);

ALTER TABLE `site_pageview_events` ADD `page_id` text;
ALTER TABLE `site_pageview_events` ADD `page_type` text;
ALTER TABLE `site_pageview_events` ADD `recipe` text;
ALTER TABLE `site_pageview_events` ADD `locale` text;
ALTER TABLE `site_pageview_events` ADD `revision_id` text;

INSERT INTO tenant_pages
  (id, organization_id, site_id, path, title, page_type, status, sort_order, source, updated_at)
SELECT
  'migrated-site-content:' || sc.site_id || ':' || sc.page,
  sc.organization_id,
  sc.site_id,
  CASE sc.page WHEN 'home' THEN '/' ELSE '/' || trim(sc.page, '/') END,
  COALESCE(MAX(NULLIF(sc.hero_title, '')), MAX(NULLIF(sc.content, '')), sc.page),
  'system',
  'published',
  0,
  'site-content-migration',
  CURRENT_TIMESTAMP
FROM site_content sc
WHERE sc.location_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM tenant_pages existing
     WHERE existing.organization_id = sc.organization_id
       AND existing.site_id = sc.site_id
       AND existing.path = CASE sc.page WHEN 'home' THEN '/' ELSE '/' || trim(sc.page, '/') END
  )
GROUP BY sc.organization_id, sc.site_id, sc.page;

INSERT INTO tenant_pages
  (id, organization_id, site_id, path, title, slug, page_type, status, sort_order, source, updated_at)
SELECT
  'migrated-location-page:' || sc.site_id || ':' || bl.id,
  sc.organization_id,
  sc.site_id,
  '/locations/' || bl.slug,
  COALESCE(MAX(NULLIF(sc.hero_title, '')), bl.title, bl.slug),
  'location-' || bl.slug,
  'system',
  'published',
  0,
  'site-content-location-migration',
  CURRENT_TIMESTAMP
FROM site_content sc
JOIN business_locations bl ON bl.id = sc.location_id AND bl.site_id = sc.site_id
WHERE sc.location_id IS NOT NULL
  AND sc.page = 'location'
  AND NOT EXISTS (
    SELECT 1 FROM tenant_pages existing
     WHERE existing.organization_id = sc.organization_id
       AND existing.site_id = sc.site_id
       AND existing.path = '/locations/' || bl.slug
  )
GROUP BY sc.organization_id, sc.site_id, bl.id, bl.slug, bl.title;

INSERT INTO tenant_page_variants
  (id, organization_id, site_id, page_id, locale, published_path, title, summary, seo_title, seo_description, canonical_url, robots, status, created_at, updated_at)
SELECT
  'migrated-tenant-page-variant:' || p.id || ':' || COALESCE(source_locale.locale, s.source_locale),
  p.organization_id,
  p.site_id,
  p.id,
  COALESCE(source_locale.locale, s.source_locale),
  p.path,
  p.title,
  p.summary,
  p.seo_title,
  p.seo_description,
  p.canonical_url,
  p.robots,
  p.status,
  p.created_at,
  p.updated_at
FROM tenant_pages p
JOIN sites s ON s.id = p.site_id
LEFT JOIN (
  SELECT site_id, locale FROM site_locales WHERE is_source = 1
) source_locale ON source_locale.site_id = p.site_id;

INSERT INTO tenant_page_variants
  (id, organization_id, site_id, page_id, locale, published_path, title, summary, seo_title, seo_description, canonical_url, robots, status, created_at, updated_at)
SELECT
  'migrated-tenant-page-variant:' || p.id || ':' || sct.locale,
  p.organization_id,
  p.site_id,
  p.id,
  sct.locale,
  p.path,
  COALESCE(MAX(NULLIF(sct.hero_title, '')), MAX(NULLIF(sct.content, '')), p.title),
  p.summary,
  p.seo_title,
  p.seo_description,
  p.canonical_url,
  p.robots,
  CASE
    WHEN SUM(CASE WHEN sct.status = 'published' THEN 1 ELSE 0 END) = COUNT(*) THEN 'published'
    ELSE 'draft'
  END,
  p.created_at,
  p.updated_at
FROM site_content_translations sct
JOIN tenant_pages p
  ON p.organization_id = sct.organization_id
 AND p.site_id = sct.site_id
 AND p.path = CASE sct.page WHEN 'home' THEN '/' ELSE '/' || trim(sct.page, '/') END
WHERE sct.location_id IS NULL
GROUP BY p.id, sct.locale;

-- Location translations have their own page identity. Create the locale
-- variant before importing their blocks; otherwise the later block join
-- silently drops every non-source location translation.
INSERT INTO tenant_page_variants
  (id, organization_id, site_id, page_id, locale, published_path, title, summary, seo_title, seo_description, canonical_url, robots, status, created_at, updated_at)
SELECT
  'migrated-tenant-page-variant:' || p.id || ':' || sct.locale,
  p.organization_id,
  p.site_id,
  p.id,
  sct.locale,
  p.path,
  COALESCE(MAX(NULLIF(sct.hero_title, '')), MAX(NULLIF(sct.content, '')), p.title),
  p.summary,
  p.seo_title,
  p.seo_description,
  p.canonical_url,
  p.robots,
  CASE
    WHEN SUM(CASE WHEN sct.status = 'published' THEN 1 ELSE 0 END) = COUNT(*) THEN 'published'
    ELSE 'draft'
  END,
  p.created_at,
  p.updated_at
FROM site_content_translations sct
JOIN business_locations bl ON bl.id = sct.location_id AND bl.site_id = sct.site_id
JOIN tenant_pages p ON p.organization_id = sct.organization_id
 AND p.site_id = sct.site_id
 AND p.path = '/locations/' || bl.slug
WHERE sct.location_id IS NOT NULL
  AND sct.page = 'location'
  AND NOT EXISTS (SELECT 1 FROM tenant_page_variants existing WHERE existing.page_id = p.id AND existing.locale = sct.locale)
GROUP BY p.id, sct.locale;

-- These are the complete legacy component types that can occur in tenant page
-- JSON. latest_articles and article_filters are route-owned behavior markers,
-- not editable page content, so they are intentionally not copied to blocks.
-- Reject any other value before the legacy columns are removed instead of
-- silently converting or dropping unknown content.
CREATE TABLE IF NOT EXISTS `__tenant_page_legacy_component_types` (
  `type` text NOT NULL,
  CONSTRAINT "tenant_page_legacy_component_type_check" CHECK (`type` IN (
    'home_hero', 'page_hero', 'schedule_hero', 'consultation_cta',
    'contact_cards', 'services_intro', 'video_feature', 'reviews', 'qa',
    'disclaimer', 'schedule_guidance', 'schedule_cta', 'schedule_qa',
    'team', 'impact', 'pricing_plans', 'pricing_calculator',
    'donation_choices', 'donation_support', 'legal_meta',
    'latest_articles', 'article_filters',
    'heading', 'markdown', 'image', 'gallery', 'faq', 'divider', 'cta',
    'callout', 'hero', 'button_group', 'feature_grid', 'testimonial_grid',
    'contact_cta', 'booking_cta', 'offering_grid', 'location_grid'
  ))
);
DELETE FROM `__tenant_page_legacy_component_types`;
INSERT INTO `__tenant_page_legacy_component_types` (`type`)
SELECT DISTINCT json_extract(json_each.value, '$.type')
FROM tenant_pages p
JOIN json_each(CASE WHEN p.components_json IS NULL THEN '[]' ELSE p.components_json END);
DROP TABLE `__tenant_page_legacy_component_types`;

INSERT INTO content_documents
  (id, owner_type, owner_id, draft_revision_id, published_revision_id, created_at, updated_at)
SELECT
  'migrated-tenant-page-document:' || v.id,
  'tenant_page',
  v.id,
  NULL,
  NULL,
  v.created_at,
  v.updated_at
FROM tenant_page_variants v;

INSERT INTO content_blocks
  (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
SELECT
  'migrated-tenant-page-block:' || v.id || ':component:' || json_each.key,
  d.id,
  NULL,
  CASE json_extract(json_each.value, '$.type')
    WHEN 'home_hero' THEN 'hero'
    WHEN 'page_hero' THEN 'hero'
    WHEN 'schedule_hero' THEN 'hero'
    WHEN 'consultation_cta' THEN 'contact_cta'
    WHEN 'contact_cards' THEN 'contact_cta'
    WHEN 'services_intro' THEN 'offering_grid'
    WHEN 'video_feature' THEN 'feature_grid'
    WHEN 'reviews' THEN 'testimonial_grid'
    WHEN 'qa' THEN 'faq'
    WHEN 'disclaimer' THEN 'callout'
    WHEN 'schedule_guidance' THEN 'markdown'
    WHEN 'schedule_cta' THEN 'booking_cta'
    WHEN 'schedule_qa' THEN 'faq'
    WHEN 'team' THEN 'feature_grid'
    WHEN 'impact' THEN 'feature_grid'
    WHEN 'pricing_plans' THEN 'offering_grid'
    WHEN 'pricing_calculator' THEN 'feature_grid'
    WHEN 'donation_choices' THEN 'donation_choices'
    WHEN 'donation_support' THEN 'callout'
    WHEN 'legal_meta' THEN 'callout'
    WHEN 'heading' THEN 'heading'
    WHEN 'markdown' THEN 'markdown'
    WHEN 'image' THEN 'image'
    WHEN 'gallery' THEN 'gallery'
    WHEN 'faq' THEN 'faq'
    WHEN 'divider' THEN 'divider'
    WHEN 'cta' THEN 'cta'
    WHEN 'callout' THEN 'callout'
    WHEN 'hero' THEN 'hero'
    WHEN 'button_group' THEN 'button_group'
    WHEN 'feature_grid' THEN 'feature_grid'
    WHEN 'testimonial_grid' THEN 'testimonial_grid'
    WHEN 'contact_cta' THEN 'contact_cta'
    WHEN 'booking_cta' THEN 'booking_cta'
    WHEN 'offering_grid' THEN 'offering_grid'
    WHEN 'location_grid' THEN 'location_grid'
    ELSE '__invalid_tenant_page_component_type__'
  END,
  CAST(json_each.key AS INTEGER),
  NULL,
  json_set(json_each.value, '$.legacy_type', json_extract(json_each.value, '$.type')),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM tenant_page_variants v
JOIN tenant_pages p ON p.id = v.page_id
JOIN content_documents d ON d.owner_id = v.id AND d.owner_type = 'tenant_page'
JOIN json_each(CASE WHEN p.components_json IS NULL THEN '[]' ELSE p.components_json END)
WHERE v.locale = COALESCE((SELECT locale FROM site_locales WHERE site_id = v.site_id AND is_source = 1 LIMIT 1), (SELECT source_locale FROM sites WHERE id = v.site_id))
  AND json_extract(json_each.value, '$.type') NOT IN ('latest_articles', 'article_filters');

INSERT INTO content_blocks
  (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
SELECT
  'migrated-tenant-page-block:' || v.id || ':body',
  d.id,
  NULL,
  'markdown',
  0,
  NULL,
  json_object('markdown', p.body),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM tenant_page_variants v
JOIN tenant_pages p ON p.id = v.page_id
JOIN content_documents d ON d.owner_id = v.id AND d.owner_type = 'tenant_page'
WHERE v.locale = COALESCE((SELECT locale FROM site_locales WHERE site_id = v.site_id AND is_source = 1 LIMIT 1), (SELECT source_locale FROM sites WHERE id = v.site_id))
  AND p.body IS NOT NULL
  AND trim(p.body) <> ''
  AND NOT EXISTS (SELECT 1 FROM content_blocks b WHERE b.document_id = d.id);

INSERT INTO content_blocks
  (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
SELECT
  'migrated-site-content-block:' || sc.id || ':' || v.id,
  d.id,
  NULL,
  CASE
    WHEN sc.field = 'hero' THEN 'hero'
    WHEN sc.field LIKE '%.image' OR sc.type = 'media' THEN 'image'
    WHEN sc.field LIKE '%.title' OR sc.field LIKE '%.headline' THEN 'heading'
    ELSE 'markdown'
  END,
  1000 + ROW_NUMBER() OVER (PARTITION BY d.id ORDER BY sc.id),
  CASE WHEN sc.field LIKE '%.title' OR sc.field LIKE '%.headline' THEN 2 ELSE NULL END,
  CASE
    WHEN sc.field = 'hero' THEN json_object('field', sc.field, 'title', sc.hero_title, 'subtitle', sc.hero_subtitle, 'asset_id', sc.hero_media_asset_id, 'content', sc.content)
    WHEN sc.field LIKE '%.image' OR sc.type = 'media' THEN json_object('field', sc.field, 'url', sc.content, 'alt', sc.field)
    WHEN sc.field LIKE '%.title' OR sc.field LIKE '%.headline' THEN json_object('field', sc.field, 'text', sc.content, 'level', 2)
    ELSE json_object('field', sc.field, 'markdown', sc.content)
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM site_content sc
JOIN tenant_pages p
  ON p.organization_id = sc.organization_id
 AND p.site_id = sc.site_id
 AND p.path = CASE sc.page WHEN 'home' THEN '/' ELSE '/' || trim(sc.page, '/') END
JOIN tenant_page_variants v ON v.page_id = p.id
JOIN content_documents d ON d.owner_id = v.id AND d.owner_type = 'tenant_page'
WHERE sc.location_id IS NULL
  AND v.locale = COALESCE((SELECT locale FROM site_locales WHERE site_id = v.site_id AND is_source = 1 LIMIT 1), (SELECT source_locale FROM sites WHERE id = v.site_id));

INSERT INTO content_blocks
  (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
SELECT
  'migrated-location-content-block:' || sc.id || ':' || v.id,
  d.id,
  NULL,
  CASE
    WHEN sc.field = 'hero' THEN 'hero'
    WHEN sc.field LIKE '%.image' OR sc.type = 'media' THEN 'image'
    WHEN sc.field LIKE '%.title' OR sc.field LIKE '%.headline' THEN 'heading'
    ELSE 'markdown'
  END,
  ROW_NUMBER() OVER (PARTITION BY d.id ORDER BY sc.id),
  CASE WHEN sc.field LIKE '%.title' OR sc.field LIKE '%.headline' THEN 2 ELSE NULL END,
  CASE
    WHEN sc.field = 'hero' THEN json_object('field', sc.field, 'title', sc.hero_title, 'subtitle', sc.hero_subtitle, 'asset_id', sc.hero_media_asset_id, 'content', sc.content)
    WHEN sc.field LIKE '%.image' OR sc.type = 'media' THEN json_object('field', sc.field, 'url', sc.content, 'alt', sc.field)
    WHEN sc.field LIKE '%.title' OR sc.field LIKE '%.headline' THEN json_object('field', sc.field, 'text', sc.content, 'level', 2)
    ELSE json_object('field', sc.field, 'markdown', sc.content)
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM site_content sc
JOIN business_locations bl ON bl.id = sc.location_id AND bl.site_id = sc.site_id
JOIN tenant_pages p ON p.site_id = sc.site_id AND p.path = '/locations/' || bl.slug
JOIN tenant_page_variants v ON v.page_id = p.id
JOIN content_documents d ON d.owner_id = v.id AND d.owner_type = 'tenant_page'
WHERE sc.location_id IS NOT NULL
  AND sc.page = 'location'
  AND v.locale = COALESCE((SELECT locale FROM site_locales WHERE site_id = v.site_id AND is_source = 1 LIMIT 1), (SELECT source_locale FROM sites WHERE id = v.site_id));

INSERT INTO content_blocks
  (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
SELECT
  'migrated-site-content-translation-block:' || sct.id || ':' || v.id,
  d.id,
  NULL,
  CASE
    WHEN sct.field = 'hero' THEN 'hero'
    WHEN sct.field LIKE '%.image' THEN 'image'
    WHEN sct.field LIKE '%.title' OR sct.field LIKE '%.headline' THEN 'heading'
    ELSE 'markdown'
  END,
  ROW_NUMBER() OVER (PARTITION BY d.id ORDER BY sct.id),
  CASE WHEN sct.field LIKE '%.title' OR sct.field LIKE '%.headline' THEN 2 ELSE NULL END,
  CASE
    WHEN sct.field = 'hero' THEN json_object('field', sct.field, 'title', sct.hero_title, 'subtitle', sct.hero_subtitle, 'content', sct.content)
    WHEN sct.field LIKE '%.image' THEN json_object('field', sct.field, 'url', sct.content, 'alt', sct.field)
    WHEN sct.field LIKE '%.title' OR sct.field LIKE '%.headline' THEN json_object('field', sct.field, 'text', COALESCE(sct.content, sct.value), 'level', 2)
    ELSE json_object('field', sct.field, 'markdown', COALESCE(sct.content, sct.value))
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM site_content_translations sct
JOIN tenant_pages p
  ON p.organization_id = sct.organization_id
 AND p.site_id = sct.site_id
 AND p.path = CASE sct.page WHEN 'home' THEN '/' ELSE '/' || trim(sct.page, '/') END
JOIN tenant_page_variants v ON v.page_id = p.id AND v.locale = sct.locale
JOIN content_documents d ON d.owner_id = v.id AND d.owner_type = 'tenant_page'
WHERE sct.location_id IS NULL;

INSERT INTO content_blocks
  (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
SELECT
  'migrated-location-translation-block:' || sct.id || ':' || v.id,
  d.id,
  NULL,
  CASE
    WHEN sct.field = 'hero' THEN 'hero'
    WHEN sct.field LIKE '%.image' OR sct.type = 'media' THEN 'image'
    WHEN sct.field LIKE '%.title' OR sct.field LIKE '%.headline' THEN 'heading'
    ELSE 'markdown'
  END,
  ROW_NUMBER() OVER (PARTITION BY d.id ORDER BY sct.id),
  CASE WHEN sct.field LIKE '%.title' OR sct.field LIKE '%.headline' THEN 2 ELSE NULL END,
  CASE
    WHEN sct.field = 'hero' THEN json_object('field', sct.field, 'title', sct.hero_title, 'subtitle', sct.hero_subtitle, 'content', sct.content)
    WHEN sct.field LIKE '%.image' OR sct.type = 'media' THEN json_object('field', sct.field, 'url', sct.content, 'alt', sct.field)
    WHEN sct.field LIKE '%.title' OR sct.field LIKE '%.headline' THEN json_object('field', sct.field, 'text', COALESCE(sct.content, sct.value), 'level', 2)
    ELSE json_object('field', sct.field, 'markdown', COALESCE(sct.content, sct.value))
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM site_content_translations sct
JOIN business_locations bl ON bl.id = sct.location_id AND bl.site_id = sct.site_id
JOIN tenant_pages p ON p.site_id = sct.site_id AND p.path = '/locations/' || bl.slug
JOIN tenant_page_variants v ON v.page_id = p.id AND v.locale = sct.locale
JOIN content_documents d ON d.owner_id = v.id AND d.owner_type = 'tenant_page'
WHERE sct.location_id IS NOT NULL
  AND sct.page = 'location';

INSERT INTO content_blocks (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
SELECT 'migrated-tenant-page-block:' || v.id || ':title', d.id, NULL, 'heading', 0, 1,
       json_object('text', v.title, 'level', 1), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM tenant_page_variants v
JOIN content_documents d ON d.owner_id = v.id AND d.owner_type = 'tenant_page'
WHERE NOT EXISTS (SELECT 1 FROM content_blocks b WHERE b.document_id = d.id);

INSERT INTO content_revisions
  (id, document_id, snapshot_json, body_markdown, created_by, label, created_at)
SELECT
  'migrated-tenant-page-revision:' || v.id,
  d.id,
  json_object(
    'schemaVersion', 1,
    'metadata', json_object('locale', v.locale, 'path', v.published_path, 'title', v.title, 'summary', v.summary, 'seoTitle', v.seo_title, 'seoDescription', v.seo_description, 'canonicalUrl', v.canonical_url, 'robots', v.robots, 'pageType', p.page_type, 'recipe', p.recipe),
    'blocks', COALESCE((SELECT json_group_array(json_object('id', b.id, 'parent_block_id', b.parent_block_id, 'type', b.type, 'position', b.position, 'level', b.level, 'data', json(b.data_json))) FROM content_blocks b WHERE b.document_id = d.id), json('[]'))
  ),
  COALESCE(p.body, ''),
  NULL,
  'Migrated tenant page',
  CURRENT_TIMESTAMP
FROM tenant_page_variants v
JOIN tenant_pages p ON p.id = v.page_id
JOIN content_documents d ON d.owner_id = v.id AND d.owner_type = 'tenant_page';

UPDATE content_documents
SET draft_revision_id = 'migrated-tenant-page-revision:' || owner_id,
    published_revision_id = CASE WHEN EXISTS (SELECT 1 FROM tenant_page_variants v WHERE v.id = owner_id AND v.status = 'published') THEN 'migrated-tenant-page-revision:' || owner_id ELSE NULL END,
    updated_at = CURRENT_TIMESTAMP
WHERE owner_type = 'tenant_page';

UPDATE tenant_page_variants
SET draft_document_id = 'migrated-tenant-page-document:' || id,
    published_revision_id = CASE WHEN status = 'published' THEN 'migrated-tenant-page-revision:' || id ELSE NULL END,
    updated_at = CURRENT_TIMESTAMP;

PRAGMA foreign_keys=ON;
