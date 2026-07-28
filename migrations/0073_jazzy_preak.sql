PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `media_assets_org_site_id_unique` ON `media_assets` (`organization_id`,`site_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `experiences_org_site_id_unique` ON `experiences` (`organization_id`,`site_id`,`id`);--> statement-breakpoint
CREATE TABLE `__new_business_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`slug` text NOT NULL,
	`google_location_id` text,
	`google_connection_id` text,
	`title` text NOT NULL,
	`address` text,
	`city` text,
	`neighborhood` text,
	`phone` text,
	`website_url` text,
	`maps_url` text,
	`latitude` real,
	`longitude` real,
	`opening_hours` text,
	`categories` text,
	`rating` real,
	`review_count` integer,
	`is_primary` numeric DEFAULT false,
	`status` text DEFAULT 'active',
	`last_synced_at` text,
	`description` text,
	`short_description` text,
	`description_provenance` text,
	`special_hours` text,
	`price_level` text,
	`attributes` text,
	`email` text,
	`facebook_url` text,
	`facebook_page_id` text,
	`facebook_connection_id` text,
	`instagram_url` text,
	`tiktok_url` text,
	`grab_url` text,
	`uber_eats_url` text,
	`foodpanda_url` text,
	`google_place_id` text,
	`google_review_url` text,
	`hero_media_asset_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`notification_phone` text,
	`timezone` text,
	`max_capacity` integer,
	`seo_title` text,
	`seo_description` text,
	`canonical_url` text,
	`robots` text,
	`og_image_asset_id` text,
	`team_id` text,
	`feature_overrides` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`google_connection_id`) REFERENCES `google_business_connections`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`facebook_connection_id`) REFERENCES `facebook_pages_connections`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`hero_media_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`og_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_business_locations`("id", "organization_id", "site_id", "slug", "google_location_id", "google_connection_id", "title", "address", "city", "neighborhood", "phone", "website_url", "maps_url", "latitude", "longitude", "opening_hours", "categories", "rating", "review_count", "is_primary", "status", "last_synced_at", "description", "short_description", "description_provenance", "special_hours", "price_level", "attributes", "email", "facebook_url", "facebook_page_id", "facebook_connection_id", "instagram_url", "tiktok_url", "grab_url", "uber_eats_url", "foodpanda_url", "google_place_id", "google_review_url", "hero_media_asset_id", "created_at", "updated_at", "notification_phone", "timezone", "max_capacity", "seo_title", "seo_description", "canonical_url", "robots", "og_image_asset_id", "team_id", "feature_overrides") SELECT "id", "organization_id", "site_id", "slug", "google_location_id", "google_connection_id", "title", "address", "city", "neighborhood", "phone", "website_url", "maps_url", "latitude", "longitude", "opening_hours", "categories", "rating", "review_count", "is_primary", "status", "last_synced_at", "description", "short_description", "description_provenance", "special_hours", "price_level", "attributes", "email", "facebook_url", "facebook_page_id", "facebook_connection_id", "instagram_url", "tiktok_url", "grab_url", "uber_eats_url", "foodpanda_url", "google_place_id", "google_review_url", COALESCE("hero_video_asset_id", "hero_image_asset_id"), "created_at", "updated_at", "notification_phone", "timezone", "max_capacity", "seo_title", "seo_description", "canonical_url", "robots", "og_image_asset_id", "team_id", "feature_overrides" FROM `business_locations`;--> statement-breakpoint
DROP TABLE `business_locations`;--> statement-breakpoint
ALTER TABLE `__new_business_locations` RENAME TO `business_locations`;--> statement-breakpoint
CREATE UNIQUE INDEX `business_locations_organization_id_site_id_slug_unique` ON `business_locations` (`organization_id`,`site_id`,`slug`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `experience_media_experience_sort_unique` ON `experience_media` (`experience_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `__new_experiences` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`tagline` text,
	`body` text,
	`price` text,
	`price_amount` numeric,
	`compare_at_price_amount` numeric,
	`sale_starts_at` text,
	`sale_ends_at` text,
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
	`canonical_url` text,
	`robots` text,
	`og_image_asset_id` text,
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
	FOREIGN KEY (`og_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "experiences_source_check" CHECK(source IN ('manual', 'template'))
);
--> statement-breakpoint
INSERT INTO `__new_experiences`("id", "organization_id", "site_id", "location_id", "title", "slug", "tagline", "body", "price", "price_amount", "compare_at_price_amount", "sale_starts_at", "sale_ends_at", "duration_minutes", "max_capacity", "time_slots", "recurring_slots", "available_note", "status", "sort_order", "featured", "featured_sort_order", "seo_title", "seo_description", "canonical_url", "robots", "og_image_asset_id", "created_at", "updated_at", "created_by", "highlights", "included_items", "what_to_bring", "meeting_point", "cancellation_policy", "source") SELECT "id", "organization_id", "site_id", "location_id", "title", "slug", "tagline", "body", "price", "price_amount", "compare_at_price_amount", "sale_starts_at", "sale_ends_at", "duration_minutes", "max_capacity", "time_slots", "recurring_slots", "available_note", "status", "sort_order", "featured", "featured_sort_order", "seo_title", "seo_description", "canonical_url", "robots", "og_image_asset_id", "created_at", "updated_at", "created_by", "highlights", "included_items", "what_to_bring", "meeting_point", "cancellation_policy", "source" FROM `experiences`;--> statement-breakpoint
DROP TABLE `experiences`;--> statement-breakpoint
ALTER TABLE `__new_experiences` RENAME TO `experiences`;--> statement-breakpoint
CREATE INDEX `experiences_org_site_idx` ON `experiences` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `experiences_org_site_id_unique` ON `experiences` (`organization_id`,`site_id`,`id`);--> statement-breakpoint
CREATE TABLE `__new_site_content` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`page` text NOT NULL,
	`field` text NOT NULL,
	`content` text,
	`hero_title` text,
	`hero_subtitle` text,
	`hero_media_asset_id` text,
	`value` text,
	`type` text DEFAULT 'text' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	`component` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`hero_media_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_site_content`("id", "organization_id", "site_id", "location_id", "page", "field", "content", "hero_title", "hero_subtitle", "hero_media_asset_id", "value", "type", "source", "updated_at", "updated_by", "component") SELECT "id", "organization_id", "site_id", "location_id", "page", "field", "content", "hero_title", "hero_subtitle", COALESCE("hero_video_asset_id", "hero_image_asset_id"), "value", "type", "source", "updated_at", "updated_by", "component" FROM `site_content`;--> statement-breakpoint
DROP TABLE `site_content`;--> statement-breakpoint
ALTER TABLE `__new_site_content` RENAME TO `site_content`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_site_content_site_level_unique` ON `site_content` (`organization_id`,`site_id`,`page`,`field`) WHERE location_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `site_content_organization_id_site_id_location_id_page_field_unique` ON `site_content` (`organization_id`,`site_id`,`location_id`,`page`,`field`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `media_assets_org_site_id_unique` ON `media_assets` (`organization_id`,`site_id`,`id`);
