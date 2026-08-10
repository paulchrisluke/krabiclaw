CREATE TABLE `__booking_policies_0110_backup` AS
SELECT * FROM `booking_policies`;--> statement-breakpoint

UPDATE `booking_policies` AS `location_policy`
SET
	`booking_window_days` = COALESCE(`location_policy`.`booking_window_days`, (SELECT `site_policy`.`booking_window_days` FROM `__booking_policies_0110_backup` AS `site_policy` WHERE `site_policy`.`site_id` = `location_policy`.`site_id` AND `site_policy`.`policy_type` = 'reservation' AND `site_policy`.`scope_type` = 'site')),
	`advance_notice_minutes` = COALESCE(`location_policy`.`advance_notice_minutes`, (SELECT `site_policy`.`advance_notice_minutes` FROM `__booking_policies_0110_backup` AS `site_policy` WHERE `site_policy`.`site_id` = `location_policy`.`site_id` AND `site_policy`.`policy_type` = 'reservation' AND `site_policy`.`scope_type` = 'site')),
	`free_cancellation_until_minutes` = COALESCE(`location_policy`.`free_cancellation_until_minutes`, (SELECT `site_policy`.`free_cancellation_until_minutes` FROM `__booking_policies_0110_backup` AS `site_policy` WHERE `site_policy`.`site_id` = `location_policy`.`site_id` AND `site_policy`.`policy_type` = 'reservation' AND `site_policy`.`scope_type` = 'site')),
	`late_arrival_grace_minutes` = COALESCE(`location_policy`.`late_arrival_grace_minutes`, (SELECT `site_policy`.`late_arrival_grace_minutes` FROM `__booking_policies_0110_backup` AS `site_policy` WHERE `site_policy`.`site_id` = `location_policy`.`site_id` AND `site_policy`.`policy_type` = 'reservation' AND `site_policy`.`scope_type` = 'site')),
	`host_confirmation_sla_minutes` = COALESCE(`location_policy`.`host_confirmation_sla_minutes`, (SELECT `site_policy`.`host_confirmation_sla_minutes` FROM `__booking_policies_0110_backup` AS `site_policy` WHERE `site_policy`.`site_id` = `location_policy`.`site_id` AND `site_policy`.`policy_type` = 'reservation' AND `site_policy`.`scope_type` = 'site')),
	`reschedule_allowed` = COALESCE(`location_policy`.`reschedule_allowed`, (SELECT `site_policy`.`reschedule_allowed` FROM `__booking_policies_0110_backup` AS `site_policy` WHERE `site_policy`.`site_id` = `location_policy`.`site_id` AND `site_policy`.`policy_type` = 'reservation' AND `site_policy`.`scope_type` = 'site')),
	`reschedule_cutoff_minutes` = COALESCE(`location_policy`.`reschedule_cutoff_minutes`, (SELECT `site_policy`.`reschedule_cutoff_minutes` FROM `__booking_policies_0110_backup` AS `site_policy` WHERE `site_policy`.`site_id` = `location_policy`.`site_id` AND `site_policy`.`policy_type` = 'reservation' AND `site_policy`.`scope_type` = 'site')),
	`deposit_required` = COALESCE(`location_policy`.`deposit_required`, (SELECT `site_policy`.`deposit_required` FROM `__booking_policies_0110_backup` AS `site_policy` WHERE `site_policy`.`site_id` = `location_policy`.`site_id` AND `site_policy`.`policy_type` = 'reservation' AND `site_policy`.`scope_type` = 'site')),
	`deposit_trigger_party_size` = COALESCE(`location_policy`.`deposit_trigger_party_size`, (SELECT `site_policy`.`deposit_trigger_party_size` FROM `__booking_policies_0110_backup` AS `site_policy` WHERE `site_policy`.`site_id` = `location_policy`.`site_id` AND `site_policy`.`policy_type` = 'reservation' AND `site_policy`.`scope_type` = 'site')),
	`special_requests_allowed` = COALESCE(`location_policy`.`special_requests_allowed`, (SELECT `site_policy`.`special_requests_allowed` FROM `__booking_policies_0110_backup` AS `site_policy` WHERE `site_policy`.`site_id` = `location_policy`.`site_id` AND `site_policy`.`policy_type` = 'reservation' AND `site_policy`.`scope_type` = 'site')),
	`minimum_guest_age` = COALESCE(`location_policy`.`minimum_guest_age`, (SELECT `site_policy`.`minimum_guest_age` FROM `__booking_policies_0110_backup` AS `site_policy` WHERE `site_policy`.`site_id` = `location_policy`.`site_id` AND `site_policy`.`policy_type` = 'reservation' AND `site_policy`.`scope_type` = 'site')),
	`accessibility_contact_required` = COALESCE(`location_policy`.`accessibility_contact_required`, (SELECT `site_policy`.`accessibility_contact_required` FROM `__booking_policies_0110_backup` AS `site_policy` WHERE `site_policy`.`site_id` = `location_policy`.`site_id` AND `site_policy`.`policy_type` = 'reservation' AND `site_policy`.`scope_type` = 'site')),
	`additional_notes_html` = COALESCE(`location_policy`.`additional_notes_html`, (SELECT `site_policy`.`additional_notes_html` FROM `__booking_policies_0110_backup` AS `site_policy` WHERE `site_policy`.`site_id` = `location_policy`.`site_id` AND `site_policy`.`policy_type` = 'reservation' AND `site_policy`.`scope_type` = 'site'))
WHERE `location_policy`.`policy_type` = 'reservation'
	AND `location_policy`.`scope_type` = 'location'
	AND EXISTS (
		SELECT 1 FROM `__booking_policies_0110_backup` AS `site_policy`
		WHERE `site_policy`.`site_id` = `location_policy`.`site_id`
			AND `site_policy`.`policy_type` = 'reservation'
			AND `site_policy`.`scope_type` = 'site'
	);--> statement-breakpoint

INSERT INTO `booking_policies` (
	`id`, `organization_id`, `site_id`, `policy_type`, `scope_type`, `location_id`, `experience_id`,
	`booking_window_days`, `advance_notice_minutes`, `free_cancellation_until_minutes`,
	`late_arrival_grace_minutes`, `host_confirmation_sla_minutes`, `reschedule_allowed`,
	`reschedule_cutoff_minutes`, `deposit_required`, `deposit_trigger_party_size`,
	`special_requests_allowed`, `weather_policy`, `minimum_guest_age`,
	`accessibility_contact_required`, `additional_notes_html`, `created_at`, `updated_at`
)
SELECT
	'policy-' || lower(hex(randomblob(16))), `site_policy`.`organization_id`, `site_policy`.`site_id`,
	'reservation', 'location', `location`.`id`, NULL,
	`site_policy`.`booking_window_days`, `site_policy`.`advance_notice_minutes`, `site_policy`.`free_cancellation_until_minutes`,
	`site_policy`.`late_arrival_grace_minutes`, `site_policy`.`host_confirmation_sla_minutes`, `site_policy`.`reschedule_allowed`,
	`site_policy`.`reschedule_cutoff_minutes`, `site_policy`.`deposit_required`, `site_policy`.`deposit_trigger_party_size`,
	`site_policy`.`special_requests_allowed`, NULL, `site_policy`.`minimum_guest_age`,
	`site_policy`.`accessibility_contact_required`, `site_policy`.`additional_notes_html`, `site_policy`.`created_at`, `site_policy`.`updated_at`
FROM `__booking_policies_0110_backup` AS `site_policy`
JOIN `business_locations` AS `location` ON `location`.`site_id` = `site_policy`.`site_id`
WHERE `site_policy`.`policy_type` = 'reservation'
	AND `site_policy`.`scope_type` = 'site'
	AND NOT EXISTS (
		SELECT 1 FROM `booking_policies` AS `existing`
		WHERE `existing`.`policy_type` = 'reservation'
			AND `existing`.`scope_type` = 'location'
			AND `existing`.`location_id` = `location`.`id`
	);--> statement-breakpoint

DELETE FROM `booking_policies`
WHERE `policy_type` = 'reservation' AND `scope_type` = 'site';--> statement-breakpoint

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
	CONSTRAINT "booking_policies_scope_type_check" CHECK(scope_type IN ('site', 'location', 'experience')),
	CONSTRAINT "booking_policies_reservation_location_scope_check" CHECK(policy_type != 'reservation' OR (scope_type = 'location' AND location_id IS NOT NULL AND experience_id IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_booking_policies`("id", "organization_id", "site_id", "policy_type", "scope_type", "location_id", "experience_id", "booking_window_days", "advance_notice_minutes", "free_cancellation_until_minutes", "late_arrival_grace_minutes", "host_confirmation_sla_minutes", "reschedule_allowed", "reschedule_cutoff_minutes", "deposit_required", "deposit_trigger_party_size", "special_requests_allowed", "weather_policy", "minimum_guest_age", "accessibility_contact_required", "additional_notes_html", "created_at", "updated_at") SELECT "id", "organization_id", "site_id", "policy_type", "scope_type", "location_id", "experience_id", "booking_window_days", "advance_notice_minutes", "free_cancellation_until_minutes", "late_arrival_grace_minutes", "host_confirmation_sla_minutes", "reschedule_allowed", "reschedule_cutoff_minutes", "deposit_required", "deposit_trigger_party_size", "special_requests_allowed", "weather_policy", "minimum_guest_age", "accessibility_contact_required", "additional_notes_html", "created_at", "updated_at" FROM `booking_policies`;--> statement-breakpoint
DROP TABLE `booking_policies`;--> statement-breakpoint
ALTER TABLE `__new_booking_policies` RENAME TO `booking_policies`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `booking_policies_site_type_idx` ON `booking_policies` (`site_id`,`policy_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_policies_reservation_location_unique` ON `booking_policies` (`location_id`) WHERE policy_type = 'reservation' AND scope_type = 'location' AND location_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `booking_policies_experience_site_unique` ON `booking_policies` (`site_id`) WHERE policy_type = 'experience' AND scope_type = 'site';--> statement-breakpoint
CREATE UNIQUE INDEX `booking_policies_experience_location_unique` ON `booking_policies` (`location_id`) WHERE policy_type = 'experience' AND scope_type = 'location' AND location_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `booking_policies_experience_scope_unique` ON `booking_policies` (`experience_id`) WHERE policy_type = 'experience' AND scope_type = 'experience' AND experience_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `booking_policies_organization_id_idx` ON `booking_policies` (`organization_id`);--> statement-breakpoint

CREATE TABLE `__booking_policies_0110_assertions` (
	`violation` text NOT NULL CHECK (`violation` = '')
);--> statement-breakpoint
INSERT INTO `__booking_policies_0110_assertions` (`violation`)
SELECT 'reservation policy remained outside location scope'
WHERE EXISTS (
	SELECT 1 FROM `booking_policies`
	WHERE `policy_type` = 'reservation'
		AND (`scope_type` != 'location' OR `location_id` IS NULL OR `experience_id` IS NOT NULL)
);--> statement-breakpoint
INSERT INTO `__booking_policies_0110_assertions` (`violation`)
SELECT 'experience booking policy was not preserved'
WHERE (SELECT COUNT(*) FROM `__booking_policies_0110_backup` WHERE `policy_type` = 'experience')
	!= (SELECT COUNT(*) FROM `booking_policies` WHERE `policy_type` = 'experience');--> statement-breakpoint
INSERT INTO `__booking_policies_0110_assertions` (`violation`)
SELECT 'site reservation policy was not materialized for every location'
WHERE EXISTS (
	SELECT 1
	FROM `__booking_policies_0110_backup` AS `site_policy`
	JOIN `business_locations` AS `location` ON `location`.`site_id` = `site_policy`.`site_id`
	WHERE `site_policy`.`policy_type` = 'reservation'
		AND `site_policy`.`scope_type` = 'site'
		AND NOT EXISTS (
			SELECT 1 FROM `booking_policies` AS `materialized`
			WHERE `materialized`.`policy_type` = 'reservation'
				AND `materialized`.`scope_type` = 'location'
				AND `materialized`.`location_id` = `location`.`id`
		)
);--> statement-breakpoint
DROP TABLE `__booking_policies_0110_assertions`;--> statement-breakpoint
DROP TABLE `__booking_policies_0110_backup`;
