-- Finish the physical unified-media cleanup for databases that have already
-- applied 0072/0073 in preview, and for staging/prod after those migrations.
-- Every rebuilt table is copied from a backup table, then dependent rows are
-- reinserted/reattached so SQLite/D1 foreign-key actions during DROP TABLE
-- cannot permanently cascade or null related production data.

DROP TRIGGER IF EXISTS `sync_media_assets_old_delete`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_media_assets_old_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_media_assets_old_update`;--> statement-breakpoint

DROP TABLE IF EXISTS `__new_business_locations`;--> statement-breakpoint
DROP TABLE IF EXISTS `__new_site_content`;--> statement-breakpoint
DROP TABLE IF EXISTS `__new_experiences`;--> statement-breakpoint
DROP TABLE IF EXISTS `__new_blog_posts`;--> statement-breakpoint
DROP TABLE IF EXISTS `__new_menu_items`;--> statement-breakpoint
DROP TABLE IF EXISTS `__new_platform_docs`;--> statement-breakpoint
DROP TABLE IF EXISTS `__new_posts`;--> statement-breakpoint
DROP TABLE IF EXISTS `__new_experience_media`;--> statement-breakpoint

CREATE TABLE `__unified_media_cleanup_preflight` (
	`violation` text NOT NULL CHECK (`violation` = '')
);--> statement-breakpoint
INSERT INTO `__unified_media_cleanup_preflight` (`violation`)
SELECT 'business_locations.hero_media_asset_id missing'
WHERE NOT EXISTS (SELECT 1 FROM pragma_table_info('business_locations') WHERE name = 'hero_media_asset_id')
LIMIT 1;--> statement-breakpoint
INSERT INTO `__unified_media_cleanup_preflight` (`violation`)
SELECT 'site_content.hero_media_asset_id missing'
WHERE NOT EXISTS (SELECT 1 FROM pragma_table_info('site_content') WHERE name = 'hero_media_asset_id')
LIMIT 1;--> statement-breakpoint
INSERT INTO `__unified_media_cleanup_preflight` (`violation`)
SELECT 'experience_media missing'
WHERE NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'experience_media')
LIMIT 1;--> statement-breakpoint
DROP TABLE `__unified_media_cleanup_preflight`;--> statement-breakpoint

DROP TABLE IF EXISTS `__um_backup_blog_post_redirects`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_blog_posts`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_booking_policies`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_business_location_translations`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_business_locations`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_chowbot_conversations`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_contact_submissions`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_dashboard_preferences`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_experience_bookings`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_experience_media`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_experience_slot_overrides`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_experiences`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_google_business_connections`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_google_place_snapshots`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_guest_threads`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_invitation_access_scope`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_location_qa`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_mcp_tool_call_events`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_mcp_workspace_preferences`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_media_assets`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_menu_item_translations`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_menu_items`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_menus`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_notification_events`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_notifications`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_offerings`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_platform_docs`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_post_channel_jobs`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_post_media`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_post_translations`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_posts`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_reservation_slot_overrides`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_reservation_submissions`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_review_requests`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_reviews`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_site_content`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_site_content_translations`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_site_events`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_site_pageview_events`;--> statement-breakpoint

CREATE TABLE `__um_backup_blog_post_redirects` AS SELECT * FROM `blog_post_redirects`;--> statement-breakpoint
CREATE TABLE `__um_backup_blog_posts` AS SELECT * FROM `blog_posts`;--> statement-breakpoint
CREATE TABLE `__um_backup_booking_policies` AS SELECT * FROM `booking_policies`;--> statement-breakpoint
CREATE TABLE `__um_backup_business_location_translations` AS SELECT * FROM `business_location_translations`;--> statement-breakpoint
CREATE TABLE `__um_backup_business_locations` AS SELECT * FROM `business_locations`;--> statement-breakpoint
CREATE TABLE `__um_backup_chowbot_conversations` AS SELECT * FROM `chowbot_conversations`;--> statement-breakpoint
CREATE TABLE `__um_backup_contact_submissions` AS SELECT * FROM `contact_submissions`;--> statement-breakpoint
CREATE TABLE `__um_backup_dashboard_preferences` AS SELECT * FROM `dashboard_preferences`;--> statement-breakpoint
CREATE TABLE `__um_backup_experience_bookings` AS SELECT * FROM `experience_bookings`;--> statement-breakpoint
CREATE TABLE `__um_backup_experience_media` AS SELECT * FROM `experience_media`;--> statement-breakpoint
CREATE TABLE `__um_backup_experience_slot_overrides` AS SELECT * FROM `experience_slot_overrides`;--> statement-breakpoint
CREATE TABLE `__um_backup_experiences` AS SELECT * FROM `experiences`;--> statement-breakpoint
CREATE TABLE `__um_backup_google_business_connections` AS SELECT * FROM `google_business_connections`;--> statement-breakpoint
CREATE TABLE `__um_backup_google_place_snapshots` AS SELECT * FROM `google_place_snapshots`;--> statement-breakpoint
CREATE TABLE `__um_backup_guest_threads` AS SELECT * FROM `guest_threads`;--> statement-breakpoint
CREATE TABLE `__um_backup_invitation_access_scope` AS SELECT * FROM `invitation_access_scope`;--> statement-breakpoint
CREATE TABLE `__um_backup_location_qa` AS SELECT * FROM `location_qa`;--> statement-breakpoint
CREATE TABLE `__um_backup_mcp_tool_call_events` AS SELECT * FROM `mcp_tool_call_events`;--> statement-breakpoint
CREATE TABLE `__um_backup_mcp_workspace_preferences` AS SELECT * FROM `mcp_workspace_preferences`;--> statement-breakpoint
CREATE TABLE `__um_backup_media_assets` AS SELECT * FROM `media_assets`;--> statement-breakpoint
CREATE TABLE `__um_backup_menu_item_translations` AS SELECT * FROM `menu_item_translations`;--> statement-breakpoint
CREATE TABLE `__um_backup_menu_items` AS SELECT * FROM `menu_items`;--> statement-breakpoint
CREATE TABLE `__um_backup_menus` AS SELECT * FROM `menus`;--> statement-breakpoint
CREATE TABLE `__um_backup_notification_events` AS SELECT * FROM `notification_events`;--> statement-breakpoint
CREATE TABLE `__um_backup_notifications` AS SELECT * FROM `notifications`;--> statement-breakpoint
CREATE TABLE `__um_backup_offerings` AS SELECT * FROM `offerings`;--> statement-breakpoint
CREATE TABLE `__um_backup_platform_docs` AS SELECT * FROM `platform_docs`;--> statement-breakpoint
CREATE TABLE `__um_backup_post_channel_jobs` AS SELECT * FROM `post_channel_jobs`;--> statement-breakpoint
CREATE TABLE `__um_backup_post_media` AS SELECT * FROM `post_media`;--> statement-breakpoint
CREATE TABLE `__um_backup_post_translations` AS SELECT * FROM `post_translations`;--> statement-breakpoint
CREATE TABLE `__um_backup_posts` AS SELECT * FROM `posts`;--> statement-breakpoint
CREATE TABLE `__um_backup_reservation_slot_overrides` AS SELECT * FROM `reservation_slot_overrides`;--> statement-breakpoint
CREATE TABLE `__um_backup_reservation_submissions` AS SELECT * FROM `reservation_submissions`;--> statement-breakpoint
CREATE TABLE `__um_backup_review_requests` AS SELECT * FROM `review_requests`;--> statement-breakpoint
CREATE TABLE `__um_backup_reviews` AS SELECT * FROM `reviews`;--> statement-breakpoint
CREATE TABLE `__um_backup_site_content` AS SELECT * FROM `site_content`;--> statement-breakpoint
CREATE TABLE `__um_backup_site_content_translations` AS SELECT * FROM `site_content_translations`;--> statement-breakpoint
CREATE TABLE `__um_backup_site_events` AS SELECT * FROM `site_events`;--> statement-breakpoint
CREATE TABLE `__um_backup_site_pageview_events` AS SELECT * FROM `site_pageview_events`;--> statement-breakpoint

CREATE TABLE `__new_business_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`slug` text NOT NULL,
	`google_location_id` text,
	`google_connection_id` text,
	`title` text NOT NULL,
	`address` text,
	`city` text,
	`neighborhood` text,
	`phone` text,
	`website_url` text,
	`maps_url` text,
	`latitude` real,
	`longitude` real,
	`opening_hours` text,
	`categories` text,
	`rating` real,
	`review_count` integer,
	`is_primary` numeric DEFAULT false,
	`status` text DEFAULT 'active',
	`last_synced_at` text,
	`description` text,
	`short_description` text,
	`description_provenance` text,
	`special_hours` text,
	`price_level` text,
	`attributes` text,
	`email` text,
	`facebook_url` text,
	`facebook_page_id` text,
	`facebook_connection_id` text,
	`instagram_url` text,
	`tiktok_url` text,
	`grab_url` text,
	`uber_eats_url` text,
	`foodpanda_url` text,
	`google_place_id` text,
	`google_review_url` text,
	`hero_media_asset_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`notification_phone` text,
	`timezone` text,
	`max_capacity` integer,
	`seo_title` text,
	`seo_description` text,
	`canonical_url` text,
	`robots` text,
	`og_image_asset_id` text,
	`team_id` text,
	`feature_overrides` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`google_connection_id`) REFERENCES `google_business_connections`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`facebook_connection_id`) REFERENCES `facebook_pages_connections`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`hero_media_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`og_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `__new_business_locations` SELECT
	`id`, `organization_id`, `site_id`, `slug`, `google_location_id`, `google_connection_id`, `title`, `address`, `city`, `neighborhood`, `phone`, `website_url`, `maps_url`, `latitude`, `longitude`, `opening_hours`, `categories`, `rating`, `review_count`, `is_primary`, `status`, `last_synced_at`, `description`, `short_description`, `description_provenance`, `special_hours`, `price_level`, `attributes`, `email`, `facebook_url`, `facebook_page_id`, `facebook_connection_id`, `instagram_url`, `tiktok_url`, `grab_url`, `uber_eats_url`, `foodpanda_url`, `google_place_id`, `google_review_url`, `hero_media_asset_id`, `created_at`, `updated_at`, `notification_phone`, `timezone`, `max_capacity`, `seo_title`, `seo_description`, `canonical_url`, `robots`, `og_image_asset_id`, `team_id`, `feature_overrides`
FROM `__um_backup_business_locations`;--> statement-breakpoint
DROP TABLE `business_locations`;--> statement-breakpoint
ALTER TABLE `__new_business_locations` RENAME TO `business_locations`;--> statement-breakpoint
CREATE UNIQUE INDEX `business_locations_organization_id_site_id_slug_unique` ON `business_locations` (`organization_id`,`site_id`,`slug`);--> statement-breakpoint

INSERT OR IGNORE INTO `menus` SELECT * FROM `__um_backup_menus`;--> statement-breakpoint
UPDATE `media_assets`
SET `location_id` = (SELECT `location_id` FROM `__um_backup_media_assets` WHERE `__um_backup_media_assets`.`id` = `media_assets`.`id`)
WHERE EXISTS (SELECT 1 FROM `__um_backup_media_assets` WHERE `__um_backup_media_assets`.`id` = `media_assets`.`id`);--> statement-breakpoint

CREATE TABLE `__new_site_content` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`page` text NOT NULL,
	`field` text NOT NULL,
	`content` text,
	`hero_title` text,
	`hero_subtitle` text,
	`hero_media_asset_id` text,
	`value` text,
	`type` text NOT NULL DEFAULT 'text',
	`source` text NOT NULL DEFAULT 'manual',
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_by` text,
	`component` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`hero_media_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `__new_site_content` SELECT
	`id`, `organization_id`, `site_id`, `location_id`, `page`, `field`, `content`, `hero_title`, `hero_subtitle`, `hero_media_asset_id`, `value`, `type`, `source`, `updated_at`, `updated_by`, `component`
FROM `__um_backup_site_content`;--> statement-breakpoint
DROP TABLE `site_content`;--> statement-breakpoint
ALTER TABLE `__new_site_content` RENAME TO `site_content`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_site_content_site_level_unique` ON `site_content` (`organization_id`,`site_id`,`page`,`field`) WHERE location_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `site_content_organization_id_site_id_location_id_page_field_unique` ON `site_content` (`organization_id`,`site_id`,`location_id`,`page`,`field`);--> statement-breakpoint

CREATE TABLE `__new_experiences` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`tagline` text,
	`body` text,
	`price` text,
	`price_amount` numeric,
	`compare_at_price_amount` numeric,
	`sale_starts_at` text,
	`sale_ends_at` text,
	`duration_minutes` integer,
	`max_capacity` integer,
	`time_slots` text,
	`recurring_slots` text,
	`available_note` text,
	`status` text NOT NULL DEFAULT 'active',
	`sort_order` integer NOT NULL DEFAULT 0,
	`featured` numeric NOT NULL DEFAULT false,
	`featured_sort_order` integer NOT NULL DEFAULT 0,
	`seo_title` text,
	`seo_description` text,
	`canonical_url` text,
	`robots` text,
	`og_image_asset_id` text,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`created_by` text,
	`highlights` text,
	`included_items` text,
	`what_to_bring` text,
	`meeting_point` text,
	`cancellation_policy` text,
	`source` text NOT NULL DEFAULT 'manual',
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`og_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT `experiences_source_check` CHECK (source IN ('manual', 'template'))
);--> statement-breakpoint
INSERT INTO `__new_experiences` SELECT
	`id`, `organization_id`, `site_id`, `location_id`, `title`, `slug`, `tagline`, `body`, `price`, `price_amount`, `compare_at_price_amount`, `sale_starts_at`, `sale_ends_at`, `duration_minutes`, `max_capacity`, `time_slots`, `recurring_slots`, `available_note`, `status`, `sort_order`, `featured`, `featured_sort_order`, `seo_title`, `seo_description`, `canonical_url`, `robots`, `og_image_asset_id`, `created_at`, `updated_at`, `created_by`, `highlights`, `included_items`, `what_to_bring`, `meeting_point`, `cancellation_policy`, `source`
FROM `__um_backup_experiences`;--> statement-breakpoint
DROP TABLE `experiences`;--> statement-breakpoint
ALTER TABLE `__new_experiences` RENAME TO `experiences`;--> statement-breakpoint
CREATE INDEX `experiences_org_site_idx` ON `experiences` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `experiences_org_site_id_unique` ON `experiences` (`organization_id`,`site_id`,`id`);--> statement-breakpoint

CREATE TABLE `__new_blog_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`site_id` text,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`body` text NOT NULL,
	`excerpt` text,
	`category` text,
	`tags_json` text,
	`nav_section` text,
	`nav_title` text,
	`nav_order` integer,
	`nav_section_order` integer,
	`hide_from_nav` integer NOT NULL DEFAULT 0,
	`featured_order` integer,
	`status` text NOT NULL DEFAULT 'draft',
	`visibility` text NOT NULL DEFAULT 'public',
	`author_id` text,
	`featured_image_asset_id` text,
	`social_image_asset_id` text,
	`published_at` text,
	`first_published_at` text,
	`scheduled_for` text,
	`scheduled_revision_id` text,
	`slug_manually_overridden` integer NOT NULL DEFAULT 0,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`seo_title` text,
	`seo_description` text,
	`seo_keywords` text,
	`canonical_url` text,
	`robots` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`featured_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`social_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT `blog_posts_scope_check` CHECK ((organization_id IS NULL AND site_id IS NULL) OR (organization_id IS NOT NULL AND site_id IS NOT NULL)),
	CONSTRAINT `blog_posts_status_check` CHECK (status IN ('draft', 'published', 'scheduled', 'archived')),
	CONSTRAINT `blog_posts_visibility_check` CHECK (visibility IN ('public', 'unlisted')),
	CONSTRAINT `blog_posts_category_check` CHECK (site_id IS NOT NULL OR category IS NOT NULL)
);--> statement-breakpoint
INSERT INTO `__new_blog_posts` SELECT * FROM `__um_backup_blog_posts`;--> statement-breakpoint
DROP TABLE `blog_posts`;--> statement-breakpoint
ALTER TABLE `__new_blog_posts` RENAME TO `blog_posts`;--> statement-breakpoint
CREATE UNIQUE INDEX `blog_posts_platform_slug_idx` ON `blog_posts` (`slug`) WHERE site_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `blog_posts_site_slug_idx` ON `blog_posts` (`site_id`,`slug`) WHERE site_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `blog_posts_org_site_idx` ON `blog_posts` (`organization_id`,`site_id`);--> statement-breakpoint

CREATE TABLE `__new_menu_items` (
	`id` text PRIMARY KEY NOT NULL,
	`menu_id` text NOT NULL,
	`section` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL DEFAULT '',
	`description` text,
	`price_amount` numeric,
	`compare_at_price_amount` numeric,
	`sale_starts_at` text,
	`sale_ends_at` text,
	`image_asset_id` text,
	`available` numeric NOT NULL DEFAULT 1,
	`featured` numeric NOT NULL DEFAULT false,
	`featured_sort_order` integer NOT NULL DEFAULT 0,
	`sort_order` integer NOT NULL DEFAULT 0,
	`allergens` text,
	`ingredients` text,
	`dietary_notes` text,
	`preparation` text,
	`serving_note` text,
	`source` text NOT NULL DEFAULT 'manual',
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`created_by` text,
	`updated_by` text,
	`seo_title` text,
	`seo_description` text,
	`canonical_url` text,
	`robots` text,
	`og_image_asset_id` text,
	FOREIGN KEY (`menu_id`) REFERENCES `menus`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`og_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT `menu_items_source_check` CHECK (source IN ('manual', 'template'))
);--> statement-breakpoint
INSERT INTO `__new_menu_items` SELECT
	`id`, `menu_id`, `section`, `name`, COALESCE(`slug`, ''), `description`, `price_amount`, `compare_at_price_amount`, `sale_starts_at`, `sale_ends_at`, `image_asset_id`, COALESCE(`available`, 1), COALESCE(`featured`, false), COALESCE(`featured_sort_order`, 0), COALESCE(`sort_order`, 0), `allergens`, `ingredients`, `dietary_notes`, `preparation`, `serving_note`, COALESCE(`source`, 'manual'), COALESCE(`created_at`, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), COALESCE(`updated_at`, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), `created_by`, `updated_by`, `seo_title`, `seo_description`, `canonical_url`, `robots`, `og_image_asset_id`
FROM `__um_backup_menu_items`;--> statement-breakpoint
DROP TABLE `menu_items`;--> statement-breakpoint
ALTER TABLE `__new_menu_items` RENAME TO `menu_items`;--> statement-breakpoint
CREATE INDEX `menu_items_menu_id_idx` ON `menu_items` (`menu_id`);--> statement-breakpoint

CREATE TABLE `__new_platform_docs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`body` text NOT NULL,
	`excerpt` text,
	`category` text,
	`nav_section` text,
	`nav_title` text,
	`nav_order` integer,
	`nav_section_order` integer,
	`nav_group` text,
	`nav_group_order` integer,
	`hide_from_nav` integer NOT NULL DEFAULT 0,
	`featured_order` integer,
	`author_id` text,
	`seo_description` text,
	`seo_keywords` text,
	`featured_image_asset_id` text,
	`sort_order` integer DEFAULT 0,
	`parent_doc_id` text,
	`difficulty_level` text,
	`status` text NOT NULL DEFAULT 'draft',
	`published_at` text,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`canonical_url` text,
	`robots` text,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`featured_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `__new_platform_docs` SELECT * FROM `__um_backup_platform_docs`;--> statement-breakpoint
DROP TABLE `platform_docs`;--> statement-breakpoint
ALTER TABLE `__new_platform_docs` RENAME TO `platform_docs`;--> statement-breakpoint
CREATE UNIQUE INDEX `platform_docs_slug_unique` ON `platform_docs` (`slug`);--> statement-breakpoint

CREATE TABLE `__new_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`google_post_id` text,
	`slug` text,
	`post_type` text NOT NULL DEFAULT 'standard',
	`title` text,
	`body` text NOT NULL,
	`image_asset_id` text,
	`seo_title` text,
	`seo_description` text,
	`og_image_asset_id` text,
	`cta_type` text,
	`cta_url` text,
	`event_title` text,
	`event_start` text,
	`event_end` text,
	`offer_coupon` text,
	`offer_terms` text,
	`status` text NOT NULL DEFAULT 'draft',
	`scheduled_for` text,
	`published_at` text,
	`source` text NOT NULL DEFAULT 'manual',
	`created_by` text NOT NULL,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`og_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT `posts_source_check` CHECK (source IN ('manual', 'template'))
);--> statement-breakpoint
INSERT INTO `__new_posts` SELECT
	`id`, `organization_id`, `site_id`, `location_id`, `google_post_id`, `slug`, COALESCE(`post_type`, 'standard'), `title`, `body`, `image_asset_id`, `seo_title`, `seo_description`, `og_image_asset_id`, `cta_type`, `cta_url`, `event_title`, `event_start`, `event_end`, `offer_coupon`, `offer_terms`, COALESCE(`status`, 'draft'), `scheduled_for`, `published_at`, COALESCE(`source`, 'manual'), `created_by`, COALESCE(`created_at`, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), COALESCE(`updated_at`, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
FROM `__um_backup_posts`;--> statement-breakpoint
DROP TABLE `posts`;--> statement-breakpoint
ALTER TABLE `__new_posts` RENAME TO `posts`;--> statement-breakpoint
CREATE UNIQUE INDEX `posts_site_slug_idx` ON `posts` (`site_id`,`slug`);--> statement-breakpoint
CREATE INDEX `posts_org_site_idx` ON `posts` (`organization_id`,`site_id`);--> statement-breakpoint

CREATE TABLE `__new_experience_media` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`experience_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`experience_id`) REFERENCES `experiences`(`organization_id`,`site_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`asset_id`) REFERENCES `media_assets`(`organization_id`,`site_id`,`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_experience_media` SELECT * FROM `__um_backup_experience_media`;--> statement-breakpoint
DROP TABLE `experience_media`;--> statement-breakpoint
ALTER TABLE `__new_experience_media` RENAME TO `experience_media`;--> statement-breakpoint
CREATE INDEX `experience_media_experience_order_idx` ON `experience_media` (`experience_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `experience_media_site_experience_idx` ON `experience_media` (`site_id`,`experience_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `experience_media_experience_asset_unique` ON `experience_media` (`experience_id`,`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `experience_media_experience_sort_unique` ON `experience_media` (`experience_id`,`sort_order`);--> statement-breakpoint

INSERT OR IGNORE INTO `blog_post_redirects` SELECT * FROM `__um_backup_blog_post_redirects`;--> statement-breakpoint
INSERT OR IGNORE INTO `booking_policies` SELECT * FROM `__um_backup_booking_policies`;--> statement-breakpoint
INSERT OR IGNORE INTO `business_location_translations` SELECT * FROM `__um_backup_business_location_translations`;--> statement-breakpoint
INSERT OR IGNORE INTO `chowbot_conversations` SELECT * FROM `__um_backup_chowbot_conversations`;--> statement-breakpoint
INSERT OR IGNORE INTO `contact_submissions` SELECT * FROM `__um_backup_contact_submissions`;--> statement-breakpoint
INSERT OR IGNORE INTO `dashboard_preferences` SELECT * FROM `__um_backup_dashboard_preferences`;--> statement-breakpoint
INSERT OR IGNORE INTO `experience_bookings` SELECT * FROM `__um_backup_experience_bookings`;--> statement-breakpoint
INSERT OR IGNORE INTO `experience_slot_overrides` SELECT * FROM `__um_backup_experience_slot_overrides`;--> statement-breakpoint
INSERT OR IGNORE INTO `google_business_connections` SELECT * FROM `__um_backup_google_business_connections`;--> statement-breakpoint
INSERT OR IGNORE INTO `google_place_snapshots` SELECT * FROM `__um_backup_google_place_snapshots`;--> statement-breakpoint
INSERT OR IGNORE INTO `guest_threads` SELECT * FROM `__um_backup_guest_threads`;--> statement-breakpoint
INSERT OR IGNORE INTO `invitation_access_scope` SELECT * FROM `__um_backup_invitation_access_scope`;--> statement-breakpoint
INSERT OR IGNORE INTO `location_qa` SELECT * FROM `__um_backup_location_qa`;--> statement-breakpoint
INSERT OR IGNORE INTO `mcp_tool_call_events` SELECT * FROM `__um_backup_mcp_tool_call_events`;--> statement-breakpoint
INSERT OR IGNORE INTO `mcp_workspace_preferences` SELECT * FROM `__um_backup_mcp_workspace_preferences`;--> statement-breakpoint
INSERT OR IGNORE INTO `menu_item_translations` SELECT * FROM `__um_backup_menu_item_translations`;--> statement-breakpoint
INSERT OR IGNORE INTO `notification_events` SELECT * FROM `__um_backup_notification_events`;--> statement-breakpoint
INSERT OR IGNORE INTO `notifications` SELECT * FROM `__um_backup_notifications`;--> statement-breakpoint
INSERT OR IGNORE INTO `offerings` SELECT * FROM `__um_backup_offerings`;--> statement-breakpoint
INSERT OR IGNORE INTO `post_channel_jobs` SELECT * FROM `__um_backup_post_channel_jobs`;--> statement-breakpoint
INSERT OR IGNORE INTO `post_media` SELECT * FROM `__um_backup_post_media`;--> statement-breakpoint
INSERT OR IGNORE INTO `post_translations` SELECT * FROM `__um_backup_post_translations`;--> statement-breakpoint
INSERT OR IGNORE INTO `reservation_slot_overrides` SELECT * FROM `__um_backup_reservation_slot_overrides`;--> statement-breakpoint
INSERT OR IGNORE INTO `reservation_submissions` SELECT * FROM `__um_backup_reservation_submissions`;--> statement-breakpoint
INSERT OR IGNORE INTO `review_requests` SELECT * FROM `__um_backup_review_requests`;--> statement-breakpoint
INSERT OR IGNORE INTO `reviews` SELECT * FROM `__um_backup_reviews`;--> statement-breakpoint
INSERT OR IGNORE INTO `site_content_translations` SELECT * FROM `__um_backup_site_content_translations`;--> statement-breakpoint
INSERT OR IGNORE INTO `site_events` SELECT * FROM `__um_backup_site_events`;--> statement-breakpoint
INSERT OR IGNORE INTO `site_pageview_events` SELECT * FROM `__um_backup_site_pageview_events`;--> statement-breakpoint

UPDATE `chowbot_conversations` SET `selected_location_id` = (SELECT `selected_location_id` FROM `__um_backup_chowbot_conversations` WHERE `__um_backup_chowbot_conversations`.`id` = `chowbot_conversations`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_chowbot_conversations` WHERE `__um_backup_chowbot_conversations`.`id` = `chowbot_conversations`.`id`);--> statement-breakpoint
UPDATE `contact_submissions` SET `location_id` = (SELECT `location_id` FROM `__um_backup_contact_submissions` WHERE `__um_backup_contact_submissions`.`id` = `contact_submissions`.`id`), `experience_id` = (SELECT `experience_id` FROM `__um_backup_contact_submissions` WHERE `__um_backup_contact_submissions`.`id` = `contact_submissions`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_contact_submissions` WHERE `__um_backup_contact_submissions`.`id` = `contact_submissions`.`id`);--> statement-breakpoint
UPDATE `dashboard_preferences` SET `selected_location_id` = (SELECT `selected_location_id` FROM `__um_backup_dashboard_preferences` WHERE `__um_backup_dashboard_preferences`.`id` = `dashboard_preferences`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_dashboard_preferences` WHERE `__um_backup_dashboard_preferences`.`id` = `dashboard_preferences`.`id`);--> statement-breakpoint
UPDATE `google_business_connections` SET `location_id` = (SELECT `location_id` FROM `__um_backup_google_business_connections` WHERE `__um_backup_google_business_connections`.`id` = `google_business_connections`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_google_business_connections` WHERE `__um_backup_google_business_connections`.`id` = `google_business_connections`.`id`);--> statement-breakpoint
UPDATE `google_place_snapshots` SET `location_id` = (SELECT `location_id` FROM `__um_backup_google_place_snapshots` WHERE `__um_backup_google_place_snapshots`.`id` = `google_place_snapshots`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_google_place_snapshots` WHERE `__um_backup_google_place_snapshots`.`id` = `google_place_snapshots`.`id`);--> statement-breakpoint
UPDATE `guest_threads` SET `location_id` = (SELECT `location_id` FROM `__um_backup_guest_threads` WHERE `__um_backup_guest_threads`.`id` = `guest_threads`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_guest_threads` WHERE `__um_backup_guest_threads`.`id` = `guest_threads`.`id`);--> statement-breakpoint
UPDATE `mcp_tool_call_events` SET `location_id` = (SELECT `location_id` FROM `__um_backup_mcp_tool_call_events` WHERE `__um_backup_mcp_tool_call_events`.`id` = `mcp_tool_call_events`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_mcp_tool_call_events` WHERE `__um_backup_mcp_tool_call_events`.`id` = `mcp_tool_call_events`.`id`);--> statement-breakpoint
UPDATE `mcp_workspace_preferences` SET `location_id` = (SELECT `location_id` FROM `__um_backup_mcp_workspace_preferences` WHERE `__um_backup_mcp_workspace_preferences`.`user_id` = `mcp_workspace_preferences`.`user_id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_mcp_workspace_preferences` WHERE `__um_backup_mcp_workspace_preferences`.`user_id` = `mcp_workspace_preferences`.`user_id`);--> statement-breakpoint
UPDATE `notification_events` SET `location_id` = (SELECT `location_id` FROM `__um_backup_notification_events` WHERE `__um_backup_notification_events`.`id` = `notification_events`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_notification_events` WHERE `__um_backup_notification_events`.`id` = `notification_events`.`id`);--> statement-breakpoint
UPDATE `notifications` SET `location_id` = (SELECT `location_id` FROM `__um_backup_notifications` WHERE `__um_backup_notifications`.`id` = `notifications`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_notifications` WHERE `__um_backup_notifications`.`id` = `notifications`.`id`);--> statement-breakpoint
UPDATE `offerings` SET `location_id` = (SELECT `location_id` FROM `__um_backup_offerings` WHERE `__um_backup_offerings`.`id` = `offerings`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_offerings` WHERE `__um_backup_offerings`.`id` = `offerings`.`id`);--> statement-breakpoint
UPDATE `review_requests` SET `location_id` = (SELECT `location_id` FROM `__um_backup_review_requests` WHERE `__um_backup_review_requests`.`id` = `review_requests`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_review_requests` WHERE `__um_backup_review_requests`.`id` = `review_requests`.`id`);--> statement-breakpoint
UPDATE `site_events` SET `location_id` = (SELECT `location_id` FROM `__um_backup_site_events` WHERE `__um_backup_site_events`.`id` = `site_events`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_site_events` WHERE `__um_backup_site_events`.`id` = `site_events`.`id`);--> statement-breakpoint
UPDATE `site_pageview_events` SET `location_id` = (SELECT `location_id` FROM `__um_backup_site_pageview_events` WHERE `__um_backup_site_pageview_events`.`id` = `site_pageview_events`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_site_pageview_events` WHERE `__um_backup_site_pageview_events`.`id` = `site_pageview_events`.`id`);--> statement-breakpoint

DROP TABLE `media_assets_old`;--> statement-breakpoint

DROP TABLE `__um_backup_blog_post_redirects`;--> statement-breakpoint
DROP TABLE `__um_backup_blog_posts`;--> statement-breakpoint
DROP TABLE `__um_backup_booking_policies`;--> statement-breakpoint
DROP TABLE `__um_backup_business_location_translations`;--> statement-breakpoint
DROP TABLE `__um_backup_business_locations`;--> statement-breakpoint
DROP TABLE `__um_backup_chowbot_conversations`;--> statement-breakpoint
DROP TABLE `__um_backup_contact_submissions`;--> statement-breakpoint
DROP TABLE `__um_backup_dashboard_preferences`;--> statement-breakpoint
DROP TABLE `__um_backup_experience_bookings`;--> statement-breakpoint
DROP TABLE `__um_backup_experience_media`;--> statement-breakpoint
DROP TABLE `__um_backup_experience_slot_overrides`;--> statement-breakpoint
DROP TABLE `__um_backup_experiences`;--> statement-breakpoint
DROP TABLE `__um_backup_google_business_connections`;--> statement-breakpoint
DROP TABLE `__um_backup_google_place_snapshots`;--> statement-breakpoint
DROP TABLE `__um_backup_guest_threads`;--> statement-breakpoint
DROP TABLE `__um_backup_invitation_access_scope`;--> statement-breakpoint
DROP TABLE `__um_backup_location_qa`;--> statement-breakpoint
DROP TABLE `__um_backup_mcp_tool_call_events`;--> statement-breakpoint
DROP TABLE `__um_backup_mcp_workspace_preferences`;--> statement-breakpoint
DROP TABLE `__um_backup_media_assets`;--> statement-breakpoint
DROP TABLE `__um_backup_menu_item_translations`;--> statement-breakpoint
DROP TABLE `__um_backup_menu_items`;--> statement-breakpoint
DROP TABLE `__um_backup_menus`;--> statement-breakpoint
DROP TABLE `__um_backup_notification_events`;--> statement-breakpoint
DROP TABLE `__um_backup_notifications`;--> statement-breakpoint
DROP TABLE `__um_backup_offerings`;--> statement-breakpoint
DROP TABLE `__um_backup_platform_docs`;--> statement-breakpoint
DROP TABLE `__um_backup_post_channel_jobs`;--> statement-breakpoint
DROP TABLE `__um_backup_post_media`;--> statement-breakpoint
DROP TABLE `__um_backup_post_translations`;--> statement-breakpoint
DROP TABLE `__um_backup_posts`;--> statement-breakpoint
DROP TABLE `__um_backup_reservation_slot_overrides`;--> statement-breakpoint
DROP TABLE `__um_backup_reservation_submissions`;--> statement-breakpoint
DROP TABLE `__um_backup_review_requests`;--> statement-breakpoint
DROP TABLE `__um_backup_reviews`;--> statement-breakpoint
DROP TABLE `__um_backup_site_content`;--> statement-breakpoint
DROP TABLE `__um_backup_site_content_translations`;--> statement-breakpoint
DROP TABLE `__um_backup_site_events`;--> statement-breakpoint
DROP TABLE `__um_backup_site_pageview_events`;
