-- Retarget platform_docs.featured_image_asset_id from media_assets_old to
-- media_assets as a bounded single-table rebuild.

DROP TABLE IF EXISTS `__um_assert_0076`;--> statement-breakpoint
DROP TABLE IF EXISTS `__new_platform_docs`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_platform_docs`;--> statement-breakpoint

CREATE TABLE `__um_backup_platform_docs` AS SELECT * FROM `platform_docs`;--> statement-breakpoint

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

CREATE TABLE `__um_assert_0076` (`violation` text NOT NULL CHECK (`violation` = ''));--> statement-breakpoint
INSERT INTO `__um_assert_0076` (`violation`)
SELECT 'platform_docs_backup_count_mismatch'
WHERE (SELECT COUNT(*) FROM `__um_backup_platform_docs`) != (SELECT COUNT(*) FROM `platform_docs`)
LIMIT 1;--> statement-breakpoint
INSERT INTO `__um_assert_0076` (`violation`)
SELECT 'platform_docs foreign key check failed'
WHERE EXISTS (SELECT 1 FROM pragma_foreign_key_check)
LIMIT 1;--> statement-breakpoint
DROP TABLE `__um_assert_0076`;--> statement-breakpoint
DROP TABLE `__um_backup_platform_docs`;
