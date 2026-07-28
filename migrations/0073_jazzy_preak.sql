CREATE UNIQUE INDEX IF NOT EXISTS `media_assets_org_site_id_unique` ON `media_assets` (`organization_id`,`site_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `experiences_org_site_id_unique` ON `experiences` (`organization_id`,`site_id`,`id`);--> statement-breakpoint
ALTER TABLE `business_locations` ADD COLUMN `hero_media_asset_id` text REFERENCES `media_assets`(`id`) ON DELETE set null;--> statement-breakpoint
UPDATE `business_locations`
   SET `hero_media_asset_id` = COALESCE(`hero_video_asset_id`, `hero_image_asset_id`)
 WHERE `hero_media_asset_id` IS NULL
   AND (`hero_video_asset_id` IS NOT NULL OR `hero_image_asset_id` IS NOT NULL);--> statement-breakpoint
ALTER TABLE `site_content` ADD COLUMN `hero_media_asset_id` text REFERENCES `media_assets`(`id`) ON DELETE set null;--> statement-breakpoint
UPDATE `site_content`
   SET `hero_media_asset_id` = COALESCE(`hero_video_asset_id`, `hero_image_asset_id`)
 WHERE `hero_media_asset_id` IS NULL
   AND (`hero_video_asset_id` IS NOT NULL OR `hero_image_asset_id` IS NOT NULL);--> statement-breakpoint
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
);
--> statement-breakpoint
INSERT INTO `__new_experience_media`("id", "organization_id", "site_id", "experience_id", "asset_id", "sort_order", "created_at", "updated_at") SELECT "id", "organization_id", "site_id", "experience_id", "asset_id", "sort_order", "created_at", "updated_at" FROM `experience_media`;--> statement-breakpoint
DROP TABLE `experience_media`;--> statement-breakpoint
ALTER TABLE `__new_experience_media` RENAME TO `experience_media`;--> statement-breakpoint
CREATE INDEX `experience_media_experience_order_idx` ON `experience_media` (`experience_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `experience_media_site_experience_idx` ON `experience_media` (`site_id`,`experience_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `experience_media_experience_asset_unique` ON `experience_media` (`experience_id`,`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `experience_media_experience_sort_unique` ON `experience_media` (`experience_id`,`sort_order`);
