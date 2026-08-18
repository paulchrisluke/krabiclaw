ALTER TABLE `onboarding_drafts` RENAME TO `onboarding_sessions`;--> statement-breakpoint
ALTER TABLE `tenant_navigation_items` RENAME TO `spent_subdomains`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_onboarding_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text,
	`name` text NOT NULL,
	`vertical` text NOT NULL,
	`subdomain_candidate` text,
	`source_type` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`payload_json` text NOT NULL,
	`committed_site_id` text,
	`committed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`committed_site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "onboarding_sessions_status_check" CHECK(status IN ('active', 'committing', 'committed', 'failed'))
);
--> statement-breakpoint
INSERT INTO `__new_onboarding_sessions`("id", "user_id", "organization_id", "name", "vertical", "subdomain_candidate", "source_type", "status", "payload_json", "committed_site_id", "committed_at", "created_at", "updated_at") SELECT "id", "user_id", "organization_id", "name", "vertical", "subdomain_candidate", "source_type", "status", "payload_json", "committed_site_id", "committed_at", "created_at", "updated_at" FROM `onboarding_sessions`;--> statement-breakpoint
DROP TABLE `onboarding_sessions`;--> statement-breakpoint
ALTER TABLE `__new_onboarding_sessions` RENAME TO `onboarding_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_onboarding_sessions_active_user_unique` ON `onboarding_sessions` (`user_id`) WHERE status = 'active';--> statement-breakpoint
CREATE INDEX `onboarding_sessions_user_id_idx` ON `onboarding_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_spent_subdomains` (
	`domain` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`successor_domain` text,
	`spent_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_spent_subdomains`("domain", "site_id", "successor_domain", "spent_at") SELECT "domain", "site_id", "successor_domain", "spent_at" FROM `spent_subdomains`;--> statement-breakpoint
DROP TABLE `spent_subdomains`;--> statement-breakpoint
ALTER TABLE `__new_spent_subdomains` RENAME TO `spent_subdomains`;--> statement-breakpoint
CREATE TABLE `__new_menus` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`name` text NOT NULL,
	`description` text,
	`is_visible` integer DEFAULT 1 NOT NULL,
	`section_order` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`seo_title` text,
	`seo_description` text,
	`canonical_url` text,
	`robots` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_menus`("id", "organization_id", "site_id", "location_id", "name", "description", "is_visible", "section_order", "created_at", "updated_at", "created_by", "updated_by", "seo_title", "seo_description", "canonical_url", "robots") SELECT "id", "organization_id", "site_id", "location_id", "name", "description", CASE WHEN status = 'draft' THEN 0 ELSE 1 END, "section_order", "created_at", "updated_at", "created_by", "updated_by", "seo_title", "seo_description", "canonical_url", "robots" FROM `menus`;--> statement-breakpoint
DROP TABLE `menus`;--> statement-breakpoint
ALTER TABLE `__new_menus` RENAME TO `menus`;--> statement-breakpoint
CREATE INDEX `menus_organization_id_site_id_idx` ON `menus` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE TABLE `__new_tenant_page_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`page_id` text NOT NULL,
	`locale` text NOT NULL,
	`document_id` text,
	`path` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`seo_title` text,
	`seo_description` text,
	`canonical_url` text,
	`robots` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `tenant_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `content_documents`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "tenant_page_variants_path_check" CHECK(path LIKE '/%' AND path NOT LIKE '//%')
);
--> statement-breakpoint
INSERT INTO `__new_tenant_page_variants`("id", "organization_id", "site_id", "page_id", "locale", "document_id", "path", "title", "summary", "seo_title", "seo_description", "canonical_url", "robots", "created_at", "updated_at", "updated_by") SELECT "id", "organization_id", "site_id", "page_id", "locale", "draft_document_id", "published_path", "title", "summary", "seo_title", "seo_description", "canonical_url", "robots", "created_at", "updated_at", "updated_by" FROM `tenant_page_variants`;--> statement-breakpoint
DROP TABLE `tenant_page_variants`;--> statement-breakpoint
ALTER TABLE `__new_tenant_page_variants` RENAME TO `tenant_page_variants`;--> statement-breakpoint
CREATE INDEX `tenant_page_variants_site_path_idx` ON `tenant_page_variants` (`site_id`,`path`);--> statement-breakpoint
CREATE INDEX `tenant_page_variants_page_idx` ON `tenant_page_variants` (`page_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_page_variants_page_locale_unique` ON `tenant_page_variants` (`page_id`,`locale`);--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_page_variants_site_locale_path_unique` ON `tenant_page_variants` (`site_id`,`locale`,`path`);--> statement-breakpoint
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
	`visibility` text DEFAULT 'public' NOT NULL,
	`author_id` text,
	`site_author_id` text,
	`featured_image_asset_id` text,
	`social_image_asset_id` text,
	`published_at` text,
	`first_published_at` text,
	`scheduled_for` text,
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
	FOREIGN KEY (`site_author_id`) REFERENCES `site_authors`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`featured_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`social_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "blog_posts_scope_check" CHECK((organization_id IS NULL AND site_id IS NULL) OR (organization_id IS NOT NULL AND site_id IS NOT NULL)),
	CONSTRAINT "blog_posts_visibility_check" CHECK(visibility IN ('public', 'unlisted')),
	CONSTRAINT "blog_posts_category_check" CHECK(site_id IS NOT NULL OR category IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_blog_posts`("id", "organization_id", "site_id", "title", "slug", "body", "excerpt", "category", "tags_json", "nav_section", "nav_title", "nav_order", "nav_section_order", "hide_from_nav", "featured_order", "visibility", "author_id", "site_author_id", "featured_image_asset_id", "social_image_asset_id", "published_at", "first_published_at", "scheduled_for", "slug_manually_overridden", "created_at", "updated_at", "seo_title", "seo_description", "seo_keywords", "canonical_url", "robots") SELECT "id", "organization_id", "site_id", "title", "slug", "body", "excerpt", "category", "tags_json", "nav_section", "nav_title", "nav_order", "nav_section_order", "hide_from_nav", "featured_order", "visibility", "author_id", "site_author_id", "featured_image_asset_id", "social_image_asset_id", "published_at", "first_published_at", "scheduled_for", "slug_manually_overridden", "created_at", "updated_at", "seo_title", "seo_description", "seo_keywords", "canonical_url", "robots" FROM `blog_posts`;--> statement-breakpoint
DROP TABLE `blog_posts`;--> statement-breakpoint
ALTER TABLE `__new_blog_posts` RENAME TO `blog_posts`;--> statement-breakpoint
CREATE UNIQUE INDEX `blog_posts_platform_slug_idx` ON `blog_posts` (`slug`) WHERE site_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `blog_posts_site_slug_idx` ON `blog_posts` (`site_id`,`slug`) WHERE site_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `blog_posts_org_site_idx` ON `blog_posts` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE TABLE `__new_offerings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`label` text,
	`summary` text,
	`short_description` text,
	`body` text,
	`features` text,
	`faqs` text,
	`cta_label` text,
	`cta_url` text,
	`thumbnail_asset_id` text,
	`hero_image_asset_id` text,
	`media_asset_ids` text,
	`schema_type` text,
	`seo_title` text,
	`seo_description` text,
	`canonical_path` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`featured` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`source_ref` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`thumbnail_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`hero_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_offerings`("id", "organization_id", "site_id", "location_id", "name", "slug", "label", "summary", "short_description", "body", "features", "faqs", "cta_label", "cta_url", "thumbnail_asset_id", "hero_image_asset_id", "media_asset_ids", "schema_type", "seo_title", "seo_description", "canonical_path", "sort_order", "featured", "source", "source_ref", "created_at", "updated_at", "updated_by") SELECT "id", "organization_id", "site_id", "location_id", "name", "slug", "label", "summary", "short_description", "body", "features", "faqs", "cta_label", "cta_url", "thumbnail_asset_id", "hero_image_asset_id", "media_asset_ids", "schema_type", "seo_title", "seo_description", "canonical_path", "sort_order", "featured", "source", "source_ref", "created_at", "updated_at", "updated_by" FROM `offerings`;--> statement-breakpoint
DROP TABLE `offerings`;--> statement-breakpoint
ALTER TABLE `__new_offerings` RENAME TO `offerings`;--> statement-breakpoint
CREATE INDEX `offerings_site_sort_idx` ON `offerings` (`site_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `offerings_organization_id_site_id_slug_unique` ON `offerings` (`organization_id`,`site_id`,`slug`);--> statement-breakpoint
CREATE TABLE `__new_tenant_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text,
	`page_type` text DEFAULT 'custom' NOT NULL,
	`recipe` text,
	`summary` text,
	`seo_title` text,
	`seo_description` text,
	`canonical_url` text,
	`robots` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`source_ref` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tenant_pages`("id", "organization_id", "site_id", "title", "slug", "page_type", "recipe", "summary", "seo_title", "seo_description", "canonical_url", "robots", "sort_order", "source", "source_ref", "created_at", "updated_at", "updated_by") SELECT "id", "organization_id", "site_id", "title", "slug", "page_type", "recipe", "summary", "seo_title", "seo_description", "canonical_url", "robots", "sort_order", "source", "source_ref", "created_at", "updated_at", "updated_by" FROM `tenant_pages`;--> statement-breakpoint
DROP TABLE `tenant_pages`;--> statement-breakpoint
ALTER TABLE `__new_tenant_pages` RENAME TO `tenant_pages`;--> statement-breakpoint
CREATE INDEX `tenant_pages_site_sort_idx` ON `tenant_pages` (`site_id`,`sort_order`);--> statement-breakpoint
ALTER TABLE `content_documents` DROP COLUMN `draft_revision_id`;--> statement-breakpoint
ALTER TABLE `content_documents` DROP COLUMN `published_revision_id`;--> statement-breakpoint
-- Hand-appended: drop translation tables removed from schema
DROP TABLE IF EXISTS `business_location_translations`;--> statement-breakpoint
DROP TABLE IF EXISTS `menu_item_translations`;--> statement-breakpoint
DROP TABLE IF EXISTS `menu_translations`;--> statement-breakpoint
DROP TABLE IF EXISTS `post_translations`;--> statement-breakpoint
DROP TABLE IF EXISTS `content_revisions`;--> statement-breakpoint
-- Hand-appended: drop status from site_locales (no check constraint, plain ALTER is safe)
DROP INDEX IF EXISTS `idx_site_locales_site`;--> statement-breakpoint
ALTER TABLE `site_locales` DROP COLUMN `status`;--> statement-breakpoint
CREATE INDEX `idx_site_locales_site` ON `site_locales` (`site_id`, `locale`);--> statement-breakpoint
-- Hand-appended: drop status from platform_docs (no check constraint referencing status)
ALTER TABLE `platform_docs` DROP COLUMN `status`;