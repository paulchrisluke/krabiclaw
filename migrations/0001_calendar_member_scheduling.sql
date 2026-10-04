CREATE TABLE `google_calendar_cleanup_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`account_id` text NOT NULL,
	`calendar_id` text NOT NULL,
	`event_id` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`next_attempt_at` text,
	`lease_token` text,
	`lease_until` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "google_calendar_cleanup_state_check" CHECK(state IN ('pending', 'error', 'deleted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_calendar_cleanup_provider_unique` ON `google_calendar_cleanup_jobs` (`calendar_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `google_calendar_cleanup_due_idx` ON `google_calendar_cleanup_jobs` (`state`,`next_attempt_at`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `google_calendar_subject_unique` ON `google_calendar_event_links` (`organization_id`,`integration_revision`,`booking_kind`,`operational_id`) WHERE state <> 'deleted';--> statement-breakpoint
CREATE UNIQUE INDEX `google_calendar_provider_unique` ON `google_calendar_event_links` (`calendar_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `google_calendar_due_idx` ON `google_calendar_event_links` (`organization_id`,`state`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `member_scheduling` (
	`member_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`timezone` text NOT NULL,
	`weekly_json` text NOT NULL,
	`time_off_json` text NOT NULL,
	`windows_json` text NOT NULL,
	`windows_until` text NOT NULL,
	`public_name` text,
	`public_photo_url` text,
	`public_bio` text,
	`public_approved` integer DEFAULT 0 NOT NULL,
	`calendar_account_id` text,
	`calendar_ids_json` text DEFAULT '[]' NOT NULL,
	`calendar_revision` text NOT NULL,
	`busy_json` text DEFAULT '[]' NOT NULL,
	`busy_from` text,
	`busy_until` text,
	`busy_checked_at` text,
	`busy_error` text,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `member_scheduling_org_idx` ON `member_scheduling` (`organization_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_organization_integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`provider` text NOT NULL,
	`account_id` text NOT NULL,
	`target_id` text NOT NULL,
	`target_name` text NOT NULL,
	`measurement_id` text,
	`verified` integer,
	`verification_token` text,
	`calendar_group` text,
	`include_reservations` integer,
	`status` text,
	`last_error` text,
	`revision` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "organization_integrations_provider_check" CHECK(provider IN ('facebook', 'instagram', 'google_analytics', 'google_search_console', 'google_calendar')),
	CONSTRAINT "organization_integrations_values_check" CHECK(trim(account_id) <> '' AND trim(target_id) <> '' AND trim(target_name) <> '' AND trim(revision) <> ''),
	CONSTRAINT "organization_integrations_measurement_check" CHECK((provider = 'google_analytics') = (measurement_id IS NOT NULL)),
	CONSTRAINT "organization_integrations_verification_check" CHECK((provider = 'google_search_console') = (verified IS NOT NULL) AND (verification_token IS NULL OR provider = 'google_search_console') AND (verified IS NULL OR verified IN (0, 1))),
	CONSTRAINT "organization_integrations_calendar_check" CHECK((provider = 'google_calendar') = (include_reservations IS NOT NULL AND status IS NOT NULL) AND (include_reservations IS NULL OR include_reservations IN (0, 1)) AND (status IS NULL OR status IN ('active', 'disabled', 'error')) AND (provider = 'google_calendar' OR (calendar_group IS NULL AND include_reservations IS NULL AND status IS NULL AND last_error IS NULL))),
	CONSTRAINT "organization_integrations_instants_check" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)
);
--> statement-breakpoint
INSERT INTO `__new_organization_integrations`("id", "organization_id", "provider", "account_id", "target_id", "target_name", "measurement_id", "verified", "verification_token", "revision", "created_at", "updated_at") SELECT "id", "organization_id", "provider", "account_id", "target_id", "target_name", "measurement_id", "verified", "verification_token", "revision", "created_at", "updated_at" FROM `organization_integrations`;--> statement-breakpoint
DROP TABLE `organization_integrations`;--> statement-breakpoint
ALTER TABLE `__new_organization_integrations` RENAME TO `organization_integrations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `organization_integrations_account_idx` ON `organization_integrations` (`provider`,`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_integrations_provider_unique` ON `organization_integrations` (`organization_id`,`provider`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_integrations_target_unique` ON `organization_integrations` (`provider`,`target_id`);--> statement-breakpoint
ALTER TABLE `bookings` ADD `assigned_member_id` text;--> statement-breakpoint
ALTER TABLE `product_booking_configs` ADD `scheduling_mode` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `product_booking_configs` ADD `assigned_member_id` text;--> statement-breakpoint
ALTER TABLE `product_sessions` ADD `assigned_member_id` text;
