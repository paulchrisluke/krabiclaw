PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`kind` text NOT NULL CHECK (`kind` IN ('image', 'video', 'file')),
	`provider` text NOT NULL CHECK (`provider` IN ('cloudflare_images', 'cloudflare_r2', 'google_business', 'external_url', 'chowbot')),
	`source` text NOT NULL CHECK (`source` IN ('uploaded', 'google_sync', 'generated', 'external', 'template_stock')),
	`cloudflare_image_id` text,
	`r2_key` text,
	`google_media_name` text,
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
	`status` text DEFAULT 'active' NOT NULL CHECK (`status` IN ('pending', 'active', 'deleted', 'failed')),
	`created_by_user_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`delete_pending_at` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "media_assets_category_check" CHECK(category IS NULL OR category IN ('exterior', 'interior', 'food', 'menu', 'team', 'other', 'logo', 'blog'))
);
--> statement-breakpoint
INSERT INTO `__new_media_assets`("id", "organization_id", "site_id", "location_id", "kind", "provider", "source", "cloudflare_image_id", "r2_key", "google_media_name", "public_url", "thumbnail_url", "mime_type", "file_name", "file_size", "width", "height", "duration", "alt_text", "category", "status", "created_by_user_id", "created_at", "updated_at", "delete_pending_at") SELECT "id", "organization_id", "site_id", "location_id", "kind", "provider", "source", "cloudflare_image_id", "r2_key", "google_media_name", "public_url", "thumbnail_url", "mime_type", "file_name", "file_size", "width", "height", "duration", "alt_text", "category", "status", "created_by_user_id", "created_at", "updated_at", "delete_pending_at" FROM `media_assets`;--> statement-breakpoint
DROP TABLE `media_assets`;--> statement-breakpoint
ALTER TABLE `__new_media_assets` RENAME TO `media_assets`;--> statement-breakpoint
CREATE INDEX `idx_media_assets_site` ON `media_assets` (`site_id`, `status`, `created_at` DESC);--> statement-breakpoint
CREATE INDEX `idx_media_assets_location` ON `media_assets` (`location_id`, `status`, `created_at` DESC) WHERE `location_id` IS NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=ON;
