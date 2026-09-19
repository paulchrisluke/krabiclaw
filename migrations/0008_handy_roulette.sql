-- A booking or reservation is confirmed or cancelled, and done is the clock.
-- These rows predate that: `pending` waited on a host approval nobody gives and
-- `completed` was a click for something the calendar already knows. Neither was
-- ever cancelled, so both are the state they were really in. The rebuild below
-- copies them into a table whose CHECK allows only the two, so the values have
-- to be right before the copy, not after it.
UPDATE bookings SET status = 'confirmed' WHERE status IN ('pending', 'completed');--> statement-breakpoint
UPDATE reservations SET status = 'confirmed' WHERE status IN ('pending', 'completed');--> statement-breakpoint
UPDATE product_sessions SET status = 'scheduled' WHERE status NOT IN ('scheduled', 'cancelled');--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`product_id` text NOT NULL,
	`product_session_id` text NOT NULL,
	`product_variant_id` text NOT NULL,
	`customer_id` text,
	`request_id` text,
	`party_size` integer NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`cancelled_at` text,
	`cancellation_reason` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`,`site_id`) REFERENCES `sites`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`product_id`,`product_session_id`) REFERENCES `product_sessions`(`organization_id`,`product_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`,`product_id`,`product_variant_id`) REFERENCES `product_variants`(`organization_id`,`product_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`,`site_id`,`request_id`) REFERENCES `requests`(`organization_id`,`site_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "bookings_status_check" CHECK(status IN ('confirmed', 'cancelled')),
	CONSTRAINT "bookings_instants_check" CHECK((cancelled_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', cancelled_at, '+0 days') IS cancelled_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)),
	CONSTRAINT "bookings_party_size_check" CHECK(party_size > 0)
);
--> statement-breakpoint
INSERT INTO `__new_bookings`("id", "organization_id", "site_id", "product_id", "product_session_id", "product_variant_id", "customer_id", "request_id", "party_size", "status", "cancelled_at", "cancellation_reason", "created_at", "updated_at") SELECT "id", "organization_id", "site_id", "product_id", "product_session_id", "product_variant_id", "customer_id", "request_id", "party_size", "status", "cancelled_at", "cancellation_reason", "created_at", "updated_at" FROM `bookings`;--> statement-breakpoint
DROP TABLE `bookings`;--> statement-breakpoint
ALTER TABLE `__new_bookings` RENAME TO `bookings`;--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_request_unique` ON `bookings` (`request_id`) WHERE request_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `bookings_session_status_idx` ON `bookings` (`product_session_id`,`status`);--> statement-breakpoint
CREATE INDEX `bookings_site_created_idx` ON `bookings` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `bookings_customer_idx` ON `bookings` (`customer_id`);--> statement-breakpoint
CREATE TABLE `__new_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`customer_id` text,
	`request_id` text,
	`timezone` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`party_size` integer NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`cancelled_at` text,
	`cancellation_reason` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`,`site_id`,`location_id`) REFERENCES `business_locations`(`organization_id`,`site_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`request_id`) REFERENCES `requests`(`organization_id`,`site_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "reservations_status_check" CHECK(status IN ('confirmed', 'cancelled')),
	CONSTRAINT "reservations_instants_check" CHECK((strftime('%Y-%m-%dT%H:%M:%fZ', starts_at, '+0 days') IS starts_at) AND (strftime('%Y-%m-%dT%H:%M:%fZ', ends_at, '+0 days') IS ends_at) AND (cancelled_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', cancelled_at, '+0 days') IS cancelled_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)),
	CONSTRAINT "reservations_interval_check" CHECK(ends_at > starts_at),
	CONSTRAINT "reservations_party_size_check" CHECK(party_size > 0),
	CONSTRAINT "reservations_timezone_check" CHECK(timezone <> '' AND timezone NOT GLOB '*[^A-Za-z0-9/_+-]*')
);
--> statement-breakpoint
INSERT INTO `__new_reservations`("id", "organization_id", "site_id", "location_id", "customer_id", "request_id", "timezone", "starts_at", "ends_at", "party_size", "status", "cancelled_at", "cancellation_reason", "created_at", "updated_at") SELECT "id", "organization_id", "site_id", "location_id", "customer_id", "request_id", "timezone", "starts_at", "ends_at", "party_size", "status", "cancelled_at", "cancellation_reason", "created_at", "updated_at" FROM `reservations`;--> statement-breakpoint
DROP TABLE `reservations`;--> statement-breakpoint
ALTER TABLE `__new_reservations` RENAME TO `reservations`;--> statement-breakpoint
CREATE UNIQUE INDEX `reservations_request_unique` ON `reservations` (`request_id`) WHERE request_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `reservations_location_start_idx` ON `reservations` (`location_id`,`starts_at`,`status`);--> statement-breakpoint
CREATE INDEX `reservations_site_created_idx` ON `reservations` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reservations_customer_idx` ON `reservations` (`customer_id`);--> statement-breakpoint
CREATE TABLE `__new_product_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`product_id` text NOT NULL,
	`location_id` text,
	`availability_rule_id` text,
	`source_occurrence_key` text,
	`timezone` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`capacity` integer,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`product_id`) REFERENCES `product_booking_configs`(`organization_id`,`product_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`location_id`) REFERENCES `business_locations`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`availability_rule_id`) REFERENCES `product_availability_rules`(`organization_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "product_sessions_status_check" CHECK(status IN ('scheduled', 'cancelled')),
	CONSTRAINT "product_sessions_instants_check" CHECK((strftime('%Y-%m-%dT%H:%M:%fZ', starts_at, '+0 days') IS starts_at) AND (strftime('%Y-%m-%dT%H:%M:%fZ', ends_at, '+0 days') IS ends_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)),
	CONSTRAINT "product_sessions_interval_check" CHECK(ends_at > starts_at),
	CONSTRAINT "product_sessions_capacity_check" CHECK(capacity IS NULL OR capacity >= 0),
	CONSTRAINT "product_sessions_timezone_check" CHECK(timezone <> '' AND timezone NOT GLOB '*[^A-Za-z0-9/_+-]*')
);
--> statement-breakpoint
INSERT INTO `__new_product_sessions`("id", "organization_id", "product_id", "location_id", "availability_rule_id", "source_occurrence_key", "timezone", "starts_at", "ends_at", "capacity", "status", "created_at", "updated_at", "created_by", "updated_by") SELECT "id", "organization_id", "product_id", "location_id", "availability_rule_id", "source_occurrence_key", "timezone", "starts_at", "ends_at", "capacity", "status", "created_at", "updated_at", "created_by", "updated_by" FROM `product_sessions`;--> statement-breakpoint
DROP TABLE `product_sessions`;--> statement-breakpoint
ALTER TABLE `__new_product_sessions` RENAME TO `product_sessions`;--> statement-breakpoint
CREATE UNIQUE INDEX `product_sessions_occurrence_unique` ON `product_sessions` (`product_id`,`source_occurrence_key`) WHERE source_occurrence_key IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `product_sessions_location_instant_unique` ON `product_sessions` (`product_id`,`location_id`,`starts_at`) WHERE location_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `product_sessions_neutral_instant_unique` ON `product_sessions` (`product_id`,`starts_at`) WHERE location_id IS NULL;--> statement-breakpoint
CREATE INDEX `product_sessions_product_start_idx` ON `product_sessions` (`product_id`,`starts_at`,`status`);--> statement-breakpoint
CREATE INDEX `product_sessions_location_start_idx` ON `product_sessions` (`location_id`,`starts_at`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_sessions_org_id_unique` ON `product_sessions` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_sessions_org_product_id_unique` ON `product_sessions` (`organization_id`,`product_id`,`id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
