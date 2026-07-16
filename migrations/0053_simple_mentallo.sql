CREATE TABLE `notification_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`notification_id` text NOT NULL,
	`channel` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider_message_id` text,
	`error` text,
	`sent_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_deliveries_notification_idx` ON `notification_deliveries` (`notification_id`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_channel_status_idx` ON `notification_deliveries` (`channel`,`status`);--> statement-breakpoint
CREATE TABLE `notification_reads` (
	`notification_id` text NOT NULL,
	`user_id` text NOT NULL,
	`read_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`notification_id`, `user_id`),
	FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_reads_user_read_at_idx` ON `notification_reads` (`user_id`,`read_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`site_id` text,
	`location_id` text,
	`scope` text DEFAULT 'organization' NOT NULL,
	`event_type` text,
	`severity` text DEFAULT 'info' NOT NULL,
	`actor_user_id` text,
	`target_user_id` text,
	`deep_link` text,
	`message` text,
	`channel` text DEFAULT 'dashboard' NOT NULL,
	`template` text NOT NULL,
	`recipient` text,
	`title` text,
	`payload` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider_message_id` text,
	`error` text,
	`read_at` text,
	`sent_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`target_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_notifications`("id", "organization_id", "site_id", "location_id", "scope", "event_type", "severity", "actor_user_id", "target_user_id", "deep_link", "message", "channel", "template", "recipient", "title", "payload", "status", "provider_message_id", "error", "read_at", "sent_at", "created_at")
SELECT "id", "organization_id", "site_id", "location_id",
	CASE WHEN "site_id" IS NOT NULL THEN 'site' ELSE 'organization' END,
	CASE WHEN "channel" = 'dashboard' THEN "template" ELSE NULL END,
	'info', NULL, NULL, NULL, NULL, "channel", "template", "recipient", "title", "payload", "status", "provider_message_id", "error", "read_at", "sent_at", "created_at"
FROM `notifications`;--> statement-breakpoint
DROP TABLE `notifications`;--> statement-breakpoint
ALTER TABLE `__new_notifications` RENAME TO `notifications`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `notifications_scope_created_at_idx` ON `notifications` (`scope`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_organization_created_at_idx` ON `notifications` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_site_created_at_idx` ON `notifications` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_target_user_created_at_idx` ON `notifications` (`target_user_id`,`created_at`);
