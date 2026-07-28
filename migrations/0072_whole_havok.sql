PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	`hide_from_nav` integer DEFAULT 0 NOT NULL,
	`featured_order` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`author_id` text,
	`featured_image_asset_id` text,
	`social_image_asset_id` text,
	`published_at` text,
	`first_published_at` text,
	`scheduled_for` text,
	`scheduled_revision_id` text,
	`slug_manually_overridden` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
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
	CONSTRAINT "blog_posts_scope_check" CHECK((organization_id IS NULL AND site_id IS NULL) OR (organization_id IS NOT NULL AND site_id IS NOT NULL)),
	CONSTRAINT "blog_posts_status_check" CHECK(status IN ('draft', 'published', 'scheduled', 'archived')),
	CONSTRAINT "blog_posts_visibility_check" CHECK(visibility IN ('public', 'unlisted')),
	CONSTRAINT "blog_posts_category_check" CHECK(site_id IS NOT NULL OR category IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_blog_posts`("id", "organization_id", "site_id", "title", "slug", "body", "excerpt", "category", "tags_json", "nav_section", "nav_title", "nav_order", "nav_section_order", "hide_from_nav", "featured_order", "status", "visibility", "author_id", "featured_image_asset_id", "social_image_asset_id", "published_at", "first_published_at", "scheduled_for", "scheduled_revision_id", "slug_manually_overridden", "created_at", "updated_at", "seo_title", "seo_description", "seo_keywords", "canonical_url", "robots") SELECT "id", "organization_id", "site_id", "title", "slug", "body", "excerpt", "category", "tags_json", "nav_section", "nav_title", "nav_order", "nav_section_order", "hide_from_nav", "featured_order", "status", "visibility", "author_id", "featured_image_asset_id", "social_image_asset_id", "published_at", "first_published_at", "scheduled_for", "scheduled_revision_id", "slug_manually_overridden", "created_at", "updated_at", "seo_title", "seo_description", "seo_keywords", "canonical_url", "robots" FROM `blog_posts`;--> statement-breakpoint
DROP TABLE `blog_posts`;--> statement-breakpoint
ALTER TABLE `__new_blog_posts` RENAME TO `blog_posts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `blog_posts_platform_slug_idx` ON `blog_posts` (`slug`) WHERE site_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `blog_posts_site_slug_idx` ON `blog_posts` (`site_id`,`slug`) WHERE site_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `blog_posts_org_site_idx` ON `blog_posts` (`organization_id`,`site_id`);--> statement-breakpoint
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
	`hero_image_asset_id` text,
	`hero_video_asset_id` text,
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
	FOREIGN KEY (`hero_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`hero_video_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`og_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_business_locations`("id", "organization_id", "site_id", "slug", "google_location_id", "google_connection_id", "title", "address", "city", "neighborhood", "phone", "website_url", "maps_url", "latitude", "longitude", "opening_hours", "categories", "rating", "review_count", "is_primary", "status", "last_synced_at", "description", "short_description", "description_provenance", "special_hours", "price_level", "attributes", "email", "facebook_url", "facebook_page_id", "facebook_connection_id", "instagram_url", "tiktok_url", "grab_url", "uber_eats_url", "foodpanda_url", "google_place_id", "google_review_url", "hero_image_asset_id", "hero_video_asset_id", "created_at", "updated_at", "notification_phone", "timezone", "max_capacity", "seo_title", "seo_description", "canonical_url", "robots", "og_image_asset_id", "team_id", "feature_overrides") SELECT "id", "organization_id", "site_id", "slug", "google_location_id", "google_connection_id", "title", "address", "city", "neighborhood", "phone", "website_url", "maps_url", "latitude", "longitude", "opening_hours", "categories", "rating", "review_count", "is_primary", "status", "last_synced_at", "description", "short_description", "description_provenance", "special_hours", "price_level", "attributes", "email", "facebook_url", "facebook_page_id", "facebook_connection_id", "instagram_url", "tiktok_url", "grab_url", "uber_eats_url", "foodpanda_url", "google_place_id", "google_review_url", "hero_image_asset_id", "hero_video_asset_id", "created_at", "updated_at", "notification_phone", "timezone", "max_capacity", "seo_title", "seo_description", "canonical_url", "robots", "og_image_asset_id", "team_id", "feature_overrides" FROM `business_locations`;--> statement-breakpoint
DROP TABLE `business_locations`;--> statement-breakpoint
ALTER TABLE `__new_business_locations` RENAME TO `business_locations`;--> statement-breakpoint
CREATE UNIQUE INDEX `business_locations_organization_id_site_id_slug_unique` ON `business_locations` (`organization_id`,`site_id`,`slug`);--> statement-breakpoint
CREATE TABLE `__new_menu_items` (
	`id` text PRIMARY KEY NOT NULL,
	`menu_id` text NOT NULL,
	`section` text NOT NULL,
	`name` text NOT NULL,
	`slug` text DEFAULT '' NOT NULL,
	`description` text,
	`price_amount` numeric,
	`compare_at_price_amount` numeric,
	`sale_starts_at` text,
	`sale_ends_at` text,
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
	`seo_title` text,
	`seo_description` text,
	`canonical_url` text,
	`robots` text,
	`og_image_asset_id` text,
	FOREIGN KEY (`menu_id`) REFERENCES `menus`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`og_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "menu_items_source_check" CHECK(source IN ('manual', 'template'))
);
--> statement-breakpoint
INSERT INTO `__new_menu_items`("id", "menu_id", "section", "name", "slug", "description", "price_amount", "compare_at_price_amount", "sale_starts_at", "sale_ends_at", "image_asset_id", "available", "featured", "featured_sort_order", "sort_order", "allergens", "ingredients", "dietary_notes", "preparation", "serving_note", "source", "created_at", "updated_at", "created_by", "updated_by", "seo_title", "seo_description", "canonical_url", "robots", "og_image_asset_id") SELECT "id", "menu_id", "section", "name", "slug", "description", "price_amount", "compare_at_price_amount", "sale_starts_at", "sale_ends_at", "image_asset_id", "available", "featured", "featured_sort_order", "sort_order", "allergens", "ingredients", "dietary_notes", "preparation", "serving_note", "source", "created_at", "updated_at", "created_by", "updated_by", "seo_title", "seo_description", "canonical_url", "robots", "og_image_asset_id" FROM `menu_items`;--> statement-breakpoint
DROP TABLE `menu_items`;--> statement-breakpoint
ALTER TABLE `__new_menu_items` RENAME TO `menu_items`;--> statement-breakpoint
CREATE INDEX `menu_items_menu_id_idx` ON `menu_items` (`menu_id`);--> statement-breakpoint
CREATE TABLE `__new_platform_docs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`body` text NOT NULL,
	`excerpt` text,
	`category` text,
	`nav_section` text,
	`nav_title` text,
	`nav_order` integer,
	`nav_section_order` integer,
	`nav_group` text,
	`nav_group_order` integer,
	`hide_from_nav` integer DEFAULT 0 NOT NULL,
	`featured_order` integer,
	`author_id` text,
	`seo_description` text,
	`seo_keywords` text,
	`featured_image_asset_id` text,
	`sort_order` integer DEFAULT 0,
	`parent_doc_id` text,
	`difficulty_level` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`canonical_url` text,
	`robots` text,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`featured_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_platform_docs`("id", "title", "slug", "body", "excerpt", "category", "nav_section", "nav_title", "nav_order", "nav_section_order", "nav_group", "nav_group_order", "hide_from_nav", "featured_order", "author_id", "seo_description", "seo_keywords", "featured_image_asset_id", "sort_order", "parent_doc_id", "difficulty_level", "status", "published_at", "created_at", "updated_at", "canonical_url", "robots") SELECT "id", "title", "slug", "body", "excerpt", "category", "nav_section", "nav_title", "nav_order", "nav_section_order", "nav_group", "nav_group_order", "hide_from_nav", "featured_order", "author_id", "seo_description", "seo_keywords", "featured_image_asset_id", "sort_order", "parent_doc_id", "difficulty_level", "status", "published_at", "created_at", "updated_at", "canonical_url", "robots" FROM `platform_docs`;--> statement-breakpoint
DROP TABLE `platform_docs`;--> statement-breakpoint
ALTER TABLE `__new_platform_docs` RENAME TO `platform_docs`;--> statement-breakpoint
CREATE UNIQUE INDEX `platform_docs_slug_unique` ON `platform_docs` (`slug`);--> statement-breakpoint
CREATE TABLE `__new_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`google_post_id` text,
	`slug` text,
	`post_type` text DEFAULT 'standard' NOT NULL,
	`title` text,
	`body` text NOT NULL,
	`image_asset_id` text,
	`seo_title` text,
	`seo_description` text,
	`og_image_asset_id` text,
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
	FOREIGN KEY (`og_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "posts_source_check" CHECK(source IN ('manual', 'template'))
);
--> statement-breakpoint
INSERT INTO `__new_posts`("id", "organization_id", "site_id", "location_id", "google_post_id", "slug", "post_type", "title", "body", "image_asset_id", "seo_title", "seo_description", "og_image_asset_id", "cta_type", "cta_url", "event_title", "event_start", "event_end", "offer_coupon", "offer_terms", "status", "scheduled_for", "published_at", "source", "created_by", "created_at", "updated_at") SELECT "id", "organization_id", "site_id", "location_id", "google_post_id", "slug", "post_type", "title", "body", "image_asset_id", "seo_title", "seo_description", "og_image_asset_id", "cta_type", "cta_url", "event_title", "event_start", "event_end", "offer_coupon", "offer_terms", "status", "scheduled_for", "published_at", "source", "created_by", "created_at", "updated_at" FROM `posts`;--> statement-breakpoint
DROP TABLE `posts`;--> statement-breakpoint
ALTER TABLE `__new_posts` RENAME TO `posts`;--> statement-breakpoint
CREATE UNIQUE INDEX `posts_site_slug_idx` ON `posts` (`site_id`,`slug`);--> statement-breakpoint
CREATE INDEX `posts_org_site_idx` ON `posts` (`organization_id`,`site_id`);--> statement-breakpoint
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
	`hero_image_asset_id` text,
	`hero_video_asset_id` text,
	`value` text,
	`type` text DEFAULT 'text' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	`component` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`hero_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`hero_video_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_site_content`("id", "organization_id", "site_id", "location_id", "page", "field", "content", "hero_title", "hero_subtitle", "hero_image_asset_id", "hero_video_asset_id", "value", "type", "source", "updated_at", "updated_by", "component") SELECT "id", "organization_id", "site_id", "location_id", "page", "field", "content", "hero_title", "hero_subtitle", "hero_image_asset_id", "hero_video_asset_id", "value", "type", "source", "updated_at", "updated_by", "component" FROM `site_content`;--> statement-breakpoint
DROP TABLE `site_content`;--> statement-breakpoint
ALTER TABLE `__new_site_content` RENAME TO `site_content`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_site_content_site_level_unique` ON `site_content` (`organization_id`,`site_id`,`page`,`field`) WHERE location_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `site_content_organization_id_site_id_location_id_page_field_unique` ON `site_content` (`organization_id`,`site_id`,`location_id`,`page`,`field`);--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_media_assets_old_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_media_assets_old_update`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_media_assets_old_delete`;--> statement-breakpoint
DROP TABLE `media_assets_old`;
