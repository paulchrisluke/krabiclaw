PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_booking_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`policy_type` text NOT NULL,
	`scope_type` text NOT NULL,
	`location_id` text,
	`experience_id` text,
	`booking_window_days` integer,
	`advance_notice_minutes` integer,
	`free_cancellation_until_minutes` integer,
	`late_arrival_grace_minutes` integer,
	`host_confirmation_sla_minutes` integer,
	`reschedule_allowed` numeric,
	`reschedule_cutoff_minutes` integer,
	`deposit_required` numeric,
	`deposit_trigger_party_size` integer,
	`special_requests_allowed` numeric,
	`weather_policy` text,
	`minimum_guest_age` integer,
	`accessibility_contact_required` numeric,
	`additional_notes_html` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`experience_id`) REFERENCES `experiences`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "booking_policies_policy_type_check" CHECK(policy_type IN ('reservation', 'experience')),
	CONSTRAINT "booking_policies_scope_type_check" CHECK(scope_type IN ('site', 'location', 'experience'))
);
--> statement-breakpoint
INSERT INTO `__new_booking_policies`("id", "organization_id", "site_id", "policy_type", "scope_type", "location_id", "experience_id", "booking_window_days", "advance_notice_minutes", "free_cancellation_until_minutes", "late_arrival_grace_minutes", "host_confirmation_sla_minutes", "reschedule_allowed", "reschedule_cutoff_minutes", "deposit_required", "deposit_trigger_party_size", "special_requests_allowed", "weather_policy", "minimum_guest_age", "accessibility_contact_required", "additional_notes_html", "created_at", "updated_at") SELECT "id", "organization_id", "site_id", "policy_type", "scope_type", "location_id", "experience_id", "booking_window_days", "advance_notice_minutes", "free_cancellation_until_minutes", "late_arrival_grace_minutes", "host_confirmation_sla_minutes", "reschedule_allowed", "reschedule_cutoff_minutes", "deposit_required", "deposit_trigger_party_size", "special_requests_allowed", "weather_policy", "minimum_guest_age", "accessibility_contact_required", "additional_notes_html", "created_at", "updated_at" FROM `booking_policies`;--> statement-breakpoint
DROP TABLE `booking_policies`;--> statement-breakpoint
ALTER TABLE `__new_booking_policies` RENAME TO `booking_policies`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `booking_policies_site_type_idx` ON `booking_policies` (`site_id`,`policy_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_policies_reservation_site_unique` ON `booking_policies` (`site_id`) WHERE policy_type = 'reservation' AND scope_type = 'site';--> statement-breakpoint
CREATE UNIQUE INDEX `booking_policies_reservation_location_unique` ON `booking_policies` (`location_id`) WHERE policy_type = 'reservation' AND scope_type = 'location' AND location_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `booking_policies_experience_site_unique` ON `booking_policies` (`site_id`) WHERE policy_type = 'experience' AND scope_type = 'site';--> statement-breakpoint
CREATE UNIQUE INDEX `booking_policies_experience_location_unique` ON `booking_policies` (`location_id`) WHERE policy_type = 'experience' AND scope_type = 'location' AND location_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `booking_policies_experience_scope_unique` ON `booking_policies` (`experience_id`) WHERE policy_type = 'experience' AND scope_type = 'experience' AND experience_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE `experience_bookings` ADD `cancellation_token_hash` text;--> statement-breakpoint
ALTER TABLE `experience_bookings` ADD `cancellation_token_expires_at` text;--> statement-breakpoint
ALTER TABLE `experience_bookings` ADD `cancellation_token_used_at` text;