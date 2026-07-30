-- Rebuild the parent location/content/experience tables and restore dependent rows from 0078 backups.

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
);--> statement-breakpoint
INSERT INTO `__new_business_locations` SELECT
	`id`, `organization_id`, `site_id`, `slug`, `google_location_id`, `google_connection_id`, `title`, `address`, `city`, `neighborhood`, `phone`, `website_url`, `maps_url`, `latitude`, `longitude`, `opening_hours`, `categories`, `rating`, `review_count`, `is_primary`, `status`, `last_synced_at`, `description`, `short_description`, `description_provenance`, `special_hours`, `price_level`, `attributes`, `email`, `facebook_url`, `facebook_page_id`, `facebook_connection_id`, `instagram_url`, `tiktok_url`, `grab_url`, `uber_eats_url`, `foodpanda_url`, `google_place_id`, `google_review_url`, `hero_media_asset_id`, `created_at`, `updated_at`, `notification_phone`, `timezone`, `max_capacity`, `seo_title`, `seo_description`, `canonical_url`, `robots`, `og_image_asset_id`, `team_id`, `feature_overrides`
FROM `__um_backup_business_locations`;--> statement-breakpoint
DROP TABLE `business_locations`;--> statement-breakpoint
ALTER TABLE `__new_business_locations` RENAME TO `business_locations`;--> statement-breakpoint
CREATE UNIQUE INDEX `business_locations_organization_id_site_id_slug_unique` ON `business_locations` (`organization_id`,`site_id`,`slug`);--> statement-breakpoint

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
	`status` text NOT NULL DEFAULT 'active',
	`sort_order` integer NOT NULL DEFAULT 0,
	`featured` numeric NOT NULL DEFAULT false,
	`featured_sort_order` integer NOT NULL DEFAULT 0,
	`seo_title` text,
	`seo_description` text,
	`canonical_url` text,
	`robots` text,
	`og_image_asset_id` text,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`created_by` text,
	`highlights` text,
	`included_items` text,
	`what_to_bring` text,
	`meeting_point` text,
	`cancellation_policy` text,
	`source` text NOT NULL DEFAULT 'manual',
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`og_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT `experiences_source_check` CHECK (source IN ('manual', 'template'))
);--> statement-breakpoint
INSERT INTO `__new_experiences` SELECT
	`id`, `organization_id`, `site_id`, `location_id`, `title`, `slug`, `tagline`, `body`, `price`, `price_amount`, `compare_at_price_amount`, `sale_starts_at`, `sale_ends_at`, `duration_minutes`, `max_capacity`, `time_slots`, `recurring_slots`, `available_note`, `status`, `sort_order`, `featured`, `featured_sort_order`, `seo_title`, `seo_description`, `canonical_url`, `robots`, `og_image_asset_id`, `created_at`, `updated_at`, `created_by`, `highlights`, `included_items`, `what_to_bring`, `meeting_point`, `cancellation_policy`, `source`
FROM `__um_backup_experiences`;--> statement-breakpoint
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
	`type` text NOT NULL DEFAULT 'text',
	`source` text NOT NULL DEFAULT 'manual',
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_by` text,
	`component` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`hero_media_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `__new_site_content` SELECT
	`id`, `organization_id`, `site_id`, `location_id`, `page`, `field`, `content`, `hero_title`, `hero_subtitle`, `hero_media_asset_id`, `value`, `type`, `source`, `updated_at`, `updated_by`, `component`
FROM `__um_backup_site_content`;--> statement-breakpoint
DROP TABLE `site_content`;--> statement-breakpoint
ALTER TABLE `__new_site_content` RENAME TO `site_content`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_site_content_site_level_unique` ON `site_content` (`organization_id`,`site_id`,`page`,`field`) WHERE location_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `site_content_organization_id_site_id_location_id_page_field_unique` ON `site_content` (`organization_id`,`site_id`,`location_id`,`page`,`field`);--> statement-breakpoint

INSERT INTO `booking_policies` SELECT * FROM `__um_backup_booking_policies` WHERE id NOT IN (SELECT id FROM `booking_policies`);--> statement-breakpoint
INSERT INTO `business_location_translations` SELECT * FROM `__um_backup_business_location_translations` WHERE id NOT IN (SELECT id FROM `business_location_translations`);--> statement-breakpoint
INSERT INTO `experience_bookings` SELECT * FROM `__um_backup_experience_bookings` WHERE id NOT IN (SELECT id FROM `experience_bookings`);--> statement-breakpoint
INSERT INTO `experience_media` SELECT * FROM `__um_backup_experience_media` WHERE id NOT IN (SELECT id FROM `experience_media`);--> statement-breakpoint
INSERT INTO `experience_slot_overrides` SELECT * FROM `__um_backup_experience_slot_overrides` WHERE id NOT IN (SELECT id FROM `experience_slot_overrides`);--> statement-breakpoint
UPDATE `invitation_access_scope`
SET
	`invitation_id` = (SELECT `invitation_id` FROM `__um_backup_invitation_access_scope` WHERE `__um_backup_invitation_access_scope`.`id` = `invitation_access_scope`.`id`),
	`organization_id` = (SELECT `organization_id` FROM `__um_backup_invitation_access_scope` WHERE `__um_backup_invitation_access_scope`.`id` = `invitation_access_scope`.`id`),
	`site_id` = (SELECT `site_id` FROM `__um_backup_invitation_access_scope` WHERE `__um_backup_invitation_access_scope`.`id` = `invitation_access_scope`.`id`),
	`location_id` = (SELECT `location_id` FROM `__um_backup_invitation_access_scope` WHERE `__um_backup_invitation_access_scope`.`id` = `invitation_access_scope`.`id`),
	`grant_source` = (SELECT `grant_source` FROM `__um_backup_invitation_access_scope` WHERE `__um_backup_invitation_access_scope`.`id` = `invitation_access_scope`.`id`),
	`created_at` = (SELECT `created_at` FROM `__um_backup_invitation_access_scope` WHERE `__um_backup_invitation_access_scope`.`id` = `invitation_access_scope`.`id`)
WHERE EXISTS (SELECT 1 FROM `__um_backup_invitation_access_scope` WHERE `__um_backup_invitation_access_scope`.`id` = `invitation_access_scope`.`id`);--> statement-breakpoint
INSERT INTO `invitation_access_scope`
SELECT * FROM `__um_backup_invitation_access_scope`
WHERE `id` NOT IN (SELECT `id` FROM `invitation_access_scope`)
  AND NOT EXISTS (
    SELECT 1
    FROM `invitation_access_scope`
    WHERE `invitation_access_scope`.`invitation_id` = `__um_backup_invitation_access_scope`.`invitation_id`
      AND `invitation_access_scope`.`site_id` = `__um_backup_invitation_access_scope`.`site_id`
      AND (
        (`invitation_access_scope`.`location_id` IS NULL AND `__um_backup_invitation_access_scope`.`location_id` IS NULL)
        OR `invitation_access_scope`.`location_id` = `__um_backup_invitation_access_scope`.`location_id`
      )
  );--> statement-breakpoint
UPDATE `location_qa`
SET
	`organization_id` = (SELECT `organization_id` FROM `__um_backup_location_qa` WHERE `__um_backup_location_qa`.`id` = `location_qa`.`id`),
	`site_id` = (SELECT `site_id` FROM `__um_backup_location_qa` WHERE `__um_backup_location_qa`.`id` = `location_qa`.`id`),
	`location_id` = (SELECT `location_id` FROM `__um_backup_location_qa` WHERE `__um_backup_location_qa`.`id` = `location_qa`.`id`),
	`page_path` = (SELECT `page_path` FROM `__um_backup_location_qa` WHERE `__um_backup_location_qa`.`id` = `location_qa`.`id`),
	`google_question_id` = (SELECT `google_question_id` FROM `__um_backup_location_qa` WHERE `__um_backup_location_qa`.`id` = `location_qa`.`id`),
	`question` = (SELECT `question` FROM `__um_backup_location_qa` WHERE `__um_backup_location_qa`.`id` = `location_qa`.`id`),
	`question_author` = (SELECT `question_author` FROM `__um_backup_location_qa` WHERE `__um_backup_location_qa`.`id` = `location_qa`.`id`),
	`question_date` = (SELECT `question_date` FROM `__um_backup_location_qa` WHERE `__um_backup_location_qa`.`id` = `location_qa`.`id`),
	`answer` = (SELECT `answer` FROM `__um_backup_location_qa` WHERE `__um_backup_location_qa`.`id` = `location_qa`.`id`),
	`answer_author` = (SELECT `answer_author` FROM `__um_backup_location_qa` WHERE `__um_backup_location_qa`.`id` = `location_qa`.`id`),
	`answer_date` = (SELECT `answer_date` FROM `__um_backup_location_qa` WHERE `__um_backup_location_qa`.`id` = `location_qa`.`id`),
	`is_owner_answer` = (SELECT `is_owner_answer` FROM `__um_backup_location_qa` WHERE `__um_backup_location_qa`.`id` = `location_qa`.`id`),
	`upvote_count` = (SELECT `upvote_count` FROM `__um_backup_location_qa` WHERE `__um_backup_location_qa`.`id` = `location_qa`.`id`),
	`source` = (SELECT `source` FROM `__um_backup_location_qa` WHERE `__um_backup_location_qa`.`id` = `location_qa`.`id`),
	`status` = (SELECT `status` FROM `__um_backup_location_qa` WHERE `__um_backup_location_qa`.`id` = `location_qa`.`id`),
	`sort_order` = (SELECT `sort_order` FROM `__um_backup_location_qa` WHERE `__um_backup_location_qa`.`id` = `location_qa`.`id`),
	`created_at` = (SELECT `created_at` FROM `__um_backup_location_qa` WHERE `__um_backup_location_qa`.`id` = `location_qa`.`id`),
	`updated_at` = (SELECT `updated_at` FROM `__um_backup_location_qa` WHERE `__um_backup_location_qa`.`id` = `location_qa`.`id`)
WHERE EXISTS (SELECT 1 FROM `__um_backup_location_qa` WHERE `__um_backup_location_qa`.`id` = `location_qa`.`id`);--> statement-breakpoint
INSERT INTO `location_qa`
SELECT * FROM `__um_backup_location_qa`
WHERE `id` NOT IN (SELECT `id` FROM `location_qa`);--> statement-breakpoint
INSERT INTO `menus` SELECT * FROM `__um_backup_menus` WHERE id NOT IN (SELECT id FROM `menus`);--> statement-breakpoint
INSERT INTO `menu_items` SELECT * FROM `__um_backup_menu_items` WHERE id NOT IN (SELECT id FROM `menu_items`);--> statement-breakpoint
INSERT INTO `menu_item_translations`
SELECT * FROM `__um_backup_menu_item_translations`
WHERE id NOT IN (SELECT id FROM `menu_item_translations`)
  AND NOT EXISTS (
    SELECT 1
    FROM `menu_item_translations`
    WHERE `menu_item_translations`.`organization_id` = `__um_backup_menu_item_translations`.`organization_id`
      AND `menu_item_translations`.`site_id` = `__um_backup_menu_item_translations`.`site_id`
      AND `menu_item_translations`.`menu_item_id` = `__um_backup_menu_item_translations`.`menu_item_id`
      AND `menu_item_translations`.`locale` = `__um_backup_menu_item_translations`.`locale`
  );--> statement-breakpoint
INSERT INTO `reservation_slot_overrides` SELECT * FROM `__um_backup_reservation_slot_overrides` WHERE id NOT IN (SELECT id FROM `reservation_slot_overrides`);--> statement-breakpoint
INSERT INTO `reservation_submissions` SELECT * FROM `__um_backup_reservation_submissions` WHERE id NOT IN (SELECT id FROM `reservation_submissions`);--> statement-breakpoint
INSERT INTO `reviews` SELECT * FROM `__um_backup_reviews` WHERE id NOT IN (SELECT id FROM `reviews`);--> statement-breakpoint
UPDATE `site_content_translations`
SET
	`organization_id` = (SELECT `organization_id` FROM `__um_backup_site_content_translations` WHERE `__um_backup_site_content_translations`.`id` = `site_content_translations`.`id`),
	`site_id` = (SELECT `site_id` FROM `__um_backup_site_content_translations` WHERE `__um_backup_site_content_translations`.`id` = `site_content_translations`.`id`),
	`location_id` = (SELECT `location_id` FROM `__um_backup_site_content_translations` WHERE `__um_backup_site_content_translations`.`id` = `site_content_translations`.`id`),
	`locale` = (SELECT `locale` FROM `__um_backup_site_content_translations` WHERE `__um_backup_site_content_translations`.`id` = `site_content_translations`.`id`),
	`page` = (SELECT `page` FROM `__um_backup_site_content_translations` WHERE `__um_backup_site_content_translations`.`id` = `site_content_translations`.`id`),
	`field` = (SELECT `field` FROM `__um_backup_site_content_translations` WHERE `__um_backup_site_content_translations`.`id` = `site_content_translations`.`id`),
	`content` = (SELECT `content` FROM `__um_backup_site_content_translations` WHERE `__um_backup_site_content_translations`.`id` = `site_content_translations`.`id`),
	`hero_title` = (SELECT `hero_title` FROM `__um_backup_site_content_translations` WHERE `__um_backup_site_content_translations`.`id` = `site_content_translations`.`id`),
	`hero_subtitle` = (SELECT `hero_subtitle` FROM `__um_backup_site_content_translations` WHERE `__um_backup_site_content_translations`.`id` = `site_content_translations`.`id`),
	`value` = (SELECT `value` FROM `__um_backup_site_content_translations` WHERE `__um_backup_site_content_translations`.`id` = `site_content_translations`.`id`),
	`type` = (SELECT `type` FROM `__um_backup_site_content_translations` WHERE `__um_backup_site_content_translations`.`id` = `site_content_translations`.`id`),
	`status` = (SELECT `status` FROM `__um_backup_site_content_translations` WHERE `__um_backup_site_content_translations`.`id` = `site_content_translations`.`id`),
	`source_hash` = (SELECT `source_hash` FROM `__um_backup_site_content_translations` WHERE `__um_backup_site_content_translations`.`id` = `site_content_translations`.`id`),
	`translated_at` = (SELECT `translated_at` FROM `__um_backup_site_content_translations` WHERE `__um_backup_site_content_translations`.`id` = `site_content_translations`.`id`),
	`reviewed_at` = (SELECT `reviewed_at` FROM `__um_backup_site_content_translations` WHERE `__um_backup_site_content_translations`.`id` = `site_content_translations`.`id`),
	`updated_at` = (SELECT `updated_at` FROM `__um_backup_site_content_translations` WHERE `__um_backup_site_content_translations`.`id` = `site_content_translations`.`id`),
	`updated_by` = (SELECT `updated_by` FROM `__um_backup_site_content_translations` WHERE `__um_backup_site_content_translations`.`id` = `site_content_translations`.`id`),
	`component` = (SELECT `component` FROM `__um_backup_site_content_translations` WHERE `__um_backup_site_content_translations`.`id` = `site_content_translations`.`id`)
WHERE EXISTS (SELECT 1 FROM `__um_backup_site_content_translations` WHERE `__um_backup_site_content_translations`.`id` = `site_content_translations`.`id`);--> statement-breakpoint
INSERT INTO `site_content_translations`
SELECT * FROM `__um_backup_site_content_translations`
WHERE `id` NOT IN (SELECT `id` FROM `site_content_translations`)
  AND NOT EXISTS (
    SELECT 1
    FROM `site_content_translations`
    WHERE `site_content_translations`.`organization_id` = `__um_backup_site_content_translations`.`organization_id`
      AND `site_content_translations`.`site_id` = `__um_backup_site_content_translations`.`site_id`
      AND `site_content_translations`.`locale` = `__um_backup_site_content_translations`.`locale`
      AND `site_content_translations`.`page` = `__um_backup_site_content_translations`.`page`
      AND `site_content_translations`.`field` = `__um_backup_site_content_translations`.`field`
      AND (
        (`site_content_translations`.`location_id` IS NULL AND `__um_backup_site_content_translations`.`location_id` IS NULL)
        OR `site_content_translations`.`location_id` = `__um_backup_site_content_translations`.`location_id`
      )
  );--> statement-breakpoint

UPDATE `contact_submissions` SET `location_id` = (SELECT `location_id` FROM `__um_backup_contact_submissions` WHERE `__um_backup_contact_submissions`.`id` = `contact_submissions`.`id`), `experience_id` = (SELECT `experience_id` FROM `__um_backup_contact_submissions` WHERE `__um_backup_contact_submissions`.`id` = `contact_submissions`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_contact_submissions` WHERE `__um_backup_contact_submissions`.`id` = `contact_submissions`.`id`);--> statement-breakpoint
UPDATE `chowbot_conversations` SET `selected_location_id` = (SELECT `selected_location_id` FROM `__um_backup_chowbot_conversations` WHERE `__um_backup_chowbot_conversations`.`id` = `chowbot_conversations`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_chowbot_conversations` WHERE `__um_backup_chowbot_conversations`.`id` = `chowbot_conversations`.`id`);--> statement-breakpoint
UPDATE `dashboard_preferences` SET `selected_location_id` = (SELECT `selected_location_id` FROM `__um_backup_dashboard_preferences` WHERE `__um_backup_dashboard_preferences`.`id` = `dashboard_preferences`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_dashboard_preferences` WHERE `__um_backup_dashboard_preferences`.`id` = `dashboard_preferences`.`id`);--> statement-breakpoint
UPDATE `google_business_connections` SET `location_id` = (SELECT `location_id` FROM `__um_backup_google_business_connections` WHERE `__um_backup_google_business_connections`.`id` = `google_business_connections`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_google_business_connections` WHERE `__um_backup_google_business_connections`.`id` = `google_business_connections`.`id`);--> statement-breakpoint
UPDATE `google_place_snapshots` SET `location_id` = (SELECT `location_id` FROM `__um_backup_google_place_snapshots` WHERE `__um_backup_google_place_snapshots`.`id` = `google_place_snapshots`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_google_place_snapshots` WHERE `__um_backup_google_place_snapshots`.`id` = `google_place_snapshots`.`id`);--> statement-breakpoint
UPDATE `guest_threads` SET `location_id` = (SELECT `location_id` FROM `__um_backup_guest_threads` WHERE `__um_backup_guest_threads`.`id` = `guest_threads`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_guest_threads` WHERE `__um_backup_guest_threads`.`id` = `guest_threads`.`id`);--> statement-breakpoint
UPDATE `mcp_tool_call_events` SET `location_id` = (SELECT `location_id` FROM `__um_backup_mcp_tool_call_events` WHERE `__um_backup_mcp_tool_call_events`.`id` = `mcp_tool_call_events`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_mcp_tool_call_events` WHERE `__um_backup_mcp_tool_call_events`.`id` = `mcp_tool_call_events`.`id`);--> statement-breakpoint
UPDATE `mcp_workspace_preferences` SET `location_id` = (SELECT `location_id` FROM `__um_backup_mcp_workspace_preferences` WHERE `__um_backup_mcp_workspace_preferences`.`user_id` = `mcp_workspace_preferences`.`user_id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_mcp_workspace_preferences` WHERE `__um_backup_mcp_workspace_preferences`.`user_id` = `mcp_workspace_preferences`.`user_id`);--> statement-breakpoint
UPDATE `media_assets` SET `location_id` = (SELECT `location_id` FROM `__um_backup_media_assets` WHERE `__um_backup_media_assets`.`id` = `media_assets`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_media_assets` WHERE `__um_backup_media_assets`.`id` = `media_assets`.`id`);--> statement-breakpoint
UPDATE `notification_events` SET `location_id` = (SELECT `location_id` FROM `__um_backup_notification_events` WHERE `__um_backup_notification_events`.`id` = `notification_events`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_notification_events` WHERE `__um_backup_notification_events`.`id` = `notification_events`.`id`);--> statement-breakpoint
UPDATE `notifications` SET `location_id` = (SELECT `location_id` FROM `__um_backup_notifications` WHERE `__um_backup_notifications`.`id` = `notifications`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_notifications` WHERE `__um_backup_notifications`.`id` = `notifications`.`id`);--> statement-breakpoint
UPDATE `offerings` SET `location_id` = (SELECT `location_id` FROM `__um_backup_offerings` WHERE `__um_backup_offerings`.`id` = `offerings`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_offerings` WHERE `__um_backup_offerings`.`id` = `offerings`.`id`);--> statement-breakpoint
UPDATE `posts` SET `location_id` = (SELECT `location_id` FROM `__um_backup_posts` WHERE `__um_backup_posts`.`id` = `posts`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_posts` WHERE `__um_backup_posts`.`id` = `posts`.`id`);--> statement-breakpoint
UPDATE `review_requests` SET `location_id` = (SELECT `location_id` FROM `__um_backup_review_requests` WHERE `__um_backup_review_requests`.`id` = `review_requests`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_review_requests` WHERE `__um_backup_review_requests`.`id` = `review_requests`.`id`);--> statement-breakpoint
UPDATE `site_events` SET `location_id` = (SELECT `location_id` FROM `__um_backup_site_events` WHERE `__um_backup_site_events`.`id` = `site_events`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_site_events` WHERE `__um_backup_site_events`.`id` = `site_events`.`id`);--> statement-breakpoint
UPDATE `site_pageview_events` SET `location_id` = (SELECT `location_id` FROM `__um_backup_site_pageview_events` WHERE `__um_backup_site_pageview_events`.`id` = `site_pageview_events`.`id`) WHERE EXISTS (SELECT 1 FROM `__um_backup_site_pageview_events` WHERE `__um_backup_site_pageview_events`.`id` = `site_pageview_events`.`id`);--> statement-breakpoint

CREATE TABLE `__um_assert_0079` (`violation` text NOT NULL CHECK (`violation` = ''));--> statement-breakpoint
INSERT INTO `__um_assert_0079` (`violation`)
SELECT 'location rebuild foreign key check failed'
WHERE EXISTS (SELECT 1 FROM pragma_foreign_key_check)
LIMIT 1;--> statement-breakpoint
DROP TABLE `__um_assert_0079`;
