PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_submission_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_type` text NOT NULL,
	`submission_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`direction` text NOT NULL,
	`channel` text NOT NULL,
	`body` text NOT NULL,
	`sender_user_id` text,
	`meta_message_id` text,
	`status` text DEFAULT 'sent' NOT NULL,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "submission_type_check" CHECK(submission_type IN ('contact', 'reservation', 'experience_booking')),
	CONSTRAINT "direction_check" CHECK(direction IN ('in', 'out')),
	CONSTRAINT "channel_check" CHECK(channel IN ('email', 'whatsapp'))
);
--> statement-breakpoint
INSERT INTO `__new_submission_messages`("id", "submission_type", "submission_id", "organization_id", "site_id", "direction", "channel", "body", "sender_user_id", "meta_message_id", "status", "error", "created_at") SELECT "id", "submission_type", "submission_id", "organization_id", "site_id", "direction", "channel", "body", "sender_user_id", "meta_message_id", "status", "error", "created_at" FROM `submission_messages`;--> statement-breakpoint
DROP TABLE `submission_messages`;--> statement-breakpoint
ALTER TABLE `__new_submission_messages` RENAME TO `submission_messages`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `submission_messages_meta_message_id_unique` ON `submission_messages` (`meta_message_id`);--> statement-breakpoint
CREATE INDEX `submission_type_id_idx` ON `submission_messages` (`submission_type`,`submission_id`);