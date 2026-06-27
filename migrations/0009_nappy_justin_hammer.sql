CREATE TABLE `__new_blog_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`site_id` text,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`body` text NOT NULL,
	`excerpt` text,
	`category` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`author_id` text,
	`featured_image_asset_id` text,
	`published_at` text,
	`scheduled_for` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`seo_description` text,
	`seo_keywords` text,
	`canonical_url` text,
	`robots` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`featured_image_asset_id`) REFERENCES `media_assets_old`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_blog_posts`
	(`id`, `organization_id`, `site_id`, `title`, `slug`, `body`, `excerpt`, `category`, `status`, `author_id`, `featured_image_asset_id`, `published_at`, `scheduled_for`, `created_at`, `updated_at`, `seo_description`, `seo_keywords`, `canonical_url`, `robots`)
SELECT
	`id`, NULL, NULL, `title`, `slug`, `body`, `excerpt`, `category`,
	CASE WHEN `published_at` IS NOT NULL THEN 'published' ELSE 'draft' END,
	`author_id`, `featured_image_asset_id`, `published_at`, NULL, `created_at`, `updated_at`,
	`seo_description`, `seo_keywords`, `canonical_url`, `robots`
FROM `platform_blog_posts`;
--> statement-breakpoint
DROP TABLE `platform_blog_posts`;
--> statement-breakpoint
ALTER TABLE `__new_blog_posts` RENAME TO `blog_posts`;
--> statement-breakpoint
CREATE UNIQUE INDEX `blog_posts_platform_slug_idx` ON `blog_posts` (`slug`) WHERE site_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `blog_posts_site_slug_idx` ON `blog_posts` (`site_id`,`slug`) WHERE site_id IS NOT NULL;
