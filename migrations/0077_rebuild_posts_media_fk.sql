-- Retarget posts.image_asset_id from media_assets_old to media_assets as a
-- bounded posts cluster rebuild.

DROP TABLE IF EXISTS `__um_assert_0077`;--> statement-breakpoint
DROP TABLE IF EXISTS `__new_posts`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_posts`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_post_channel_jobs`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_post_translations`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_post_media`;--> statement-breakpoint

CREATE TABLE `__um_backup_posts` AS SELECT * FROM `posts`;--> statement-breakpoint
CREATE TABLE `__um_backup_post_channel_jobs` AS SELECT * FROM `post_channel_jobs`;--> statement-breakpoint
CREATE TABLE `__um_backup_post_translations` AS SELECT * FROM `post_translations`;--> statement-breakpoint
CREATE TABLE `__um_backup_post_media` AS SELECT * FROM `post_media`;--> statement-breakpoint

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

INSERT INTO `post_channel_jobs` SELECT * FROM `__um_backup_post_channel_jobs`;--> statement-breakpoint
INSERT INTO `post_translations` SELECT * FROM `__um_backup_post_translations`;--> statement-breakpoint
INSERT INTO `post_media` SELECT * FROM `__um_backup_post_media`;--> statement-breakpoint

CREATE TABLE `__um_assert_0077` (`violation` text NOT NULL CHECK (`violation` = ''));--> statement-breakpoint
INSERT INTO `__um_assert_0077` (`violation`)
SELECT 'posts_backup_count_mismatch'
WHERE (SELECT COUNT(*) FROM `__um_backup_posts`) != (SELECT COUNT(*) FROM `posts`)
LIMIT 1;--> statement-breakpoint
INSERT INTO `__um_assert_0077` (`violation`)
SELECT 'post_channel_jobs_backup_count_mismatch'
WHERE (SELECT COUNT(*) FROM `__um_backup_post_channel_jobs`) != (SELECT COUNT(*) FROM `post_channel_jobs`)
LIMIT 1;--> statement-breakpoint
INSERT INTO `__um_assert_0077` (`violation`)
SELECT 'post_translations_backup_count_mismatch'
WHERE (SELECT COUNT(*) FROM `__um_backup_post_translations`) != (SELECT COUNT(*) FROM `post_translations`)
LIMIT 1;--> statement-breakpoint
INSERT INTO `__um_assert_0077` (`violation`)
SELECT 'post_media_backup_count_mismatch'
WHERE (SELECT COUNT(*) FROM `__um_backup_post_media`) != (SELECT COUNT(*) FROM `post_media`)
LIMIT 1;--> statement-breakpoint
INSERT INTO `__um_assert_0077` (`violation`)
SELECT 'posts foreign key check failed'
WHERE EXISTS (SELECT 1 FROM pragma_foreign_key_check)
LIMIT 1;--> statement-breakpoint
DROP TABLE `__um_assert_0077`;--> statement-breakpoint
DROP TABLE `__um_backup_post_media`;--> statement-breakpoint
DROP TABLE `__um_backup_post_translations`;--> statement-breakpoint
DROP TABLE `__um_backup_post_channel_jobs`;--> statement-breakpoint
DROP TABLE `__um_backup_posts`;
