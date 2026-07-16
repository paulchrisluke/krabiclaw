CREATE TABLE `blog_post_redirects` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`site_id` text,
	`old_slug` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `blog_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blog_post_redirects_platform_slug_idx` ON `blog_post_redirects` (`old_slug`) WHERE site_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `blog_post_redirects_site_slug_idx` ON `blog_post_redirects` (`site_id`,`old_slug`) WHERE site_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `blog_post_redirects_post_idx` ON `blog_post_redirects` (`post_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_content_blocks` (
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
	CONSTRAINT "content_blocks_type_check" CHECK(type IN ('heading', 'markdown', 'image', 'gallery', 'faq', 'how_to', 'divider', 'ai_assistance', 'cta', 'callout'))
);
--> statement-breakpoint
INSERT INTO `__new_content_blocks`("id", "document_id", "parent_block_id", "type", "position", "level", "data_json", "created_at", "updated_at") SELECT "id", "document_id", "parent_block_id", "type", "position", "level", "data_json", "created_at", "updated_at" FROM `content_blocks`;--> statement-breakpoint
DROP TABLE `content_blocks`;--> statement-breakpoint
ALTER TABLE `__new_content_blocks` RENAME TO `content_blocks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `content_blocks_document_position_idx` ON `content_blocks` (`document_id`,`position`);--> statement-breakpoint
CREATE INDEX `content_blocks_parent_idx` ON `content_blocks` (`parent_block_id`);--> statement-breakpoint
CREATE TABLE `__new_blog_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`site_id` text,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`body` text NOT NULL,
	`excerpt` text,
	`category` text,
	`tags_json` text,
	`nav_section` text,
	`nav_title` text,
	`nav_order` integer,
	`nav_section_order` integer,
	`hide_from_nav` integer DEFAULT 0 NOT NULL,
	`featured_order` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`author_id` text,
	`featured_image_asset_id` text,
	`social_image_asset_id` text,
	`published_at` text,
	`first_published_at` text,
	`scheduled_for` text,
	`scheduled_revision_id` text,
	`slug_manually_overridden` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`seo_title` text,
	`seo_description` text,
	`seo_keywords` text,
	`canonical_url` text,
	`robots` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`featured_image_asset_id`) REFERENCES `media_assets_old`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`social_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "blog_posts_scope_check" CHECK((organization_id IS NULL AND site_id IS NULL) OR (organization_id IS NOT NULL AND site_id IS NOT NULL)),
	CONSTRAINT "blog_posts_status_check" CHECK(status IN ('draft', 'published', 'scheduled', 'archived')),
	CONSTRAINT "blog_posts_visibility_check" CHECK(visibility IN ('public', 'unlisted')),
	CONSTRAINT "blog_posts_category_check" CHECK(site_id IS NOT NULL OR category IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_blog_posts`("id", "organization_id", "site_id", "title", "slug", "body", "excerpt", "category", "tags_json", "nav_section", "nav_title", "nav_order", "nav_section_order", "hide_from_nav", "featured_order", "status", "visibility", "author_id", "featured_image_asset_id", "social_image_asset_id", "published_at", "first_published_at", "scheduled_for", "scheduled_revision_id", "slug_manually_overridden", "created_at", "updated_at", "seo_title", "seo_description", "seo_keywords", "canonical_url", "robots") SELECT "id", "organization_id", "site_id", "title", "slug", "body", "excerpt", "category", "tags_json", "nav_section", "nav_title", "nav_order", "nav_section_order", "hide_from_nav", "featured_order", "status", 'public', "author_id", "featured_image_asset_id", NULL, "published_at", "published_at", "scheduled_for", NULL, 0, "created_at", "updated_at", "seo_title", "seo_description", "seo_keywords", "canonical_url", "robots" FROM `blog_posts`;--> statement-breakpoint
DROP TABLE `blog_posts`;--> statement-breakpoint
ALTER TABLE `__new_blog_posts` RENAME TO `blog_posts`;--> statement-breakpoint
CREATE UNIQUE INDEX `blog_posts_platform_slug_idx` ON `blog_posts` (`slug`) WHERE site_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `blog_posts_site_slug_idx` ON `blog_posts` (`site_id`,`slug`) WHERE site_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `blog_posts_org_site_idx` ON `blog_posts` (`organization_id`,`site_id`);
