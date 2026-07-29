-- Retarget menu_items.image_asset_id from media_assets_old to media_assets as
-- its own bounded cluster.

DROP TABLE IF EXISTS `__um_assert_0075`;--> statement-breakpoint
DROP TABLE IF EXISTS `__new_menu_items`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_menu_items`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_menu_item_translations`;--> statement-breakpoint

CREATE TABLE `__um_backup_menu_items` AS SELECT * FROM `menu_items`;--> statement-breakpoint
CREATE TABLE `__um_backup_menu_item_translations` AS SELECT * FROM `menu_item_translations`;--> statement-breakpoint

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

INSERT INTO `menu_item_translations` SELECT * FROM `__um_backup_menu_item_translations`;--> statement-breakpoint

CREATE TABLE `__um_assert_0075` (`violation` text NOT NULL CHECK (`violation` = ''));--> statement-breakpoint
INSERT INTO `__um_assert_0075` (`violation`)
SELECT 'menu_items_backup_count_mismatch'
WHERE (SELECT COUNT(*) FROM `__um_backup_menu_items`) != (SELECT COUNT(*) FROM `menu_items`)
LIMIT 1;--> statement-breakpoint
INSERT INTO `__um_assert_0075` (`violation`)
SELECT 'menu_item_translations_backup_count_mismatch'
WHERE (SELECT COUNT(*) FROM `__um_backup_menu_item_translations`) != (SELECT COUNT(*) FROM `menu_item_translations`)
LIMIT 1;--> statement-breakpoint
INSERT INTO `__um_assert_0075` (`violation`)
SELECT 'menu_items foreign key check failed'
WHERE EXISTS (SELECT 1 FROM pragma_foreign_key_check)
LIMIT 1;--> statement-breakpoint
DROP TABLE `__um_assert_0075`;--> statement-breakpoint
DROP TABLE `__um_backup_menu_item_translations`;--> statement-breakpoint
DROP TABLE `__um_backup_menu_items`;
