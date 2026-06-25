PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_stripe_webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`stripe_event_id` text NOT NULL,
	`event_type` text,
	`status` text DEFAULT 'pending',
	`payload` text,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_stripe_webhook_events`("id", "stripe_event_id", "event_type", "status", "payload", "error", "created_at") SELECT "id", "stripe_event_id", "event_type", "status", "payload", "error", "created_at" FROM `stripe_webhook_events`;--> statement-breakpoint
DROP TABLE `stripe_webhook_events`;--> statement-breakpoint
ALTER TABLE `__new_stripe_webhook_events` RENAME TO `stripe_webhook_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `stripe_webhook_events_stripe_event_id_unique` ON `stripe_webhook_events` (`stripe_event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_site_locales_one_source_per_site` ON `site_locales` (`organization_id`,`site_id`) WHERE is_source = 1;