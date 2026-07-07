CREATE TABLE `guest_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`submission_type` text NOT NULL,
	`submission_id` text NOT NULL,
	`guest_name` text NOT NULL,
	`guest_email` text,
	`guest_phone` text,
	`inbox_status` text DEFAULT 'open' NOT NULL,
	`unread_count` integer DEFAULT 0 NOT NULL,
	`last_message_at` text,
	`last_inbound_at` text,
	`last_outbound_at` text,
	`last_message_preview` text,
	`owner_last_seen_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "guest_threads_submission_type_check" CHECK(submission_type IN ('contact', 'reservation', 'experience_booking')),
	CONSTRAINT "guest_threads_inbox_status_check" CHECK(inbox_status IN ('open', 'waiting_on_owner', 'waiting_on_guest', 'closed'))
);
--> statement-breakpoint
CREATE INDEX `guest_threads_site_updated_idx` ON `guest_threads` (`site_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `guest_threads_location_updated_idx` ON `guest_threads` (`location_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `guest_threads_inbox_status_idx` ON `guest_threads` (`site_id`,`inbox_status`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `guest_threads_submission_unique` ON `guest_threads` (`submission_type`,`submission_id`);--> statement-breakpoint
ALTER TABLE `submission_messages` ADD `thread_id` text REFERENCES guest_threads(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `submission_messages_thread_created_idx` ON `submission_messages` (`thread_id`,`created_at`);--> statement-breakpoint

INSERT INTO `guest_threads` (
	`id`, `organization_id`, `site_id`, `location_id`, `submission_type`, `submission_id`,
	`guest_name`, `guest_email`, `guest_phone`, `inbox_status`, `unread_count`,
	`last_message_at`, `last_message_preview`, `created_at`, `updated_at`
)
SELECT
	lower(hex(randomblob(16))),
	cs.organization_id,
	cs.site_id,
	NULL,
	'contact',
	cs.id,
	cs.name,
	cs.email,
	NULL,
	CASE
		WHEN EXISTS (
			SELECT 1 FROM submission_messages sm
			WHERE sm.submission_type = 'contact' AND sm.submission_id = cs.id AND sm.direction = 'out'
			ORDER BY sm.created_at DESC LIMIT 1
		) THEN 'waiting_on_guest'
		ELSE 'open'
	END,
	0,
	COALESCE((
		SELECT sm.created_at FROM submission_messages sm
		WHERE sm.submission_type = 'contact' AND sm.submission_id = cs.id
		ORDER BY sm.created_at DESC LIMIT 1
	), cs.created_at),
	COALESCE((
		SELECT substr(replace(replace(sm.body, char(10), ' '), char(13), ' '), 1, 160) FROM submission_messages sm
		WHERE sm.submission_type = 'contact' AND sm.submission_id = cs.id
		ORDER BY sm.created_at DESC LIMIT 1
	), substr(replace(replace(cs.message, char(10), ' '), char(13), ' '), 1, 160)),
	cs.created_at,
	COALESCE((
		SELECT sm.created_at FROM submission_messages sm
		WHERE sm.submission_type = 'contact' AND sm.submission_id = cs.id
		ORDER BY sm.created_at DESC LIMIT 1
	), cs.created_at)
FROM contact_submissions cs;--> statement-breakpoint

INSERT INTO `guest_threads` (
	`id`, `organization_id`, `site_id`, `location_id`, `submission_type`, `submission_id`,
	`guest_name`, `guest_email`, `guest_phone`, `inbox_status`, `unread_count`,
	`last_message_at`, `last_message_preview`, `created_at`, `updated_at`
)
SELECT
	lower(hex(randomblob(16))),
	rs.organization_id,
	rs.site_id,
	rs.location_id,
	'reservation',
	rs.id,
	rs.name,
	rs.email,
	rs.phone,
	CASE
		WHEN (
			SELECT sm.direction FROM submission_messages sm
			WHERE sm.submission_type = 'reservation' AND sm.submission_id = rs.id
			ORDER BY sm.created_at DESC LIMIT 1
		) = 'in' THEN 'waiting_on_owner'
		WHEN (
			SELECT sm.direction FROM submission_messages sm
			WHERE sm.submission_type = 'reservation' AND sm.submission_id = rs.id
			ORDER BY sm.created_at DESC LIMIT 1
		) = 'out' THEN 'waiting_on_guest'
		ELSE 'open'
	END,
	0,
	COALESCE((
		SELECT sm.created_at FROM submission_messages sm
		WHERE sm.submission_type = 'reservation' AND sm.submission_id = rs.id
		ORDER BY sm.created_at DESC LIMIT 1
	), rs.created_at),
	COALESCE((
		SELECT substr(replace(replace(sm.body, char(10), ' '), char(13), ' '), 1, 160) FROM submission_messages sm
		WHERE sm.submission_type = 'reservation' AND sm.submission_id = rs.id
		ORDER BY sm.created_at DESC LIMIT 1
	), substr(trim(rs.date || ' ' || rs.time || ' · ' || rs.guests || ' guests' || CASE WHEN rs.requests IS NOT NULL AND rs.requests != '' THEN ' · ' || rs.requests ELSE '' END), 1, 160)),
	rs.created_at,
	COALESCE((
		SELECT sm.created_at FROM submission_messages sm
		WHERE sm.submission_type = 'reservation' AND sm.submission_id = rs.id
		ORDER BY sm.created_at DESC LIMIT 1
	), rs.created_at)
FROM reservation_submissions rs;--> statement-breakpoint

INSERT INTO `guest_threads` (
	`id`, `organization_id`, `site_id`, `location_id`, `submission_type`, `submission_id`,
	`guest_name`, `guest_email`, `guest_phone`, `inbox_status`, `unread_count`,
	`last_message_at`, `last_message_preview`, `created_at`, `updated_at`
)
SELECT
	lower(hex(randomblob(16))),
	eb.organization_id,
	eb.site_id,
	eb.location_id,
	'experience_booking',
	eb.id,
	eb.guest_name,
	eb.guest_email,
	eb.guest_phone,
	CASE
		WHEN (
			SELECT sm.direction FROM submission_messages sm
			WHERE sm.submission_type = 'experience_booking' AND sm.submission_id = eb.id
			ORDER BY sm.created_at DESC LIMIT 1
		) = 'in' THEN 'waiting_on_owner'
		WHEN (
			SELECT sm.direction FROM submission_messages sm
			WHERE sm.submission_type = 'experience_booking' AND sm.submission_id = eb.id
			ORDER BY sm.created_at DESC LIMIT 1
		) = 'out' THEN 'waiting_on_guest'
		ELSE 'open'
	END,
	0,
	COALESCE((
		SELECT sm.created_at FROM submission_messages sm
		WHERE sm.submission_type = 'experience_booking' AND sm.submission_id = eb.id
		ORDER BY sm.created_at DESC LIMIT 1
	), eb.created_at),
	COALESCE((
		SELECT substr(replace(replace(sm.body, char(10), ' '), char(13), ' '), 1, 160) FROM submission_messages sm
		WHERE sm.submission_type = 'experience_booking' AND sm.submission_id = eb.id
		ORDER BY sm.created_at DESC LIMIT 1
	), substr(trim(COALESCE(e.title, 'Experience') || ' · ' || eb.booking_date || ' ' || eb.time_slot || ' · ' || eb.party_size || ' guests' || CASE WHEN eb.notes IS NOT NULL AND eb.notes != '' THEN ' · ' || eb.notes ELSE '' END), 1, 160)),
	eb.created_at,
	COALESCE((
		SELECT sm.created_at FROM submission_messages sm
		WHERE sm.submission_type = 'experience_booking' AND sm.submission_id = eb.id
		ORDER BY sm.created_at DESC LIMIT 1
	), eb.created_at)
FROM experience_bookings eb
LEFT JOIN experiences e ON e.id = eb.experience_id;--> statement-breakpoint

UPDATE submission_messages
SET thread_id = (
	SELECT gt.id
	FROM guest_threads gt
	WHERE gt.submission_type = submission_messages.submission_type
	  AND gt.submission_id = submission_messages.submission_id
	LIMIT 1
)
WHERE thread_id IS NULL;--> statement-breakpoint

UPDATE guest_threads
SET
	last_inbound_at = (
		SELECT sm.created_at FROM submission_messages sm
		WHERE sm.thread_id = guest_threads.id AND sm.direction = 'in'
		ORDER BY sm.created_at DESC LIMIT 1
	),
	last_outbound_at = (
		SELECT sm.created_at FROM submission_messages sm
		WHERE sm.thread_id = guest_threads.id AND sm.direction = 'out'
		ORDER BY sm.created_at DESC LIMIT 1
	),
	unread_count = CASE
		WHEN (
			SELECT sm.direction FROM submission_messages sm
			WHERE sm.thread_id = guest_threads.id
			ORDER BY sm.created_at DESC LIMIT 1
		) = 'in' THEN 1
		ELSE 0
	END,
	inbox_status = CASE
		WHEN (
			SELECT sm.direction FROM submission_messages sm
			WHERE sm.thread_id = guest_threads.id
			ORDER BY sm.created_at DESC LIMIT 1
		) = 'in' THEN 'waiting_on_owner'
		WHEN (
			SELECT sm.direction FROM submission_messages sm
			WHERE sm.thread_id = guest_threads.id
			ORDER BY sm.created_at DESC LIMIT 1
		) = 'out' THEN 'waiting_on_guest'
		ELSE guest_threads.inbox_status
	END;
