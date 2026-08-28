CREATE TABLE `site_analytics_dimension_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`date` text NOT NULL,
	`dimension` text NOT NULL,
	`value` text NOT NULL,
	`subvalue` text DEFAULT '' NOT NULL,
	`page_views` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "site_analytics_dimension_daily_dimension_check" CHECK("site_analytics_dimension_daily"."dimension" IN ('country', 'city', 'device', 'referrer'))
);
--> statement-breakpoint
CREATE INDEX `site_analytics_dimension_daily_organization_id_idx` ON `site_analytics_dimension_daily` (`organization_id`);--> statement-breakpoint
CREATE INDEX `site_analytics_dimension_daily_site_date_idx` ON `site_analytics_dimension_daily` (`site_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_analytics_dimension_daily_site_date_value_unique` ON `site_analytics_dimension_daily` (`site_id`,`date`,`dimension`,`value`,`subvalue`);--> statement-breakpoint
CREATE TABLE `site_analytics_page_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`date` text NOT NULL,
	`page_path` text NOT NULL,
	`page_views` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `site_analytics_page_daily_organization_id_idx` ON `site_analytics_page_daily` (`organization_id`);--> statement-breakpoint
CREATE INDEX `site_analytics_page_daily_site_date_idx` ON `site_analytics_page_daily` (`site_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_analytics_page_daily_site_date_path_unique` ON `site_analytics_page_daily` (`site_id`,`date`,`page_path`);--> statement-breakpoint
CREATE TABLE `site_analytics_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`session_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`started_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`landing_path` text NOT NULL,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`last_touch_source` text DEFAULT 'Direct' NOT NULL,
	`last_touch_medium` text DEFAULT '(none)' NOT NULL,
	`last_touch_campaign` text,
	`last_touch_term` text,
	`last_touch_content` text,
	`last_touch_referrer_host` text,
	`last_touch_gclid` text,
	`last_touch_gbraid` text,
	`last_touch_wbraid` text,
	`last_touch_fbclid` text,
	`last_touch_msclkid` text,
	`last_touch_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `site_analytics_sessions_organization_id_idx` ON `site_analytics_sessions` (`organization_id`);--> statement-breakpoint
CREATE INDEX `site_analytics_sessions_site_started_idx` ON `site_analytics_sessions` (`site_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `site_analytics_sessions_site_last_seen_idx` ON `site_analytics_sessions` (`site_id`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `site_analytics_sessions_site_visitor_started_idx` ON `site_analytics_sessions` (`site_id`,`visitor_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `site_analytics_sessions_site_touch_started_idx` ON `site_analytics_sessions` (`site_id`,`last_touch_source`,`last_touch_medium`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_analytics_sessions_site_session_unique` ON `site_analytics_sessions` (`site_id`,`session_id`);--> statement-breakpoint
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `site_analytics_daily` RENAME TO `__reset_site_analytics_daily`;--> statement-breakpoint
DROP INDEX IF EXISTS `idx_site_analytics_daily_site_id_date`;--> statement-breakpoint
CREATE TABLE `site_analytics_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`date` text NOT NULL,
	`page_views` integer DEFAULT 0,
	`unique_sessions` integer DEFAULT 0,
	`avg_session_duration` integer DEFAULT 0,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`unique_visitors` integer DEFAULT 0,
	`pages_per_session` real DEFAULT 0,
	`returning_visitors` integer DEFAULT 0,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `site_analytics_daily_site_id_date_unique` ON `site_analytics_daily` (`site_id`,`date`);--> statement-breakpoint
CREATE INDEX `site_analytics_daily_organization_id_idx` ON `site_analytics_daily` (`organization_id`);--> statement-breakpoint
ALTER TABLE `site_conversion_events` RENAME TO `__reset_site_conversion_events`;--> statement-breakpoint
DROP INDEX `site_conversion_events_site_created_idx`;--> statement-breakpoint
DROP INDEX `site_conversion_events_name_created_idx`;--> statement-breakpoint
DROP INDEX `site_conversion_events_organization_id_idx`;--> statement-breakpoint
CREATE TABLE `site_conversion_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`event_name` text NOT NULL,
	`stage` text NOT NULL,
	`session_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`location_id` text,
	`entity_type` text,
	`entity_id` text,
	`page_type` text,
	`page_path` text,
	`cta_destination` text,
	`source` text DEFAULT 'Direct' NOT NULL,
	`medium` text DEFAULT '(none)' NOT NULL,
	`campaign` text,
	`term` text,
	`content` text,
	`referrer_host` text,
	`gclid` text,
	`gbraid` text,
	`wbraid` text,
	`fbclid` text,
	`msclkid` text,
	`attributed_at` text NOT NULL,
	`metadata_json` text,
	`ip_hash` text,
	`user_agent` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "site_conversion_events_name_check" CHECK((event_name GLOB '[a-z]' OR event_name GLOB '[a-z][a-z0-9_]*') AND length(event_name) <= 64),
	CONSTRAINT "site_conversion_events_stage_check" CHECK("site_conversion_events"."stage" IN ('schedule_navigation', 'external_booking_handoff', 'submitted', 'external_handoff'))
);
--> statement-breakpoint
CREATE INDEX `site_conversion_events_site_created_idx` ON `site_conversion_events` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `site_conversion_events_name_created_idx` ON `site_conversion_events` (`event_name`,`created_at`);--> statement-breakpoint
CREATE INDEX `site_conversion_events_session_idx` ON `site_conversion_events` (`site_id`,`session_id`);--> statement-breakpoint
CREATE INDEX `site_conversion_events_entity_idx` ON `site_conversion_events` (`site_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `site_conversion_events_source_medium_created_idx` ON `site_conversion_events` (`site_id`,`source`,`medium`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_conversion_events_entity_unique` ON `site_conversion_events` (`site_id`,`event_name`,`entity_type`,`entity_id`) WHERE "site_conversion_events"."entity_type" IS NOT NULL AND "site_conversion_events"."entity_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `site_conversion_events_organization_id_idx` ON `site_conversion_events` (`organization_id`);--> statement-breakpoint
ALTER TABLE `sites` ADD `analytics_data_start_at` text;--> statement-breakpoint
DELETE FROM `media_placements`
WHERE `owner_type` = 'site'
	AND `slot` = 'favicon'
	AND `status` <> 'active'
	AND EXISTS (
		SELECT 1 FROM `media_placements` AS logo
		WHERE logo.`owner_type` = 'site'
			AND logo.`owner_id` = `media_placements`.`owner_id`
			AND logo.`slot` = 'logo'
			AND logo.`sort_order` = 0
			AND logo.`status` = 'active'
	)
	AND NOT EXISTS (
		SELECT 1 FROM `media_placements` AS active_favicon
		WHERE active_favicon.`owner_type` = 'site'
			AND active_favicon.`owner_id` = `media_placements`.`owner_id`
			AND active_favicon.`slot` = 'favicon'
			AND active_favicon.`status` = 'active'
	);--> statement-breakpoint
INSERT INTO `media_placements` (
	`id`, `organization_id`, `site_id`, `owner_type`, `owner_id`, `slot`,
	`asset_id`, `sort_order`, `status`, `created_at`, `updated_at`
)
SELECT
	'favicon-' || logo.`id`, logo.`organization_id`, logo.`site_id`,
	'site', logo.`site_id`, 'favicon', logo.`asset_id`, 0, 'active',
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `media_placements` AS logo
WHERE logo.`owner_type` = 'site'
	AND logo.`slot` = 'logo'
	AND logo.`sort_order` = 0
	AND logo.`status` = 'active'
	AND NOT EXISTS (
		SELECT 1 FROM `media_placements` AS favicon
		WHERE favicon.`owner_type` = 'site'
			AND favicon.`owner_id` = logo.`site_id`
			AND favicon.`slot` = 'favicon'
			AND favicon.`status` = 'active'
	);--> statement-breakpoint
DELETE FROM `site_pageview_events`;--> statement-breakpoint
DELETE FROM `__reset_site_analytics_daily`;--> statement-breakpoint
DELETE FROM `__reset_site_conversion_events`;--> statement-breakpoint
DROP TABLE `__reset_site_analytics_daily`;--> statement-breakpoint
DROP TABLE `__reset_site_conversion_events`;--> statement-breakpoint
UPDATE `sites`
SET `analytics_data_start_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');--> statement-breakpoint
DROP TABLE `platform_analytics_daily`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
