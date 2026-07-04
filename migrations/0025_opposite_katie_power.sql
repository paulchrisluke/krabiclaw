CREATE TABLE `booking_policies` (
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
	`reschedule_allowed` numeric DEFAULT false NOT NULL,
	`reschedule_cutoff_minutes` integer,
	`deposit_required` numeric DEFAULT false NOT NULL,
	`deposit_trigger_party_size` integer,
	`special_requests_allowed` numeric DEFAULT true NOT NULL,
	`weather_policy` text,
	`minimum_guest_age` integer,
	`accessibility_contact_required` numeric DEFAULT false NOT NULL,
	`additional_notes_html` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`experience_id`) REFERENCES `experiences`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `booking_policies_site_type_idx` ON `booking_policies` (`site_id`,`policy_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_policies_reservation_site_unique` ON `booking_policies` (`site_id`) WHERE policy_type = 'reservation' AND scope_type = 'site';--> statement-breakpoint
CREATE UNIQUE INDEX `booking_policies_reservation_location_unique` ON `booking_policies` (`location_id`) WHERE policy_type = 'reservation' AND scope_type = 'location' AND location_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `booking_policies_experience_site_unique` ON `booking_policies` (`site_id`) WHERE policy_type = 'experience' AND scope_type = 'site';--> statement-breakpoint
CREATE UNIQUE INDEX `booking_policies_experience_location_unique` ON `booking_policies` (`location_id`) WHERE policy_type = 'experience' AND scope_type = 'location' AND location_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `booking_policies_experience_scope_unique` ON `booking_policies` (`experience_id`) WHERE policy_type = 'experience' AND scope_type = 'experience' AND experience_id IS NOT NULL;
--> statement-breakpoint
INSERT INTO `booking_policies` (
	`id`, `organization_id`, `site_id`, `policy_type`, `scope_type`, `location_id`, `experience_id`,
	`booking_window_days`, `advance_notice_minutes`, `free_cancellation_until_minutes`,
	`late_arrival_grace_minutes`, `host_confirmation_sla_minutes`, `reschedule_allowed`,
	`reschedule_cutoff_minutes`, `deposit_required`, `deposit_trigger_party_size`,
	`special_requests_allowed`, `weather_policy`, `minimum_guest_age`,
	`accessibility_contact_required`, `additional_notes_html`, `created_at`, `updated_at`
)
SELECT
	lower(hex(randomblob(16))),
	s.organization_id,
	s.id,
	'reservation',
	'site',
	NULL,
	NULL,
	NULL,
	NULL,
	CASE
		WHEN lower(coalesce(sc.content, '')) LIKE '%48 hour%' THEN 2880
		WHEN lower(coalesce(sc.content, '')) LIKE '%24 hour%' THEN 1440
		WHEN lower(coalesce(sc.content, '')) LIKE '%2 hour%' THEN 120
		ELSE 120
	END,
	CASE
		WHEN lower(coalesce(sc.content, '')) LIKE '%20 minute%' THEN 20
		WHEN lower(coalesce(sc.content, '')) LIKE '%10 minute%' THEN 10
		ELSE 15
	END,
	60,
	1,
	CASE
		WHEN lower(coalesce(sc.content, '')) LIKE '%48 hour%' THEN 2880
		WHEN lower(coalesce(sc.content, '')) LIKE '%24 hour%' THEN 1440
		WHEN lower(coalesce(sc.content, '')) LIKE '%2 hour%' THEN 120
		ELSE 120
	END,
	CASE WHEN lower(coalesce(sc.content, '')) LIKE '%deposit%' THEN 1 ELSE 0 END,
	CASE
		WHEN lower(coalesce(sc.content, '')) LIKE '%8+%' THEN 8
		WHEN lower(coalesce(sc.content, '')) LIKE '%7+%' THEN 7
		WHEN lower(coalesce(sc.content, '')) LIKE '%6+%' THEN 6
		ELSE CASE WHEN lower(coalesce(sc.content, '')) LIKE '%deposit%' THEN 6 ELSE NULL END
	END,
	CASE
		WHEN lower(coalesce(sc.content, '')) LIKE '%no dietary%' THEN 0
		ELSE 1
	END,
	NULL,
	NULL,
	0,
	CASE
		WHEN trim(coalesce(sc.content, '')) = '' THEN NULL
		ELSE '<p>' || replace(replace(replace(replace(replace(trim(sc.content), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), char(13), ''), char(10), '<br>') || '</p>'
	END,
	coalesce(sc.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	coalesce(sc.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
FROM `sites` s
LEFT JOIN `site_content` sc
	ON sc.site_id = s.id
	AND sc.organization_id = s.organization_id
	AND sc.page = 'reservations'
	AND sc.field = 'policies.body'
	AND sc.location_id IS NULL;
--> statement-breakpoint
INSERT INTO `booking_policies` (
	`id`, `organization_id`, `site_id`, `policy_type`, `scope_type`, `location_id`, `experience_id`,
	`booking_window_days`, `advance_notice_minutes`, `free_cancellation_until_minutes`,
	`late_arrival_grace_minutes`, `host_confirmation_sla_minutes`, `reschedule_allowed`,
	`reschedule_cutoff_minutes`, `deposit_required`, `deposit_trigger_party_size`,
	`special_requests_allowed`, `weather_policy`, `minimum_guest_age`,
	`accessibility_contact_required`, `additional_notes_html`, `created_at`, `updated_at`
)
SELECT
	lower(hex(randomblob(16))),
	e.organization_id,
	e.site_id,
	'experience',
	'experience',
	e.location_id,
	e.id,
	NULL,
	NULL,
	CASE
		WHEN lower(e.cancellation_policy) LIKE '%48 hour%' THEN 2880
		WHEN lower(e.cancellation_policy) LIKE '%24 hour%' THEN 1440
		WHEN lower(e.cancellation_policy) LIKE '%2 hour%' THEN 120
		ELSE NULL
	END,
	15,
	60,
	1,
	CASE
		WHEN lower(e.cancellation_policy) LIKE '%48 hour%' THEN 2880
		WHEN lower(e.cancellation_policy) LIKE '%24 hour%' THEN 1440
		WHEN lower(e.cancellation_policy) LIKE '%2 hour%' THEN 120
		ELSE NULL
	END,
	0,
	NULL,
	1,
	NULL,
	NULL,
	0,
	'<p>' || replace(replace(replace(replace(replace(trim(e.cancellation_policy), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), char(13), ''), char(10), '<br>') || '</p>',
	coalesce(e.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	coalesce(e.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
FROM `experiences` e
WHERE trim(coalesce(e.cancellation_policy, '')) <> '';
