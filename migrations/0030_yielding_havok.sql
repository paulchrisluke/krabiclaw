PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_experiences` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`tagline` text,
	`body` text,
	`image_asset_id` text,
	`video_asset_id` text,
	`images` text,
	`price` text,
	`price_amount` numeric,
	`duration_minutes` integer,
	`max_capacity` integer,
	`time_slots` text,
	`recurring_slots` text,
	`available_note` text,
	`status` text DEFAULT 'active' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`featured` numeric DEFAULT false NOT NULL,
	`featured_sort_order` integer DEFAULT 0 NOT NULL,
	`seo_title` text,
	`seo_description` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by` text,
	`highlights` text,
	`included_items` text,
	`what_to_bring` text,
	`meeting_point` text,
	`cancellation_policy` text,
	`source` text DEFAULT 'manual' NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`video_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "experiences_source_check" CHECK(source IN ('manual', 'template'))
);
--> statement-breakpoint
INSERT INTO `__new_experiences`("id", "organization_id", "site_id", "location_id", "title", "slug", "tagline", "body", "image_asset_id", "video_asset_id", "images", "price", "price_amount", "duration_minutes", "max_capacity", "time_slots", "recurring_slots", "available_note", "status", "sort_order", "featured", "featured_sort_order", "seo_title", "seo_description", "created_at", "updated_at", "created_by", "highlights", "included_items", "what_to_bring", "meeting_point", "cancellation_policy") SELECT "id", "organization_id", "site_id", "location_id", "title", "slug", "tagline", "body", "image_asset_id", "video_asset_id", "images", "price", "price_amount", "duration_minutes", "max_capacity", "time_slots", "recurring_slots", "available_note", "status", "sort_order", "featured", "featured_sort_order", "seo_title", "seo_description", "created_at", "updated_at", "created_by", "highlights", "included_items", "what_to_bring", "meeting_point", "cancellation_policy" FROM `experiences`;--> statement-breakpoint
DROP TABLE `experiences`;--> statement-breakpoint
ALTER TABLE `__new_experiences` RENAME TO `experiences`;--> statement-breakpoint
PRAGMA foreign_keys=ON;