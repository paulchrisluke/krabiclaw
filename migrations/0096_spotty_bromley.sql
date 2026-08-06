ALTER TABLE `tenant_page_variants` ADD `ever_published` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE tenant_page_variants
SET ever_published = CASE WHEN status IN ('published', 'archived') OR published_revision_id IS NOT NULL THEN 1 ELSE 0 END;
