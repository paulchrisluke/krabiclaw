CREATE TABLE `post_media` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`post_id` text NOT NULL,
	`media_asset_id` text NOT NULL,
	`role` text DEFAULT 'gallery' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`caption` text,
	`alt_text` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "post_media_role_check" CHECK(role IN ('cover', 'gallery')),
	UNIQUE(`post_id`, `media_asset_id`),
	UNIQUE(`post_id`, `role`) WHERE role = 'cover'
);
--> statement-breakpoint
CREATE INDEX `post_media_post_idx` ON `post_media` (`post_id`,`sort_order`);--> statement-breakpoint
ALTER TABLE `posts` ADD `slug` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `seo_title` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `seo_description` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `og_image_asset_id` text REFERENCES media_assets(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `posts_site_slug_idx` ON `posts` (`site_id`,`slug`) WHERE slug IS NOT NULL;
