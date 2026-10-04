CREATE UNIQUE INDEX `member_id_organizationId_unique` ON `member` (`id`,`organizationId`);--> statement-breakpoint
CREATE TABLE `__new_member_scheduling` (
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
	FOREIGN KEY (`member_id`,`organization_id`) REFERENCES `member`(`id`,`organizationId`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_member_scheduling`("member_id", "organization_id", "timezone", "weekly_json", "time_off_json", "windows_json", "windows_until", "public_name", "public_photo_url", "public_bio", "public_approved", "calendar_account_id", "calendar_ids_json", "calendar_revision", "busy_json", "busy_from", "busy_until", "busy_checked_at", "busy_error", "updated_at", "updated_by") SELECT "member_id", "organization_id", "timezone", "weekly_json", "time_off_json", "windows_json", "windows_until", "public_name", "public_photo_url", "public_bio", "public_approved", "calendar_account_id", "calendar_ids_json", "calendar_revision", "busy_json", "busy_from", "busy_until", "busy_checked_at", "busy_error", "updated_at", "updated_by" FROM `member_scheduling`;--> statement-breakpoint
DROP TABLE `member_scheduling`;--> statement-breakpoint
ALTER TABLE `__new_member_scheduling` RENAME TO `member_scheduling`;--> statement-breakpoint
CREATE INDEX `member_scheduling_org_idx` ON `member_scheduling` (`organization_id`);--> statement-breakpoint
