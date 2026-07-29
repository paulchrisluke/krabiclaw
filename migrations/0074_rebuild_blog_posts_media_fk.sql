-- Retarget blog_posts.featured_image_asset_id from media_assets_old to
-- media_assets as a bounded cluster. Backups are kept until row-count and FK
-- assertions pass.

DROP TABLE IF EXISTS `__um_assert_0074`;--> statement-breakpoint
DROP TABLE IF EXISTS `__new_blog_posts`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_blog_posts`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_blog_post_redirects`;--> statement-breakpoint

CREATE TABLE `__um_backup_blog_posts` AS SELECT * FROM `blog_posts`;--> statement-breakpoint
CREATE TABLE `__um_backup_blog_post_redirects` AS SELECT * FROM `blog_post_redirects`;--> statement-breakpoint

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

INSERT INTO `blog_post_redirects` SELECT * FROM `__um_backup_blog_post_redirects`;--> statement-breakpoint

CREATE TABLE `__um_assert_0074` (`violation` text NOT NULL CHECK (`violation` = ''));--> statement-breakpoint
INSERT INTO `__um_assert_0074` (`violation`)
SELECT 'blog_posts_backup_count_mismatch'
WHERE (SELECT COUNT(*) FROM `__um_backup_blog_posts`) != (SELECT COUNT(*) FROM `blog_posts`)
LIMIT 1;--> statement-breakpoint
INSERT INTO `__um_assert_0074` (`violation`)
SELECT 'blog_post_redirects_backup_count_mismatch'
WHERE (SELECT COUNT(*) FROM `__um_backup_blog_post_redirects`) != (SELECT COUNT(*) FROM `blog_post_redirects`)
LIMIT 1;--> statement-breakpoint
INSERT INTO `__um_assert_0074` (`violation`)
SELECT 'blog_posts foreign key check failed'
WHERE EXISTS (SELECT 1 FROM pragma_foreign_key_check)
LIMIT 1;--> statement-breakpoint
DROP TABLE `__um_assert_0074`;--> statement-breakpoint
DROP TABLE `__um_backup_blog_post_redirects`;--> statement-breakpoint
DROP TABLE `__um_backup_blog_posts`;
