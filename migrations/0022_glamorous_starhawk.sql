CREATE TABLE `reservation_slot_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`override_date` text NOT NULL,
	`time_slot` text NOT NULL,
	`status` text DEFAULT 'closed' NOT NULL,
	`capacity_override` integer,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reservation_slot_overrides_status_check" CHECK(status IN ('closed', 'open'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reservation_slot_overrides_unique` ON `reservation_slot_overrides` (`location_id`,`override_date`,`time_slot`);--> statement-breakpoint
CREATE INDEX `idx_reservation_slot_overrides_date` ON `reservation_slot_overrides` (`location_id`,`override_date`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
-- Backfill any pre-existing experience_bookings rows with a null location_id from their
-- experience's own location_id (experiences.location_id has always been NOT NULL, so this
-- is always resolvable) before the column below is made NOT NULL. The only real write path
-- (server/api/public/sites/[siteId]/experiences/[slug]/book.post.ts) has always set this from
-- experience.location_id, so this should be a no-op in practice — it's here so the table
-- recreation below can't fail against any environment with older/legacy rows.
UPDATE experience_bookings
SET location_id = (SELECT e.location_id FROM experiences e WHERE e.id = experience_bookings.experience_id)
WHERE location_id IS NULL;--> statement-breakpoint
CREATE TABLE `__new_experience_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`experience_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`guest_name` text NOT NULL,
	`guest_email` text NOT NULL,
	`guest_phone` text,
	`party_size` integer DEFAULT 1 NOT NULL,
	`booking_date` text NOT NULL,
	`time_slot` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`ip_hash` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`experience_id`) REFERENCES `experiences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_experience_bookings`("id", "experience_id", "organization_id", "site_id", "location_id", "guest_name", "guest_email", "guest_phone", "party_size", "booking_date", "time_slot", "status", "notes", "ip_hash", "created_at", "updated_at") SELECT "id", "experience_id", "organization_id", "site_id", "location_id", "guest_name", "guest_email", "guest_phone", "party_size", "booking_date", "time_slot", "status", "notes", "ip_hash", "created_at", "updated_at" FROM `experience_bookings`;--> statement-breakpoint
DROP TABLE `experience_bookings`;--> statement-breakpoint
ALTER TABLE `__new_experience_bookings` RENAME TO `experience_bookings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `business_locations` ADD `max_capacity` integer;