-- Collapse every app-owned media relationship into media_assets + media_placements.
-- This migration deliberately avoids rebuilding referenced parent tables.

-- Body references experience_media, which this migration drops; must go first.
DROP TRIGGER IF EXISTS `media_assets_scope_update`;--> statement-breakpoint
DROP TABLE IF EXISTS `__media_migration_guard`;--> statement-breakpoint
CREATE TABLE `__media_migration_guard` (`label` text PRIMARY KEY NOT NULL, `unresolved` integer NOT NULL CHECK (`unresolved` = 0));--> statement-breakpoint

INSERT INTO `__media_migration_guard`
SELECT 'retired share asset columns',
       (SELECT COUNT(*) FROM `blog_posts` WHERE `retired_share_asset_id` IS NOT NULL)
     + (SELECT COUNT(*) FROM `business_locations` WHERE `retired_share_asset_id` IS NOT NULL)
     + (SELECT COUNT(*) FROM `experiences` WHERE `retired_share_asset_id` IS NOT NULL)
     + (SELECT COUNT(*) FROM `menu_items` WHERE `retired_share_asset_id` IS NOT NULL)
     + (SELECT COUNT(*) FROM `posts` WHERE `retired_share_asset_id` IS NOT NULL)
     + (SELECT COUNT(*) FROM `sites` WHERE `retired_share_asset_id` IS NOT NULL);--> statement-breakpoint
INSERT INTO `__media_migration_guard`
SELECT 'custom author rows or references',
       (SELECT COUNT(*) FROM `site_authors`)
     + (SELECT COUNT(*) FROM `blog_posts` WHERE `site_author_id` IS NOT NULL);--> statement-breakpoint
INSERT INTO `__media_migration_guard`
SELECT 'deprecated chowbot media payloads',
       (SELECT COUNT(*) FROM `chowbot_messages` WHERE `media` IS NOT NULL AND trim(`media`) NOT IN ('', '[]', '{}', 'null'))
     + (SELECT COUNT(*) FROM `chowbot_channel_state` WHERE `pending_media` IS NOT NULL AND trim(`pending_media`) NOT IN ('', '[]', '{}', 'null'));--> statement-breakpoint
-- notification_events.location_id has no equivalent column in the target
-- schema (server/db/schema.ts) and the very next migration's full table
-- rebuild drops it unconditionally regardless of value, so there is nothing
-- to preserve here. Clear it first instead of just asserting it's already
-- empty: staging accumulated a handful of stray values from demo-fixture
-- guest_thread_reply events, and a hard assertion failure would block this
-- migration on every environment that ever ran that fixture flow.
UPDATE `notification_events` SET `location_id` = NULL WHERE `location_id` IS NOT NULL;--> statement-breakpoint
INSERT INTO `__media_migration_guard`
SELECT 'notification location shadow scope', COUNT(*) FROM `notification_events` WHERE `location_id` IS NOT NULL;--> statement-breakpoint
INSERT INTO `__media_migration_guard`
SELECT 'invalid legacy media JSON',
       (SELECT COUNT(*) FROM `offerings` WHERE `media_asset_ids` IS NOT NULL AND NOT json_valid(`media_asset_ids`))
     + (SELECT COUNT(*) FROM `offerings` WHERE `features` IS NOT NULL AND NOT json_valid(`features`))
     + (SELECT COUNT(*) FROM `tenant_compliance` WHERE `document_asset_ids` IS NOT NULL AND NOT json_valid(`document_asset_ids`))
     + (SELECT COUNT(*) FROM `tenant_compliance` WHERE `metadata_json` IS NOT NULL AND NOT json_valid(`metadata_json`))
     + (SELECT COUNT(*) FROM `reviews` WHERE `photo_urls` IS NOT NULL AND NOT json_valid(`photo_urls`))
     + (SELECT COUNT(*) FROM `content_blocks` WHERE NOT json_valid(`data_json`))
     + (SELECT COUNT(*) FROM `onboarding_drafts` WHERE NOT json_valid(`payload_json`))
     + (SELECT COUNT(*) FROM `sites` WHERE `settings` IS NOT NULL AND NOT json_valid(`settings`));--> statement-breakpoint
INSERT INTO `__media_migration_guard`
SELECT 'conflicting post covers', COUNT(*)
  FROM `posts` p JOIN `post_media` pm ON pm.`post_id` = p.`id` AND pm.`role` = 'cover'
 WHERE p.`image_asset_id` IS NOT NULL AND p.`image_asset_id` <> pm.`media_asset_id`;--> statement-breakpoint
INSERT INTO `__media_migration_guard`
SELECT 'multiple post covers', COUNT(*) FROM (
  SELECT `post_id` FROM `post_media` WHERE `role` = 'cover'
  GROUP BY `post_id` HAVING COUNT(DISTINCT `media_asset_id`) > 1
);--> statement-breakpoint
INSERT INTO `__media_migration_guard`
SELECT 'invalid direct media scope',
       (SELECT COUNT(*) FROM `sites` s LEFT JOIN `media_assets` a ON a.`id` = s.`logo_asset_id` AND a.`organization_id` = s.`organization_id` AND a.`site_id` = s.`id` WHERE s.`logo_asset_id` IS NOT NULL AND a.`id` IS NULL)
     + (SELECT COUNT(*) FROM `business_locations` o LEFT JOIN `media_assets` a ON a.`id` = o.`hero_media_asset_id` AND a.`organization_id` = o.`organization_id` AND a.`site_id` = o.`site_id` WHERE o.`hero_media_asset_id` IS NOT NULL AND a.`id` IS NULL)
     + (SELECT COUNT(*) FROM `menu_items` o JOIN `menus` m ON m.`id` = o.`menu_id` LEFT JOIN `media_assets` a ON a.`id` = o.`image_asset_id` AND a.`organization_id` = m.`organization_id` AND a.`site_id` = m.`site_id` WHERE o.`image_asset_id` IS NOT NULL AND a.`id` IS NULL)
     + (SELECT COUNT(*) FROM `posts` o LEFT JOIN `media_assets` a ON a.`id` = o.`image_asset_id` AND a.`organization_id` = o.`organization_id` AND a.`site_id` = o.`site_id` WHERE o.`image_asset_id` IS NOT NULL AND a.`id` IS NULL)
     + (SELECT COUNT(*) FROM `blog_posts` o LEFT JOIN `media_assets` a ON a.`id` = o.`featured_image_asset_id` AND a.`organization_id` = COALESCE(o.`organization_id`, 'platform') AND a.`site_id` = COALESCE(o.`site_id`, 'platform') WHERE o.`featured_image_asset_id` IS NOT NULL AND a.`id` IS NULL)
     + (SELECT COUNT(*) FROM `platform_docs` o LEFT JOIN `media_assets` a ON a.`id` = o.`featured_image_asset_id` AND a.`organization_id` = 'platform' AND a.`site_id` = 'platform' WHERE o.`featured_image_asset_id` IS NOT NULL AND a.`id` IS NULL)
     + (SELECT COUNT(*) FROM `offerings` o LEFT JOIN `media_assets` a ON a.`id` = o.`thumbnail_asset_id` AND a.`organization_id` = o.`organization_id` AND a.`site_id` = o.`site_id` WHERE o.`thumbnail_asset_id` IS NOT NULL AND a.`id` IS NULL)
     + (SELECT COUNT(*) FROM `offerings` o LEFT JOIN `media_assets` a ON a.`id` = o.`hero_image_asset_id` AND a.`organization_id` = o.`organization_id` AND a.`site_id` = o.`site_id` WHERE o.`hero_image_asset_id` IS NOT NULL AND a.`id` IS NULL);--> statement-breakpoint
INSERT INTO `__media_migration_guard`
SELECT 'unsupported platform content component', COUNT(*) FROM `platform_content_components`
 WHERE `content_type` <> 'doc' OR `type` NOT IN ('faq', 'how_to', 'ai_assistance');--> statement-breakpoint

DROP TRIGGER IF EXISTS `content_documents_platform_doc_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `content_documents_platform_doc_update`;--> statement-breakpoint
INSERT INTO `content_documents` (`id`, `owner_type`, `owner_id`, `created_at`, `updated_at`)
SELECT 'migration-doc-blog-' || b.`id`, CASE WHEN b.`site_id` IS NULL THEN 'platform_blog' ELSE 'tenant_blog' END,
       b.`id`, b.`created_at`, b.`updated_at`
  FROM `blog_posts` b
 WHERE NOT EXISTS (SELECT 1 FROM `content_documents` d WHERE d.`owner_type` = CASE WHEN b.`site_id` IS NULL THEN 'platform_blog' ELSE 'tenant_blog' END AND d.`owner_id` = b.`id`);--> statement-breakpoint
INSERT INTO `content_blocks` (`id`, `document_id`, `type`, `position`, `data_json`, `created_at`, `updated_at`)
SELECT 'migration-block-blog-' || b.`id`, d.`id`, 'markdown', 0,
       json_object('markdown', b.`body`, 'editor_mode', 'source'), b.`created_at`, b.`updated_at`
  FROM `blog_posts` b JOIN `content_documents` d ON d.`owner_id` = b.`id`
   AND d.`owner_type` = CASE WHEN b.`site_id` IS NULL THEN 'platform_blog' ELSE 'tenant_blog' END
 WHERE NOT EXISTS (SELECT 1 FROM `content_blocks` cb WHERE cb.`document_id` = d.`id`);--> statement-breakpoint
INSERT INTO `content_documents` (`id`, `owner_type`, `owner_id`, `created_at`, `updated_at`)
SELECT 'migration-doc-platform-' || p.`id`, 'platform_doc', p.`id`, p.`created_at`, p.`updated_at`
  FROM `platform_docs` p
 WHERE NOT EXISTS (SELECT 1 FROM `content_documents` d WHERE d.`owner_type` = 'platform_doc' AND d.`owner_id` = p.`id`);--> statement-breakpoint
INSERT INTO `content_blocks` (`id`, `document_id`, `type`, `position`, `data_json`, `created_at`, `updated_at`)
SELECT 'migration-block-platform-' || p.`id`, d.`id`, 'markdown', 0,
       json_object('markdown', p.`body`, 'editor_mode', 'source'), p.`created_at`, p.`updated_at`
  FROM `platform_docs` p JOIN `content_documents` d ON d.`owner_type` = 'platform_doc' AND d.`owner_id` = p.`id`
 WHERE NOT EXISTS (SELECT 1 FROM `content_blocks` cb WHERE cb.`document_id` = d.`id`);--> statement-breakpoint
INSERT INTO `content_blocks` (`id`, `document_id`, `type`, `position`, `data_json`, `created_at`, `updated_at`)
SELECT 'migration-component-' || c.`id`, d.`id`, c.`type`, c.`position` + 1, c.`data_json`, c.`created_at`, c.`updated_at`
  FROM `platform_content_components` c
  JOIN `content_documents` d ON d.`owner_type` = 'platform_doc' AND d.`owner_id` = c.`content_id`;--> statement-breakpoint

DROP TABLE IF EXISTS `__media_placement_backfill`;--> statement-breakpoint
CREATE TABLE `__media_placement_backfill` (
  `organization_id` text NOT NULL, `site_id` text NOT NULL, `owner_type` text NOT NULL,
  `owner_id` text NOT NULL, `slot` text NOT NULL, `asset_id` text NOT NULL, `sort_order` integer NOT NULL,
  PRIMARY KEY (`owner_type`, `owner_id`, `slot`, `asset_id`),
  UNIQUE (`owner_type`, `owner_id`, `slot`, `sort_order`)
);--> statement-breakpoint

INSERT OR IGNORE INTO `__media_placement_backfill`
SELECT s.`organization_id`, s.`id`, 'site', s.`id`, 'logo', s.`logo_asset_id`, 0 FROM `sites` s WHERE s.`logo_asset_id` IS NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `__media_placement_backfill`
SELECT s.`organization_id`, s.`id`, 'site', s.`id`, 'favicon', COALESCE(a.`id`, s.`logo_asset_id`), 0
  FROM `sites` s LEFT JOIN `media_assets` a ON a.`organization_id` = s.`organization_id` AND a.`site_id` = s.`id` AND a.`public_url` = json_extract(s.`settings`, '$.favicon_url')
 WHERE s.`settings` IS NOT NULL AND json_type(s.`settings`, '$.favicon_url') = 'text'
   AND (a.`id` IS NOT NULL OR (json_extract(s.`settings`, '$.favicon_url') LIKE '/tenants/%' AND s.`logo_asset_id` IS NOT NULL));--> statement-breakpoint
INSERT OR IGNORE INTO `__media_placement_backfill`
SELECT c.`organization_id`, c.`site_id`, 'site', c.`site_id`, 'logo_dark', a.`id`, 0
  FROM `tenant_compliance` c JOIN `media_assets` a ON a.`organization_id` = c.`organization_id` AND a.`site_id` = c.`site_id` AND a.`public_url` = json_extract(c.`metadata_json`, '$.logo_dark_url')
 WHERE c.`metadata_json` IS NOT NULL AND json_type(c.`metadata_json`, '$.logo_dark_url') = 'text';--> statement-breakpoint
INSERT OR IGNORE INTO `__media_placement_backfill`
SELECT o.`organization_id`, o.`site_id`, 'business_location', o.`id`, 'hero', o.`hero_media_asset_id`, 0 FROM `business_locations` o WHERE o.`hero_media_asset_id` IS NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `__media_placement_backfill`
SELECT a.`organization_id`, a.`site_id`, 'business_location', a.`location_id`, 'gallery', a.`id`, ROW_NUMBER() OVER (PARTITION BY a.`location_id` ORDER BY a.`created_at`, a.`id`) - 1
  FROM `media_assets` a WHERE a.`location_id` IS NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `__media_placement_backfill`
SELECT m.`organization_id`, m.`site_id`, 'menu_item', i.`id`, 'gallery', i.`image_asset_id`, 0
  FROM `menu_items` i JOIN `menus` m ON m.`id` = i.`menu_id` WHERE i.`image_asset_id` IS NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `__media_placement_backfill`
SELECT r.`organization_id`, r.`site_id`, 'menu_item', r.`menu_item_id`, 'gallery', r.`asset_id`, r.`sort_order` FROM `menu_item_media` r;--> statement-breakpoint
INSERT OR IGNORE INTO `__media_placement_backfill`
SELECT r.`organization_id`, r.`site_id`, 'experience', r.`experience_id`, 'gallery', r.`asset_id`, r.`sort_order` FROM `experience_media` r;--> statement-breakpoint
INSERT OR IGNORE INTO `__media_placement_backfill`
SELECT p.`organization_id`, p.`site_id`, 'post', p.`id`, 'cover', p.`image_asset_id`, 0 FROM `posts` p WHERE p.`image_asset_id` IS NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `__media_placement_backfill`
SELECT r.`organization_id`, r.`site_id`, 'post', r.`post_id`, CASE WHEN r.`role` = 'cover' THEN 'cover' ELSE 'gallery' END,
       r.`media_asset_id`, CASE WHEN r.`role` = 'cover' THEN 0 ELSE r.`sort_order` END FROM `post_media` r;--> statement-breakpoint
INSERT OR IGNORE INTO `__media_placement_backfill`
SELECT COALESCE(b.`organization_id`, 'platform'), COALESCE(b.`site_id`, 'platform'), 'blog_post', b.`id`, 'featured', b.`featured_image_asset_id`, 0
  FROM `blog_posts` b WHERE b.`featured_image_asset_id` IS NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `__media_placement_backfill`
SELECT 'platform', 'platform', 'platform_doc', p.`id`, 'featured', p.`featured_image_asset_id`, 0 FROM `platform_docs` p WHERE p.`featured_image_asset_id` IS NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `__media_placement_backfill`
SELECT o.`organization_id`, o.`site_id`, 'offering', o.`id`, 'thumbnail', o.`thumbnail_asset_id`, 0 FROM `offerings` o WHERE o.`thumbnail_asset_id` IS NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `__media_placement_backfill`
SELECT o.`organization_id`, o.`site_id`, 'offering', o.`id`, 'hero', o.`hero_image_asset_id`, 0 FROM `offerings` o WHERE o.`hero_image_asset_id` IS NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `__media_placement_backfill`
SELECT o.`organization_id`, o.`site_id`, 'offering', o.`id`, 'gallery', j.`value`, CAST(j.`key` AS integer)
  FROM `offerings` o, json_each(o.`media_asset_ids`) j WHERE o.`media_asset_ids` IS NOT NULL AND j.`type` = 'text';--> statement-breakpoint
INSERT OR IGNORE INTO `__media_placement_backfill`
SELECT o.`organization_id`, o.`site_id`, 'offering', o.`id`, 'features.' || j.`key` || '.image', json_extract(j.`value`, '$.image_asset_id'), 0
  FROM `offerings` o, json_each(o.`features`) j WHERE o.`features` IS NOT NULL AND json_type(j.`value`, '$.image_asset_id') = 'text';--> statement-breakpoint
INSERT OR IGNORE INTO `__media_placement_backfill`
SELECT c.`organization_id`, c.`site_id`, 'tenant_compliance', c.`id`, 'document', j.`value`, CAST(j.`key` AS integer)
  FROM `tenant_compliance` c, json_each(c.`document_asset_ids`) j WHERE c.`document_asset_ids` IS NOT NULL AND j.`type` = 'text';--> statement-breakpoint
INSERT OR IGNORE INTO `__media_placement_backfill`
SELECT r.`organization_id`, r.`site_id`, 'review', rm.`review_id`, 'gallery', rm.`media_asset_id`, rm.`sort_order`
  FROM `review_media` rm JOIN `reviews` r ON r.`id` = rm.`review_id` WHERE rm.`review_id` IS NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `__media_placement_backfill`
SELECT rr.`organization_id`, rr.`site_id`, 'review_request', rm.`review_request_id`, 'gallery', rm.`media_asset_id`, rm.`sort_order`
  FROM `review_media` rm JOIN `review_requests` rr ON rr.`id` = rm.`review_request_id`
 WHERE rm.`review_id` IS NULL AND rm.`review_request_id` IS NOT NULL;--> statement-breakpoint

-- reviewer_photo_url/photo_urls store raw Cloudflare Images delivery URLs directly
-- (never went through media_assets). Most have no matching media_assets row yet, so
-- create one before linking it, instead of silently dropping real reviewer photos.
WITH `portrait_urls` AS (
  SELECT r.`id` AS `review_id`, r.`organization_id`, r.`site_id`, r.`author_name`, r.`created_at`, r.`updated_at`,
         r.`reviewer_photo_url` AS `url`,
         substr(r.`reviewer_photo_url`, length('https://imagedelivery.net/') + 1) AS `delivery_path`
    FROM `reviews` r
   WHERE r.`reviewer_photo_url` LIKE 'https://imagedelivery.net/%'
     AND NOT EXISTS (SELECT 1 FROM `media_assets` a WHERE a.`site_id` = r.`site_id` AND a.`public_url` = r.`reviewer_photo_url`)
), `portrait_ids` AS (
  SELECT *, substr(`delivery_path`, instr(`delivery_path`, '/') + 1) AS `image_path` FROM `portrait_urls`
), `portrait_images` AS (
  SELECT *, substr(`image_path`, 1, instr(`image_path`, '/') - 1) AS `cloudflare_image_id` FROM `portrait_ids`
)
INSERT INTO `media_assets` (`id`, `organization_id`, `site_id`, `kind`, `provider`, `source`, `cloudflare_image_id`, `public_url`, `thumbnail_url`, `alt_text`, `category`, `status`, `created_at`, `updated_at`)
SELECT 'legacy-review-portrait-' || `site_id` || '-' || `cloudflare_image_id`,
       `organization_id`, `site_id`, 'image', 'cloudflare_images', 'uploaded', `cloudflare_image_id`,
       `url`, substr(`url`, 1, length(`url`) - length('public')) || 'thumbnail',
       min(`author_name`), 'other', 'active', min(`created_at`), max(`updated_at`)
  FROM `portrait_images`
 WHERE `cloudflare_image_id` <> ''
 GROUP BY `organization_id`, `site_id`, `cloudflare_image_id`, `url`;--> statement-breakpoint
INSERT OR IGNORE INTO `__media_placement_backfill`
SELECT r.`organization_id`, r.`site_id`, 'review', r.`id`, 'portrait',
       (SELECT a.`id` FROM `media_assets` a WHERE a.`site_id` = r.`site_id` AND a.`public_url` = r.`reviewer_photo_url` ORDER BY a.`id` LIMIT 1), 0
  FROM `reviews` r WHERE r.`reviewer_photo_url` IS NOT NULL;--> statement-breakpoint

WITH `gallery_urls` AS (
  SELECT r.`id` AS `review_id`, r.`organization_id`, r.`site_id`, r.`created_at`, r.`updated_at`,
         j.`key` AS `photo_index`, j.`value` AS `url`,
         substr(j.`value`, length('https://imagedelivery.net/') + 1) AS `delivery_path`
    FROM `reviews` r, json_each(COALESCE(r.`photo_urls`, '[]')) j
   WHERE typeof(j.`value`) = 'text' AND j.`value` LIKE 'https://imagedelivery.net/%'
     AND NOT EXISTS (SELECT 1 FROM `media_assets` a WHERE a.`site_id` = r.`site_id` AND a.`public_url` = j.`value`)
), `gallery_ids` AS (
  SELECT *, substr(`delivery_path`, instr(`delivery_path`, '/') + 1) AS `image_path` FROM `gallery_urls`
), `gallery_images` AS (
  SELECT *, substr(`image_path`, 1, instr(`image_path`, '/') - 1) AS `cloudflare_image_id` FROM `gallery_ids`
)
INSERT INTO `media_assets` (`id`, `organization_id`, `site_id`, `kind`, `provider`, `source`, `cloudflare_image_id`, `public_url`, `thumbnail_url`, `category`, `status`, `created_at`, `updated_at`)
SELECT 'legacy-review-gallery-' || `review_id` || '-' || `photo_index`,
       `organization_id`, `site_id`, 'image', 'cloudflare_images', 'uploaded', `cloudflare_image_id`,
       `url`, substr(`url`, 1, length(`url`) - length('public')) || 'thumbnail',
       'other', 'active', `created_at`, `updated_at`
  FROM `gallery_images`
 WHERE `cloudflare_image_id` <> '';--> statement-breakpoint
INSERT OR IGNORE INTO `__media_placement_backfill`
SELECT r.`organization_id`, r.`site_id`, 'review', r.`id`, 'gallery',
       (SELECT a.`id` FROM `media_assets` a WHERE a.`site_id` = r.`site_id` AND a.`public_url` = j.`value` ORDER BY a.`id` LIMIT 1),
       CAST(j.`key` AS integer)
  FROM `reviews` r, json_each(COALESCE(r.`photo_urls`, '[]')) j
 WHERE typeof(j.`value`) = 'text';--> statement-breakpoint
--> statement-breakpoint
DROP TABLE `__media_migration_guard`;--> statement-breakpoint

-- Legacy JSON-embedded media references are superseded by media_placements below;
-- nothing in server/ reads these fields anymore (verified), strip them for hygiene.
UPDATE `offerings` SET `features` = (SELECT json_group_array(json_remove(`value`, '$.image_asset_id', '$.image_url', '$.icon_url')) FROM json_each(`offerings`.`features`)) WHERE json_valid(`features`) AND json_type(`features`) = 'array';--> statement-breakpoint
UPDATE `tenant_compliance` SET `metadata_json` = json_remove(`metadata_json`, '$.logo_dark_url') WHERE json_type(`metadata_json`, '$.logo_dark_url') IS NOT NULL;--> statement-breakpoint
UPDATE `sites` SET `settings` = json_remove(`settings`, '$.favicon_url') WHERE json_type(`settings`, '$.favicon_url') IS NOT NULL;--> statement-breakpoint

UPDATE `user` SET `phoneNumberVerified` = 1 WHERE `phoneNumberVerified` = 0 AND `id` IN (SELECT `user_id` FROM `user_phone_verification` WHERE `ownership_verified` = 1);--> statement-breakpoint

DROP TABLE `experience_media`;--> statement-breakpoint
DROP TABLE `menu_item_media`;--> statement-breakpoint
DROP TABLE `platform_content_components`;--> statement-breakpoint
DROP TABLE `post_media`;--> statement-breakpoint
DROP TABLE `review_media`;--> statement-breakpoint
DROP TABLE `site_authors`;--> statement-breakpoint
DROP TABLE `user_phone_verification`;--> statement-breakpoint

-- Combined transitive-safe rebuild: sites/business_locations and everything that
-- references them are rebuilt together in one pass (children created pointing at
-- __new_<parent> before any old table is dropped) because D1 executes FK actions
-- (cascade delete / set null) on live child rows during DROP TABLE of a referenced
-- parent even under PRAGMA foreign_keys=OFF -- verified empirically, not assumed.
