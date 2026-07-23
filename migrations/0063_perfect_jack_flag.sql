ALTER TABLE `contact_submissions` ADD `location_id` text REFERENCES business_locations(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `contact_submissions_location_idx` ON `contact_submissions` (`location_id`,`created_at`);--> statement-breakpoint
UPDATE contact_submissions
SET location_id = (
	SELECT experiences.location_id
	FROM experiences
	WHERE experiences.id = contact_submissions.experience_id
		AND experiences.site_id = contact_submissions.site_id
)
WHERE location_id IS NULL
	AND experience_id IS NOT NULL;--> statement-breakpoint
UPDATE guest_threads
SET location_id = (
	SELECT COALESCE(contact_submissions.location_id, experiences.location_id)
	FROM contact_submissions
	LEFT JOIN experiences
		ON experiences.id = contact_submissions.experience_id
		AND experiences.site_id = contact_submissions.site_id
	WHERE contact_submissions.id = guest_threads.submission_id
		AND contact_submissions.site_id = guest_threads.site_id
)
WHERE submission_type = 'contact'
	AND location_id IS NULL
	AND EXISTS (
		SELECT 1
		FROM contact_submissions
		LEFT JOIN experiences
			ON experiences.id = contact_submissions.experience_id
			AND experiences.site_id = contact_submissions.site_id
		WHERE contact_submissions.id = guest_threads.submission_id
			AND contact_submissions.site_id = guest_threads.site_id
			AND COALESCE(contact_submissions.location_id, experiences.location_id) IS NOT NULL
	);
