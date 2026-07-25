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
	`inbox_status` text DEFAULT 'open' NOT NULL,
	`unread_count` integer DEFAULT 0 NOT NULL,
	`last_message_at` text,
	`last_inbound_at` text,
	`last_outbound_at` text,
	`last_message_preview` text,
	`owner_last_seen_at` text,
	`conversation_state` text DEFAULT 'needs_attention' NOT NULL,
	`operational_status` text,
	`resolved_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "guest_threads_submission_type_check" CHECK(submission_type IN ('contact', 'reservation', 'experience_booking')),
	CONSTRAINT "guest_threads_inbox_status_check" CHECK(inbox_status IN ('open', 'waiting_on_owner', 'waiting_on_guest', 'closed')),
	CONSTRAINT "guest_threads_conversation_state_check" CHECK(conversation_state IN ('needs_attention', 'waiting_on_guest', 'resolved'))
);
--> statement-breakpoint
INSERT INTO `__new_guest_threads`("id", "organization_id", "site_id", "location_id", "submission_type", "submission_id", "guest_name", "guest_email", "guest_phone", "inbox_status", "unread_count", "last_message_at", "last_inbound_at", "last_outbound_at", "last_message_preview", "owner_last_seen_at", "conversation_state", "operational_status", "resolved_at", "created_at", "updated_at") SELECT "id", "organization_id", "site_id", "location_id", "submission_type", "submission_id", "guest_name", "guest_email", "guest_phone", "inbox_status", "unread_count", "last_message_at", "last_inbound_at", "last_outbound_at", "last_message_preview", "owner_last_seen_at", "conversation_state", "operational_status", "resolved_at", "created_at", "updated_at" FROM `guest_threads`;--> statement-breakpoint
DROP TABLE `guest_threads`;--> statement-breakpoint
ALTER TABLE `__new_guest_threads` RENAME TO `guest_threads`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `guest_threads_site_updated_idx` ON `guest_threads` (`site_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `guest_threads_location_updated_idx` ON `guest_threads` (`location_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `guest_threads_inbox_status_idx` ON `guest_threads` (`site_id`,`inbox_status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `guest_threads_conversation_state_idx` ON `guest_threads` (`site_id`,`conversation_state`,`updated_at`);--> statement-breakpoint
CREATE INDEX `guest_threads_organization_id_idx` ON `guest_threads` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `guest_threads_submission_unique` ON `guest_threads` (`submission_type`,`submission_id`);