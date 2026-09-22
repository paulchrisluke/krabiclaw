-- Hand-written: drizzle-kit rebuilds the table for a new CHECK (CREATE
-- __new_media_assets, copy, DROP TABLE media_assets, RENAME), and on D1 that
-- DROP cascades — media_placements references media_assets, so every placement
-- would go with it. ADD/UPDATE/DROP/RENAME COLUMN are in place, and SQLite
-- accepts a named column constraint on ADD COLUMN. See
-- docs/operations/release-flow.md and migrations/0006.
--
-- Production and local both hold only these eight values and NULL (checked
-- 2026-09-22), so the copy cannot violate the constraint. A value from
-- anywhere else would fail the migration loudly, which is the point: the
-- vocabulary lived only in schema.ts's `$type` and the MCP tool's JSON schema,
-- so the column accepted any string a writer invented.
ALTER TABLE `media_assets` ADD COLUMN `category_next` text CONSTRAINT "media_assets_category_check" CHECK(`category_next` IS NULL OR `category_next` IN ('exterior', 'interior', 'food', 'menu', 'team', 'other', 'logo', 'blog'));--> statement-breakpoint
UPDATE `media_assets` SET `category_next` = `category`;--> statement-breakpoint
ALTER TABLE `media_assets` DROP COLUMN `category`;--> statement-breakpoint
ALTER TABLE `media_assets` RENAME COLUMN `category_next` TO `category`;
