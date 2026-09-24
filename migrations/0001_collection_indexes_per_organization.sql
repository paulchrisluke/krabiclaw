DROP INDEX `collections_org_slug_unique`;--> statement-breakpoint
DROP INDEX `collections_org_sort_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `collections_org_slug_unique` ON `collections` (`organization_id`,`slug`) WHERE location_id IS NULL;--> statement-breakpoint
CREATE INDEX `collections_org_sort_idx` ON `collections` (`organization_id`,`location_id`,`sort_order`);