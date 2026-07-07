DROP INDEX `posts_site_slug_idx`;--> statement-breakpoint
WITH duplicate_post_slugs AS (
	SELECT id
	FROM (
		SELECT id, ROW_NUMBER() OVER (PARTITION BY site_id, slug ORDER BY created_at, id) AS slug_rank
		FROM posts
		WHERE slug IS NOT NULL
	)
	WHERE slug_rank > 1
)
UPDATE posts
SET slug = slug || '-' || substr(replace(id, '-', ''), 1, 12)
WHERE id IN (SELECT id FROM duplicate_post_slugs);--> statement-breakpoint
CREATE UNIQUE INDEX `posts_site_slug_idx` ON `posts` (`site_id`,`slug`);
