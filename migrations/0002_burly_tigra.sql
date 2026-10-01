PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`product_id` text NOT NULL,
	`product_session_id` text NOT NULL,
	`product_variant_id` text NOT NULL,
	`user_id` text,
	`request_id` text,
	`party_size` integer NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`cancelled_at` text,
	`cancellation_reason` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`,`product_id`,`product_session_id`) REFERENCES `product_sessions`(`organization_id`,`product_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`product_id`,`product_variant_id`) REFERENCES `product_variants`(`organization_id`,`product_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`request_id`) REFERENCES `requests`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bookings_status_check" CHECK(status IN ('pending', 'confirmed', 'cancelled')),
	CONSTRAINT "bookings_instants_check" CHECK((cancelled_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', cancelled_at, '+0 days') IS cancelled_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)),
	CONSTRAINT "bookings_party_size_check" CHECK(party_size > 0)
);
--> statement-breakpoint
INSERT INTO `__new_bookings`("id", "organization_id", "product_id", "product_session_id", "product_variant_id", "user_id", "request_id", "party_size", "status", "cancelled_at", "cancellation_reason", "created_at", "updated_at") SELECT "id", "organization_id", "product_id", "product_session_id", "product_variant_id", "user_id", "request_id", "party_size", "status", "cancelled_at", "cancellation_reason", "created_at", "updated_at" FROM `bookings`;--> statement-breakpoint
DROP TABLE `bookings`;--> statement-breakpoint
ALTER TABLE `__new_bookings` RENAME TO `bookings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_request_unique` ON `bookings` (`request_id`) WHERE request_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `bookings_session_status_idx` ON `bookings` (`product_session_id`,`status`);--> statement-breakpoint
CREATE INDEX `bookings_org_created_idx` ON `bookings` (`created_at`);--> statement-breakpoint
CREATE INDEX `bookings_org_user_idx` ON `bookings` (`organization_id`,`user_id`);--> statement-breakpoint
-- Expand the parent config in place: rebuilding it would cascade-delete sessions on D1.
ALTER TABLE product_booking_configs ADD COLUMN confirmation_mode text NOT NULL DEFAULT 'instant'
  CONSTRAINT product_booking_configs_confirmation_check CHECK (confirmation_mode IN ('instant', 'review'));
--> statement-breakpoint
ALTER TABLE product_booking_configs ADD COLUMN online_payment_required integer NOT NULL DEFAULT 0
  CONSTRAINT product_booking_configs_payment_check CHECK (online_payment_required IN (0, 1));
--> statement-breakpoint
ALTER TABLE product_booking_configs ADD COLUMN online_timezone text;
--> statement-breakpoint
ALTER TABLE product_booking_configs ADD COLUMN calendar_group text
  CONSTRAINT product_booking_configs_calendar_check CHECK (calendar_group IS NULL OR (length(trim(calendar_group)) > 0 AND online_timezone IS NOT NULL));

--> statement-breakpoint
ALTER TABLE organization ADD COLUMN consultation_settings_json text;
--> statement-breakpoint
UPDATE organization SET consultation_settings_json = json_extract(settings_json, '$.consultation') WHERE json_type(settings_json, '$.consultation') = 'object';
