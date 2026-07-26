DROP TABLE `submission_messages`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_guest_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`submission_type` text NOT NULL,
	`submission_id` text NOT NULL,
	`guest_name` text NOT NULL,
	`guest_email` text,
	`guest_phone` text,
	`last_message_at` text,
	`last_inbound_at` text,
	`last_outbound_at` text,
	`last_message_preview` text,
	`conversation_state` text DEFAULT 'needs_attention' NOT NULL,
	`operational_status` text,
	`resolved_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "guest_threads_submission_type_check" CHECK(submission_type IN ('contact', 'reservation', 'experience_booking')),
	CONSTRAINT "guest_threads_conversation_state_check" CHECK(conversation_state IN ('needs_attention', 'waiting_on_guest', 'resolved'))
);
--> statement-breakpoint
INSERT INTO `__new_guest_threads`("id", "organization_id", "site_id", "location_id", "submission_type", "submission_id", "guest_name", "guest_email", "guest_phone", "last_message_at", "last_inbound_at", "last_outbound_at", "last_message_preview", "conversation_state", "operational_status", "resolved_at", "created_at", "updated_at") SELECT "id", "organization_id", "site_id", "location_id", "submission_type", "submission_id", "guest_name", "guest_email", "guest_phone", "last_message_at", "last_inbound_at", "last_outbound_at", "last_message_preview", CASE WHEN conversation_state IN ('needs_attention', 'waiting_on_guest', 'resolved') THEN conversation_state ELSE 'needs_attention' END, "operational_status", "resolved_at", "created_at", "updated_at" FROM `guest_threads`;--> statement-breakpoint
DROP TABLE `guest_threads`;--> statement-breakpoint
ALTER TABLE `__new_guest_threads` RENAME TO `guest_threads`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `guest_threads_site_updated_idx` ON `guest_threads` (`site_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `guest_threads_location_updated_idx` ON `guest_threads` (`location_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `guest_threads_conversation_state_idx` ON `guest_threads` (`site_id`,`conversation_state`,`updated_at`);--> statement-breakpoint
CREATE INDEX `guest_threads_organization_id_idx` ON `guest_threads` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `guest_threads_submission_unique` ON `guest_threads` (`submission_type`,`submission_id`);
