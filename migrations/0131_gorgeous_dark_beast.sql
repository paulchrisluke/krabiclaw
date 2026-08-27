-- Drop dead media_assets.google_media_name column (confirmed zero rows on
-- local + staging, zero code references) and narrow provider/source CHECKs
-- to the values actually used (also confirmed zero rows use the wider
-- legacy values from migration 0130's rebuild). Also formally adds the
-- media_assets_status_check that already existed as an inline column CHECK
-- since 0130, and widens category to include 'logo'/'blog' (staging has one
-- live row using 'logo').
--
-- media_placements has a cascading FK into media_assets(organization_id,
-- site_id, id) (media_placements_asset_scope_fk, ON DELETE CASCADE). D1
-- executes that cascade against the live child table during the parent's
-- DROP TABLE even under PRAGMA foreign_keys=OFF (confirmed empirically this
-- session: an identical media_assets-only rebuild silently deleted all 429
-- media_placements rows in local testing). Both tables are rebuilt together
-- here, child dropped before parent, per CLAUDE.md's Database Schema
-- Workflow section.

DROP TABLE IF EXISTS `__um_assert_0131`;--> statement-breakpoint
DROP TABLE IF EXISTS `__new_media_assets`;--> statement-breakpoint
DROP TABLE IF EXISTS `__new_media_placements`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_media_assets`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_media_placements`;--> statement-breakpoint

CREATE TABLE `__um_backup_media_assets` AS SELECT
  `id`, `organization_id`, `site_id`, `kind`, `provider`, `source`,
  `cloudflare_image_id`, `r2_key`, `public_url`, `thumbnail_url`, `mime_type`,
  `file_name`, `file_size`, `width`, `height`, `duration`, `alt_text`,
  `category`, `status`, `created_by_user_id`, `created_at`, `updated_at`
FROM `media_assets`;--> statement-breakpoint
CREATE TABLE `__um_backup_media_placements` AS SELECT * FROM `media_placements`;--> statement-breakpoint

PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`kind` text NOT NULL,
	`provider` text NOT NULL,
	`source` text NOT NULL,
	`cloudflare_image_id` text,
	`r2_key` text,
	`public_url` text,
	`thumbnail_url` text,
	`mime_type` text,
	`file_name` text,
	`file_size` integer,
	`width` integer,
	`height` integer,
	`duration` integer,
	`alt_text` text,
	`category` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "media_assets_category_check" CHECK(category IS NULL OR category IN ('exterior', 'interior', 'food', 'menu', 'team', 'other', 'logo', 'blog')),
	CONSTRAINT "media_assets_status_check" CHECK(status IN ('pending', 'active', 'deleted', 'failed')),
	CONSTRAINT "media_assets_provider_check" CHECK(provider IN ('cloudflare_images', 'cloudflare_r2')),
	CONSTRAINT "media_assets_source_check" CHECK(source IN ('uploaded', 'generated', 'external'))
);--> statement-breakpoint
DROP INDEX `media_assets_org_site_id_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_org_site_id_unique` ON `__new_media_assets` (`organization_id`,`site_id`,`id`);--> statement-breakpoint
CREATE TABLE `__new_media_placements` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`slot` text NOT NULL,
	`asset_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`asset_id`) REFERENCES `__new_media_assets`(`organization_id`,`site_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "media_placements_owner_type_check" CHECK(owner_type IN ('site','business_location','menu_item','post','blog_post','experience','offering','content_block','platform_doc','review','review_request','tenant_compliance','chowbot_message')),
	CONSTRAINT "media_placements_slot_check" CHECK((owner_type = 'site' AND (slot IN ('logo','logo_dark','favicon'))) OR (owner_type = 'business_location' AND (slot IN ('hero','gallery'))) OR (owner_type = 'menu_item' AND (slot = 'gallery')) OR (owner_type = 'post' AND (slot IN ('cover','gallery'))) OR (owner_type = 'blog_post' AND (slot = 'featured')) OR (owner_type = 'experience' AND (slot = 'gallery')) OR (owner_type = 'offering' AND (slot IN ('thumbnail','hero','gallery') OR slot GLOB 'features.[0-9]*.image')) OR (owner_type = 'content_block' AND (slot IN ('media','gallery','background','featured','decoration') OR slot GLOB 'items.[0-9]*.image' OR slot GLOB 'images.[0-9]*' OR slot GLOB 'features.[0-9]*.icon' OR slot GLOB 'people.[0-9]*.image')) OR (owner_type = 'platform_doc' AND (slot = 'featured')) OR (owner_type = 'review' AND (slot IN ('portrait','gallery'))) OR (owner_type = 'review_request' AND (slot = 'gallery')) OR (owner_type = 'tenant_compliance' AND (slot = 'document')) OR (owner_type = 'chowbot_message' AND (slot = 'attachment'))),
	CONSTRAINT "media_placements_status_check" CHECK(status IN ('pending', 'active', 'rejected'))
);--> statement-breakpoint
INSERT INTO `__new_media_assets` SELECT * FROM `__um_backup_media_assets`;--> statement-breakpoint
INSERT INTO `__new_media_placements` SELECT * FROM `__um_backup_media_placements`;--> statement-breakpoint
DROP TABLE `media_placements`;--> statement-breakpoint
DROP TABLE `media_assets`;--> statement-breakpoint
ALTER TABLE `__new_media_assets` RENAME TO `media_assets`;--> statement-breakpoint
ALTER TABLE `__new_media_placements` RENAME TO `media_placements`;--> statement-breakpoint
CREATE INDEX `media_placements_owner_idx` ON `media_placements` (`site_id`,`owner_type`,`owner_id`,`slot`,`sort_order`);--> statement-breakpoint
CREATE INDEX `media_placements_asset_idx` ON `media_placements` (`organization_id`,`site_id`,`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_placements_owner_slot_asset_unique` ON `media_placements` (`owner_type`,`owner_id`,`slot`,`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_placements_owner_slot_order_unique` ON `media_placements` (`owner_type`,`owner_id`,`slot`,`sort_order`);--> statement-breakpoint
CREATE TRIGGER `media_assets_category_insert_guard`
BEFORE INSERT ON `media_assets`
WHEN NEW.`category` IS NOT NULL
  AND NEW.`category` NOT IN ('exterior', 'interior', 'food', 'menu', 'team', 'other', 'logo', 'blog')
BEGIN
  SELECT RAISE(ABORT, 'media_assets category is invalid');
END;--> statement-breakpoint
CREATE TRIGGER `media_assets_category_update_guard`
BEFORE UPDATE OF `category` ON `media_assets`
WHEN NEW.`category` IS NOT NULL
  AND NEW.`category` NOT IN ('exterior', 'interior', 'food', 'menu', 'team', 'other', 'logo', 'blog')
BEGIN
  SELECT RAISE(ABORT, 'media_assets category is invalid');
END;--> statement-breakpoint
CREATE TRIGGER media_assets_video_thumbnail_insert
BEFORE INSERT ON media_assets
WHEN NEW.kind = 'video' AND (NEW.thumbnail_url IS NULL OR length(trim(NEW.thumbnail_url)) = 0)
BEGIN
  SELECT RAISE(ABORT, 'video assets require thumbnail_url');
END;--> statement-breakpoint
CREATE TRIGGER media_assets_video_thumbnail_update
BEFORE UPDATE OF kind, thumbnail_url ON media_assets
WHEN NEW.kind = 'video' AND (NEW.thumbnail_url IS NULL OR length(trim(NEW.thumbnail_url)) = 0)
BEGIN
  SELECT RAISE(ABORT, 'video assets require thumbnail_url');
END;--> statement-breakpoint

CREATE TABLE `__um_assert_0131` (`violation` text NOT NULL CHECK (`violation` = ''));--> statement-breakpoint
INSERT INTO `__um_assert_0131` (`violation`)
SELECT 'media_assets_backup_count_mismatch'
WHERE (SELECT COUNT(*) FROM `__um_backup_media_assets`) != (SELECT COUNT(*) FROM `media_assets`)
LIMIT 1;--> statement-breakpoint
INSERT INTO `__um_assert_0131` (`violation`)
SELECT 'media_placements_backup_count_mismatch'
WHERE (SELECT COUNT(*) FROM `__um_backup_media_placements`) != (SELECT COUNT(*) FROM `media_placements`)
LIMIT 1;--> statement-breakpoint
INSERT INTO `__um_assert_0131` (`violation`)
SELECT 'media_assets/media_placements foreign key check failed'
WHERE EXISTS (SELECT 1 FROM pragma_foreign_key_check)
LIMIT 1;--> statement-breakpoint
DROP TABLE `__um_assert_0131`;--> statement-breakpoint
DROP TABLE `__um_backup_media_placements`;--> statement-breakpoint
DROP TABLE `__um_backup_media_assets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
