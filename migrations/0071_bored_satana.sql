CREATE TABLE `experience_media` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`experience_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`experience_id`) REFERENCES `experiences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `experience_media_experience_order_idx` ON `experience_media` (`experience_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `experience_media_site_experience_idx` ON `experience_media` (`site_id`,`experience_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `experience_media_experience_asset_unique` ON `experience_media` (`experience_id`,`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `experience_media_experience_sort_unique` ON `experience_media` (`experience_id`,`sort_order`);--> statement-breakpoint
INSERT INTO experience_media (
	id, organization_id, site_id, experience_id, asset_id, sort_order, created_at, updated_at
)
WITH candidate_media AS (
	SELECT
		e.organization_id,
		e.site_id,
		e.id AS experience_id,
		e.image_asset_id AS asset_id,
		0 AS original_order,
		e.created_at,
		e.updated_at
	FROM experiences e
	JOIN media_assets ma ON ma.id = e.image_asset_id AND ma.site_id = e.site_id AND ma.status = 'active'
	WHERE e.image_asset_id IS NOT NULL

	UNION ALL

	SELECT
		e.organization_id,
		e.site_id,
		e.id AS experience_id,
		e.video_asset_id AS asset_id,
		1 AS original_order,
		e.created_at,
		e.updated_at
	FROM experiences e
	JOIN media_assets ma ON ma.id = e.video_asset_id AND ma.site_id = e.site_id AND ma.status = 'active'
	WHERE e.video_asset_id IS NOT NULL

	UNION ALL

	SELECT
		e.organization_id,
		e.site_id,
		e.id AS experience_id,
		ma.id AS asset_id,
		2 + CAST(gallery.key AS integer) AS original_order,
		e.created_at,
		e.updated_at
	FROM experiences e
	JOIN json_each(e.images) gallery ON json_valid(e.images)
	JOIN media_assets ma ON ma.site_id = e.site_id AND ma.status = 'active' AND ma.kind IN ('image', 'video') AND ma.public_url = json_extract(gallery.value, '$.url')
	WHERE e.images IS NOT NULL
),
deduped_media AS (
	SELECT
		organization_id,
		site_id,
		experience_id,
		asset_id,
		MIN(original_order) AS original_order,
		MIN(created_at) AS created_at,
		MAX(updated_at) AS updated_at
	FROM candidate_media
	GROUP BY organization_id, site_id, experience_id, asset_id
),
ordered_media AS (
	SELECT
		organization_id,
		site_id,
		experience_id,
		asset_id,
		ROW_NUMBER() OVER (PARTITION BY experience_id ORDER BY original_order ASC, asset_id ASC) - 1 AS sort_order,
		created_at,
		updated_at
	FROM deduped_media
)
SELECT
	'experience-media-' || experience_id || '-' || asset_id,
	organization_id,
	site_id,
	experience_id,
	asset_id,
	sort_order,
	created_at,
	updated_at
FROM ordered_media;
