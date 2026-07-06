CREATE TABLE `notification_events` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_type` text NOT NULL,
	`organization_id` text,
	`site_id` text,
	`location_id` text,
	`submission_type` text NOT NULL,
	`submission_id` text NOT NULL,
	`event_type` text NOT NULL,
	`channels` text,
	`recipients` text,
	`payload` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `notification_events_scope_created_idx` ON `notification_events` (`scope_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `notification_events_submission_idx` ON `notification_events` (`submission_type`,`submission_id`);--> statement-breakpoint
CREATE INDEX `notification_events_event_created_idx` ON `notification_events` (`event_type`,`created_at`);