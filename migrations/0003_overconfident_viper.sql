CREATE TABLE `google_calendar_event_links` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`integration_revision` text NOT NULL,
	`account_id` text NOT NULL,
	`calendar_id` text NOT NULL,
	`event_id` text NOT NULL,
	`booking_kind` text NOT NULL,
	`operational_id` text NOT NULL,
	`request_id` text,
	`booking_revision` text NOT NULL,
	`synced_revision` text,
	`state` text DEFAULT 'pending' NOT NULL,
	`last_error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text,
	`lease_token` text,
	`lease_until` text,
	`last_synced_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "google_calendar_kind_check" CHECK(booking_kind IN ('booking', 'reservation')),
	CONSTRAINT "google_calendar_state_check" CHECK(state IN ('pending', 'synced', 'cleanup', 'deleted', 'error'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_calendar_subject_unique` ON `google_calendar_event_links` (`organization_id`,`integration_revision`,`booking_kind`,`operational_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `google_calendar_provider_unique` ON `google_calendar_event_links` (`calendar_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `google_calendar_due_idx` ON `google_calendar_event_links` (`organization_id`,`state`,`next_attempt_at`);