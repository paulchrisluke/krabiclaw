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
ALTER TABLE `bookings` ADD `assigned_member_id` text;--> statement-breakpoint
ALTER TABLE `payment_checkout_holds` ADD `assigned_member_id` text;--> statement-breakpoint
ALTER TABLE `product_booking_configs` ADD `scheduling_mode` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `product_booking_configs` ADD `assigned_member_id` text;--> statement-breakpoint
ALTER TABLE `product_sessions` ADD `assigned_member_id` text;