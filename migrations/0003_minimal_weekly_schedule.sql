-- Read-only preflight and a retained backup are required before application.
-- Abort atomically if any retired value is in use. No Session/Booking DML.
CREATE TABLE `__weekly_simplification_guard` (`violations` integer NOT NULL CHECK (`violations` = 0));--> statement-breakpoint
INSERT INTO `__weekly_simplification_guard` SELECT count(*) FROM `product_availability_rules`
WHERE end_time IS NOT NULL OR interval_minutes IS NOT NULL OR interval_weeks <> 1
   OR effective_from_date IS NOT NULL OR effective_until_date IS NOT NULL
   OR duration_minutes IS NOT NULL OR capacity IS NOT NULL;--> statement-breakpoint
DROP TABLE `__weekly_simplification_guard`;--> statement-breakpoint
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_product_availability_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`product_id` text NOT NULL,
	`location_id` text,
	`timezone` text NOT NULL,
	`weekday` integer NOT NULL,
	`start_time` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`product_id`) REFERENCES `product_booking_configs`(`organization_id`,`product_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`location_id`) REFERENCES `business_locations`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "product_availability_rules_instants_check" CHECK((created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)),
	CONSTRAINT "product_availability_rules_weekday_check" CHECK(weekday BETWEEN 0 AND 6),
	CONSTRAINT "product_availability_rules_start_time_check" CHECK(start_time GLOB '[0-2][0-9]:[0-5][0-9]' AND start_time < '24:00'),
	CONSTRAINT "product_availability_rules_timezone_check" CHECK(timezone <> '' AND timezone NOT GLOB '*[^A-Za-z0-9/_+-]*')
);
--> statement-breakpoint
INSERT INTO `__new_product_availability_rules`("id", "organization_id", "product_id", "location_id", "timezone", "weekday", "start_time", "created_at", "updated_at", "created_by", "updated_by") SELECT "id", "organization_id", "product_id", "location_id", "timezone", "weekday", "start_time", "created_at", "updated_at", "created_by", "updated_by" FROM `product_availability_rules`;--> statement-breakpoint
DROP TABLE `product_availability_rules`;--> statement-breakpoint
ALTER TABLE `__new_product_availability_rules` RENAME TO `product_availability_rules`;--> statement-breakpoint
CREATE UNIQUE INDEX `product_availability_rules_slot_unique` ON `product_availability_rules` (`product_id`,`location_id`,`weekday`,`start_time`) WHERE location_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `product_availability_rules_neutral_slot_unique` ON `product_availability_rules` (`product_id`,`weekday`,`start_time`) WHERE location_id IS NULL;--> statement-breakpoint
CREATE INDEX `product_availability_rules_product_idx` ON `product_availability_rules` (`product_id`,`weekday`,`start_time`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_availability_rules_org_id_unique` ON `product_availability_rules` (`organization_id`,`id`);--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
