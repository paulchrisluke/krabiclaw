PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_site_conversion_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`event_name` text NOT NULL,
	`page_type` text,
	`page_path` text,
	`page_location` text,
	`cta_destination` text,
	`tenant` text,
	`metadata_json` text,
	`ip_hash` text,
	`user_agent` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "site_conversion_events_name_check" CHECK((event_name GLOB '[a-z]' OR event_name GLOB '[a-z][a-z0-9_]*') AND length(event_name) <= 64)
);
--> statement-breakpoint
INSERT INTO `__new_site_conversion_events`("id", "organization_id", "site_id", "event_name", "page_type", "page_path", "page_location", "cta_destination", "tenant", "metadata_json", "ip_hash", "user_agent", "created_at") SELECT "id", "organization_id", "site_id", "event_name", "page_type", "page_path", "page_location", "cta_destination", "tenant", "metadata_json", "ip_hash", "user_agent", "created_at" FROM `site_conversion_events`;--> statement-breakpoint
DROP TABLE `site_conversion_events`;--> statement-breakpoint
ALTER TABLE `__new_site_conversion_events` RENAME TO `site_conversion_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `site_conversion_events_site_created_idx` ON `site_conversion_events` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `site_conversion_events_name_created_idx` ON `site_conversion_events` (`event_name`,`created_at`);