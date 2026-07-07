CREATE TABLE IF NOT EXISTS `content_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`parent_block_id` text,
	`type` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`level` integer,
	`data_json` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `content_documents`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_blocks_type_check" CHECK(type IN ('heading', 'markdown', 'image', 'gallery', 'faq', 'how_to', 'ai_assistance', 'cta', 'callout'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `content_blocks_document_position_idx` ON `content_blocks` (`document_id`,`position`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `content_blocks_parent_idx` ON `content_blocks` (`parent_block_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `content_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`draft_revision_id` text,
	`published_revision_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "content_documents_owner_type_check" CHECK(owner_type IN ('platform_blog', 'platform_doc', 'tenant_blog'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `content_documents_owner_idx` ON `content_documents` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `content_documents_owner_unique` ON `content_documents` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `content_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`body_markdown` text NOT NULL,
	`created_by` text,
	`label` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `content_documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `content_revisions_document_created_idx` ON `content_revisions` (`document_id`,`created_at`);
