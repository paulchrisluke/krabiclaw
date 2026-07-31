CREATE TABLE `guest_thread_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`action` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`actor_kind` text NOT NULL,
	`actor_user_id` text,
	`actor_member_id` text,
	`request_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`result_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`thread_id`) REFERENCES `guest_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`actor_member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "guest_thread_commands_actor_kind_check" CHECK(actor_kind IN ('member', 'guest', 'system')),
	CONSTRAINT "guest_thread_commands_status_check" CHECK(status IN ('pending', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `guest_thread_commands_site_created_idx` ON `guest_thread_commands` (`site_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `guest_thread_commands_thread_idempotency_unique` ON `guest_thread_commands` (`thread_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `guest_thread_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`delivery_id` text,
	`event_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text,
	`locked_at` text,
	`last_error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `guest_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`delivery_id`) REFERENCES `guest_thread_deliveries`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "guest_thread_outbox_status_check" CHECK(status IN ('pending', 'publishing', 'published', 'failed', 'dead'))
);
--> statement-breakpoint
CREATE INDEX `guest_thread_outbox_status_next_idx` ON `guest_thread_outbox` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `guest_thread_outbox_thread_idx` ON `guest_thread_outbox` (`thread_id`);--> statement-breakpoint
ALTER TABLE `guest_thread_deliveries` ADD `from_name` text;--> statement-breakpoint
ALTER TABLE `guest_thread_deliveries` ADD `subject` text;--> statement-breakpoint
ALTER TABLE `guest_thread_deliveries` ADD `text_body` text;--> statement-breakpoint
ALTER TABLE `guest_thread_deliveries` ADD `reply_to` text;--> statement-breakpoint
ALTER TABLE `guest_thread_deliveries` ADD `locale` text;--> statement-breakpoint
ALTER TABLE `guest_thread_deliveries` ADD `template_version` text;--> statement-breakpoint
ALTER TABLE `guest_thread_deliveries` ADD `source_snapshot_json` text;--> statement-breakpoint
ALTER TABLE `guest_thread_deliveries` ADD `payload_hash` text;--> statement-breakpoint
ALTER TABLE `guest_thread_deliveries` ADD `provider_idempotency_key` text;--> statement-breakpoint
ALTER TABLE `guest_thread_deliveries` ADD `processing_lease_until` text;--> statement-breakpoint
ALTER TABLE `guest_thread_entries` ADD `sequence` integer;--> statement-breakpoint
UPDATE `guest_thread_entries`
SET `sequence` = (
	SELECT ranked.sequence
	FROM (
		SELECT
			id,
			ROW_NUMBER() OVER (PARTITION BY thread_id ORDER BY occurred_at ASC, id ASC) AS sequence
		FROM `guest_thread_entries`
	) ranked
	WHERE ranked.id = guest_thread_entries.id
);--> statement-breakpoint
CREATE UNIQUE INDEX `guest_thread_entries_thread_sequence_unique` ON `guest_thread_entries` (`thread_id`,`sequence`);--> statement-breakpoint
ALTER TABLE `guest_thread_member_state` ADD `last_read_sequence` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `guest_thread_member_state`
SET `last_read_sequence` = COALESCE((
	SELECT MAX(gte.sequence)
	FROM `guest_thread_entries` gte
	WHERE gte.thread_id = guest_thread_member_state.thread_id
	  AND gte.occurred_at <= guest_thread_member_state.last_read_at
), 0)
WHERE `last_read_at` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `guest_thread_member_state` DROP COLUMN `last_read_at`;--> statement-breakpoint
ALTER TABLE `guest_threads` ADD `version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `guest_threads_site_version_idx` ON `guest_threads` (`site_id`,`version`);
