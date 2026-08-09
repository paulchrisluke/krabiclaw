-- business_locations is referenced by many tenant tables. Recreate it with
-- the same primary keys and all supported columns so those child rows keep
-- their location relationships while the two legacy Google columns and their
-- circular foreign key are removed.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_business_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`slug` text NOT NULL,
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
	FOREIGN KEY (`facebook_connection_id`) REFERENCES `facebook_pages_connections`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`hero_media_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`og_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `__new_business_locations`("id", "organization_id", "site_id", "slug", "title", "address", "city", "neighborhood", "phone", "website_url", "maps_url", "latitude", "longitude", "opening_hours", "categories", "rating", "review_count", "is_primary", "status", "last_synced_at", "description", "short_description", "description_provenance", "special_hours", "price_level", "attributes", "email", "facebook_url", "facebook_page_id", "facebook_connection_id", "instagram_url", "tiktok_url", "grab_url", "uber_eats_url", "foodpanda_url", "google_place_id", "google_review_url", "hero_media_asset_id", "created_at", "updated_at", "notification_phone", "timezone", "max_capacity", "seo_title", "seo_description", "canonical_url", "robots", "og_image_asset_id", "team_id", "feature_overrides") SELECT "id", "organization_id", "site_id", "slug", "title", "address", "city", "neighborhood", "phone", "website_url", "maps_url", "latitude", "longitude", "opening_hours", "categories", "rating", "review_count", "is_primary", "status", "last_synced_at", "description", "short_description", "description_provenance", "special_hours", "price_level", "attributes", "email", "facebook_url", "facebook_page_id", "facebook_connection_id", "instagram_url", "tiktok_url", "grab_url", "uber_eats_url", "foodpanda_url", "google_place_id", "google_review_url", "hero_media_asset_id", "created_at", "updated_at", "notification_phone", "timezone", "max_capacity", "seo_title", "seo_description", "canonical_url", "robots", "og_image_asset_id", "team_id", "feature_overrides" FROM `business_locations`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `media_assets_scope_update`;--> statement-breakpoint
DROP TABLE `business_locations`;--> statement-breakpoint
ALTER TABLE `__new_business_locations` RENAME TO `business_locations`;--> statement-breakpoint
CREATE UNIQUE INDEX `business_locations_organization_id_site_id_slug_unique` ON `business_locations` (`organization_id`,`site_id`,`slug`);--> statement-breakpoint
CREATE TRIGGER `media_assets_scope_update`
BEFORE UPDATE OF `organization_id`, `site_id` ON `media_assets`
FOR EACH ROW
WHEN NEW.`organization_id` IS NOT OLD.`organization_id`
  OR NEW.`site_id` IS NOT OLD.`site_id`
BEGIN
  SELECT RAISE(ABORT, 'media_assets organization_id/site_id update would break scoped business location media references')
  WHERE EXISTS (
    SELECT 1
    FROM `business_locations`
    WHERE (
      `hero_media_asset_id` = OLD.`id`
      OR `og_image_asset_id` = OLD.`id`
    )
    AND (
      `organization_id` != NEW.`organization_id`
      OR `site_id` != NEW.`site_id`
    )
  );

  SELECT RAISE(ABORT, 'media_assets organization_id/site_id update would break scoped experience media references')
  WHERE EXISTS (
    SELECT 1
    FROM `experience_media`
    WHERE `asset_id` = OLD.`id`
      AND (
        `organization_id` != NEW.`organization_id`
        OR `site_id` != NEW.`site_id`
      )
  );

  SELECT RAISE(ABORT, 'media_assets organization_id/site_id update would break scoped experiences media references')
  WHERE EXISTS (
    SELECT 1
    FROM `experiences`
    WHERE `og_image_asset_id` = OLD.`id`
      AND (
        `organization_id` != NEW.`organization_id`
        OR `site_id` != NEW.`site_id`
      )
  );
END;--> statement-breakpoint
DROP TABLE `google_business_connections`;--> statement-breakpoint
DROP TABLE `google_business_events`;--> statement-breakpoint
INSERT OR REPLACE INTO `site_entitlements`
  (`id`, `site_id`, `organization_id`, `key`, `value`, `source`, `created_at`, `updated_at`)
SELECT replace(`id`, 'google_business', 'google_places'), `site_id`, `organization_id`,
       'google_places', `value`, `source`, `created_at`,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `site_entitlements`
WHERE `key` = 'google_business';--> statement-breakpoint
DELETE FROM `site_entitlements` WHERE `key` = 'google_business';--> statement-breakpoint
UPDATE `work_requests`
SET `type` = 'google_places',
    `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `type` = 'google_business';--> statement-breakpoint
UPDATE `location_qa`
SET `source` = CASE
  WHEN `source` IN ('gmb', 'google_maps') THEN 'import'
  WHEN `source` IN ('llm_generated', 'manual_override') THEN 'manual'
  ELSE `source`
END
WHERE `source` IN ('gmb', 'google_maps', 'llm_generated', 'manual_override');--> statement-breakpoint
CREATE TABLE `__new_location_qa` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`page_path` text,
	`question` text NOT NULL,
	`question_author` text,
	`question_date` text,
	`answer` text,
	`answer_author` text,
	`answer_date` text,
	`is_owner_answer` integer DEFAULT 0 NOT NULL,
	`upvote_count` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "location_qa_scope_check" CHECK(location_id IS NULL OR page_path IS NULL),
	CONSTRAINT "location_qa_page_path_check" CHECK(page_path IS NULL OR page_path LIKE '/%'),
	CONSTRAINT "location_qa_source_check" CHECK(source IN ('manual','import','template')),
	CONSTRAINT "location_qa_status_check" CHECK(status IN ('published','hidden'))
);
--> statement-breakpoint
INSERT INTO `__new_location_qa`("id", "organization_id", "site_id", "location_id", "page_path", "question", "question_author", "question_date", "answer", "answer_author", "answer_date", "is_owner_answer", "upvote_count", "source", "status", "sort_order", "created_at", "updated_at") SELECT "id", "organization_id", "site_id", "location_id", "page_path", "question", "question_author", "question_date", "answer", "answer_author", "answer_date", "is_owner_answer", "upvote_count", "source", "status", "sort_order", "created_at", "updated_at" FROM `location_qa`;--> statement-breakpoint
DROP TABLE `location_qa`;--> statement-breakpoint
ALTER TABLE `__new_location_qa` RENAME TO `location_qa`;--> statement-breakpoint
CREATE INDEX `idx_location_qa_location` ON `location_qa` (`location_id`,`status`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_location_qa_site` ON `location_qa` (`site_id`,`status`,`sort_order`) WHERE location_id IS NULL;--> statement-breakpoint
CREATE INDEX `idx_location_qa_page` ON `location_qa` (`site_id`,`page_path`,`status`,`sort_order`) WHERE location_id IS NULL AND page_path IS NOT NULL;--> statement-breakpoint
CREATE INDEX `location_qa_organization_id_idx` ON `location_qa` (`organization_id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
