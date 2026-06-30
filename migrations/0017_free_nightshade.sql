PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_menu_items` (
	`id` text PRIMARY KEY NOT NULL,
	`menu_id` text NOT NULL,
	`section` text NOT NULL,
	`name` text NOT NULL,
	`slug` text DEFAULT '' NOT NULL,
	`description` text,
	`price_amount` numeric,
	`image_asset_id` text,
	`available` numeric DEFAULT 1 NOT NULL,
	`featured` numeric DEFAULT false NOT NULL,
	`featured_sort_order` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`allergens` text,
	`ingredients` text,
	`dietary_notes` text,
	`preparation` text,
	`serving_note` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`menu_id`) REFERENCES `menus`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "menu_items_source_check" CHECK(source IN ('manual', 'template'))
);
--> statement-breakpoint
INSERT INTO `__new_menu_items`("id", "menu_id", "section", "name", "slug", "description", "price_amount", "image_asset_id", "available", "featured", "featured_sort_order", "sort_order", "allergens", "ingredients", "dietary_notes", "preparation", "serving_note", "source", "created_at", "updated_at", "created_by", "updated_by") SELECT "id", "menu_id", "section", "name", "slug", "description", "price_amount", "image_asset_id", "available", "featured", "featured_sort_order", "sort_order", "allergens", "ingredients", "dietary_notes", "preparation", "serving_note", "source", "created_at", "updated_at", "created_by", "updated_by" FROM `menu_items`;--> statement-breakpoint
DROP TABLE `menu_items`;--> statement-breakpoint
ALTER TABLE `__new_menu_items` RENAME TO `menu_items`;--> statement-breakpoint
CREATE TABLE `__new_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`google_post_id` text,
	`post_type` text DEFAULT 'standard' NOT NULL,
	`title` text,
	`body` text NOT NULL,
	`image_asset_id` text,
	`cta_type` text,
	`cta_url` text,
	`event_title` text,
	`event_start` text,
	`event_end` text,
	`offer_coupon` text,
	`offer_terms` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`scheduled_for` text,
	`published_at` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "posts_source_check" CHECK(source IN ('manual', 'template'))
);
--> statement-breakpoint
INSERT INTO `__new_posts`("id", "organization_id", "site_id", "location_id", "google_post_id", "post_type", "title", "body", "image_asset_id", "cta_type", "cta_url", "event_title", "event_start", "event_end", "offer_coupon", "offer_terms", "status", "scheduled_for", "published_at", "source", "created_by", "created_at", "updated_at") SELECT "id", "organization_id", "site_id", "location_id", "google_post_id", "post_type", "title", "body", "image_asset_id", "cta_type", "cta_url", "event_title", "event_start", "event_end", "offer_coupon", "offer_terms", "status", "scheduled_for", "published_at", "source", "created_by", "created_at", "updated_at" FROM `posts`;--> statement-breakpoint
DROP TABLE `posts`;--> statement-breakpoint
ALTER TABLE `__new_posts` RENAME TO `posts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;