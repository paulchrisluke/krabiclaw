CREATE TABLE `user_phone_verification` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`format_valid` integer DEFAULT 0 NOT NULL,
	`ownership_verified` integer DEFAULT 0 NOT NULL,
	`whatsapp_observed_at` text,
	`phone_metadata_version` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_phone_verification_user_id_unique` ON `user_phone_verification` (`user_id`);--> statement-breakpoint
ALTER TABLE `customers` ADD `phone_metadata_version` text;--> statement-breakpoint
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
	`related_submission_type` text,
	`related_submission_id` text,
	`whatsapp_delivery_status` text,
	`whatsapp_delivery_error` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`target_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "notifications_whatsapp_delivery_status_check" CHECK(whatsapp_delivery_status IS NULL OR whatsapp_delivery_status IN ('accepted', 'sent', 'delivered', 'read', 'failed')),
	CONSTRAINT "notifications_related_submission_type_check" CHECK(related_submission_type IS NULL OR related_submission_type IN ('contact', 'reservation', 'experience_booking'))
);
--> statement-breakpoint
INSERT INTO `__new_notifications`("id", "organization_id", "site_id", "location_id", "scope", "event_type", "severity", "actor_user_id", "target_user_id", "deep_link", "message", "channel", "template", "recipient", "title", "payload", "status", "provider_message_id", "error", "read_at", "sent_at", "created_at", "related_submission_type", "related_submission_id", "whatsapp_delivery_status", "whatsapp_delivery_error") SELECT "id", "organization_id", "site_id", "location_id", "scope", "event_type", "severity", "actor_user_id", "target_user_id", "deep_link", "message", "channel", "template", "recipient", "title", "payload", "status", "provider_message_id", "error", "read_at", "sent_at", "created_at", "related_submission_type", "related_submission_id", "whatsapp_delivery_status", "whatsapp_delivery_error" FROM `notifications`;--> statement-breakpoint
DROP TABLE `notifications`;--> statement-breakpoint
ALTER TABLE `__new_notifications` RENAME TO `notifications`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `notifications_scope_created_at_idx` ON `notifications` (`scope`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_organization_created_at_idx` ON `notifications` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_site_created_at_idx` ON `notifications` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_target_user_created_at_idx` ON `notifications` (`target_user_id`,`created_at`);