CREATE TABLE `guest_thread_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`entry_id` text,
	`channel` text NOT NULL,
	`provider` text,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`provider_message_id` text,
	`to_address` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `guest_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `guest_thread_entries`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "guest_thread_deliveries_channel_check" CHECK(channel IN ('email', 'whatsapp')),
	CONSTRAINT "guest_thread_deliveries_status_check" CHECK(status IN ('queued', 'sent', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guest_thread_deliveries_idempotency_key_unique` ON `guest_thread_deliveries` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `guest_thread_deliveries_thread_status_idx` ON `guest_thread_deliveries` (`thread_id`,`status`);--> statement-breakpoint
CREATE INDEX `guest_thread_deliveries_status_updated_idx` ON `guest_thread_deliveries` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `guest_thread_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`kind` text NOT NULL,
	`actor_kind` text NOT NULL,
	`actor_user_id` text,
	`channel` text,
	`body` text,
	`event_name` text,
	`payload_json` text,
	`external_id` text,
	`occurred_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `guest_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "guest_thread_entries_kind_check" CHECK(kind IN ('submission', 'message', 'operation', 'delivery', 'assignment', 'resolution')),
	CONSTRAINT "guest_thread_entries_actor_kind_check" CHECK(actor_kind IN ('guest', 'member', 'system')),
	CONSTRAINT "guest_thread_entries_channel_check" CHECK(channel IS NULL OR channel IN ('web', 'email', 'whatsapp', 'system'))
);
--> statement-breakpoint
CREATE INDEX `guest_thread_entries_thread_occurred_idx` ON `guest_thread_entries` (`thread_id`,`occurred_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `guest_thread_entries_external_id_unique` ON `guest_thread_entries` (`external_id`) WHERE external_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `guest_thread_entries_site_kind_occurred_idx` ON `guest_thread_entries` (`site_id`,`kind`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `guest_thread_entries_organization_id_idx` ON `guest_thread_entries` (`organization_id`);--> statement-breakpoint
CREATE TABLE `guest_thread_member_state` (
	`thread_id` text NOT NULL,
	`member_id` text NOT NULL,
	`last_read_entry_id` text,
	`last_read_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`thread_id`, `member_id`),
	FOREIGN KEY (`thread_id`) REFERENCES `guest_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`last_read_entry_id`) REFERENCES `guest_thread_entries`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `guest_thread_member_state_member_updated_idx` ON `guest_thread_member_state` (`member_id`,`updated_at`);--> statement-breakpoint
ALTER TABLE `guest_threads` ADD `conversation_state` text DEFAULT 'needs_attention' NOT NULL CHECK(`conversation_state` IN ('needs_attention', 'waiting_on_guest', 'resolved'));--> statement-breakpoint
ALTER TABLE `guest_threads` ADD `operational_status` text;--> statement-breakpoint
ALTER TABLE `guest_threads` ADD `resolved_at` text;--> statement-breakpoint
UPDATE `guest_threads`
SET `conversation_state` = CASE
	WHEN `inbox_status` = 'closed' THEN 'resolved'
	WHEN `inbox_status` = 'waiting_on_guest' THEN 'waiting_on_guest'
	ELSE 'needs_attention'
END,
`resolved_at` = CASE WHEN `inbox_status` = 'closed' THEN COALESCE(`last_message_at`, `updated_at`) ELSE NULL END;--> statement-breakpoint
CREATE INDEX `guest_threads_conversation_state_idx` ON `guest_threads` (`site_id`,`conversation_state`,`updated_at`);
