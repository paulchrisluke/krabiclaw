CREATE TABLE `submission_messages` (
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
	FOREIGN KEY (`sender_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submission_messages_meta_message_id_unique` ON `submission_messages` (`meta_message_id`);