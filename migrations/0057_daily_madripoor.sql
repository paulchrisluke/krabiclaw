DELETE FROM `post_channel_jobs`
WHERE `id` IN (
	SELECT `id`
	FROM (
		SELECT
			`id`,
			ROW_NUMBER() OVER (
				PARTITION BY `post_id`, `channel`
				ORDER BY
					CASE `status`
						WHEN 'published' THEN 0
						WHEN 'pending' THEN 1
						WHEN 'skipped' THEN 2
						WHEN 'failed' THEN 3
						ELSE 4
					END,
					COALESCE(`published_at`, `created_at`) DESC,
					`id`
			) AS `duplicate_number`
		FROM `post_channel_jobs`
	)
	WHERE `duplicate_number` > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX `post_channel_jobs_post_channel_unique` ON `post_channel_jobs` (`post_id`,`channel`);
