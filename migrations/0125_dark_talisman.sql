-- Persisted publication drafts were retired when content revisions were removed.
-- Onboarding drafts are a separate resumable aggregate and are intentionally unaffected.
DELETE FROM `content_documents`
 WHERE `owner_type` IN ('tenant_blog', 'platform_blog')
   AND `owner_id` IN (SELECT `id` FROM `blog_posts` WHERE `status` IN ('draft', 'archived'));--> statement-breakpoint
DELETE FROM `blog_posts` WHERE `status` IN ('draft', 'archived');--> statement-breakpoint
DELETE FROM `posts` WHERE `status` IN ('draft', 'archived');--> statement-breakpoint
DELETE FROM `platform_content_components`
 WHERE `content_type` = 'doc'
   AND `content_id` IN (SELECT `id` FROM `platform_docs` WHERE `status` != 'published');--> statement-breakpoint
DELETE FROM `platform_docs` WHERE `status` != 'published';--> statement-breakpoint
DELETE FROM `content_documents` WHERE `owner_type` = 'platform_doc';--> statement-breakpoint
DELETE FROM `tenant_redirects`
 WHERE EXISTS (
   SELECT 1 FROM `site_locales`
    WHERE `site_locales`.`site_id` = `tenant_redirects`.`site_id`
      AND `site_locales`.`organization_id` = `tenant_redirects`.`organization_id`
      AND `site_locales`.`locale` = `tenant_redirects`.`locale`
      AND `site_locales`.`status` = 'draft'
 );--> statement-breakpoint
DELETE FROM `content_documents`
 WHERE `owner_type` = 'tenant_page'
   AND `owner_id` IN (
     SELECT `tenant_page_variants`.`id`
       FROM `tenant_page_variants`
       JOIN `site_locales`
         ON `site_locales`.`site_id` = `tenant_page_variants`.`site_id`
        AND `site_locales`.`organization_id` = `tenant_page_variants`.`organization_id`
        AND `site_locales`.`locale` = `tenant_page_variants`.`locale`
      WHERE `site_locales`.`status` = 'draft'
   );--> statement-breakpoint
DELETE FROM `site_locales` WHERE `status` = 'draft';--> statement-breakpoint

PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_site_locales` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`locale` text NOT NULL,
	`label` text,
	`is_source` numeric DEFAULT false NOT NULL,
	`status` text DEFAULT 'disabled' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "site_locales_status_check" CHECK(status IN ('published', 'disabled'))
);
--> statement-breakpoint
INSERT INTO `__new_site_locales`("id", "organization_id", "site_id", "locale", "label", "is_source", "status", "created_at", "updated_at") SELECT "id", "organization_id", "site_id", "locale", "label", "is_source", "status", "created_at", "updated_at" FROM `site_locales`;--> statement-breakpoint
DROP TABLE `site_locales`;--> statement-breakpoint
ALTER TABLE `__new_site_locales` RENAME TO `site_locales`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_site_locales_one_source_per_site` ON `site_locales` (`organization_id`,`site_id`) WHERE is_source = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `site_locales_organization_id_site_id_locale_unique` ON `site_locales` (`organization_id`,`site_id`,`locale`);--> statement-breakpoint
CREATE TABLE `__new_platform_docs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`body` text NOT NULL,
	`excerpt` text,
	`category` text,
	`nav_section` text,
	`nav_title` text,
	`nav_order` integer,
	`nav_section_order` integer,
	`nav_group` text,
	`nav_group_order` integer,
	`hide_from_nav` integer DEFAULT 0 NOT NULL,
	`featured_order` integer,
	`author_id` text,
	`seo_description` text,
	`seo_keywords` text,
	`featured_image_asset_id` text,
	`sort_order` integer DEFAULT 0,
	`difficulty_level` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`canonical_url` text,
	`robots` text,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`featured_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `__new_platform_docs` (
  `id`, `title`, `slug`, `body`, `excerpt`, `category`, `nav_section`, `nav_title`,
  `nav_order`, `nav_section_order`, `nav_group`, `nav_group_order`, `hide_from_nav`,
  `featured_order`, `author_id`, `seo_description`, `seo_keywords`, `featured_image_asset_id`,
  `sort_order`, `difficulty_level`, `created_at`, `updated_at`, `canonical_url`, `robots`
)
SELECT
  `id`, `title`, `slug`, `body`, `excerpt`, `category`, `nav_section`, `nav_title`,
  `nav_order`, `nav_section_order`, `nav_group`, `nav_group_order`, `hide_from_nav`,
  `featured_order`, `author_id`, `seo_description`, `seo_keywords`, `featured_image_asset_id`,
  `sort_order`, `difficulty_level`, `created_at`, `updated_at`, `canonical_url`, `robots`
FROM `platform_docs`;--> statement-breakpoint
DROP TABLE `platform_docs`;--> statement-breakpoint
ALTER TABLE `__new_platform_docs` RENAME TO `platform_docs`;--> statement-breakpoint
CREATE UNIQUE INDEX `platform_docs_slug_unique` ON `platform_docs` (`slug`);--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint

CREATE TRIGGER `posts_publication_status_insert`
BEFORE INSERT ON `posts`
WHEN NEW.`status` NOT IN ('published', 'scheduled')
BEGIN SELECT RAISE(ABORT, 'posts.status must be published or scheduled'); END;--> statement-breakpoint
CREATE TRIGGER `posts_publication_status_update`
BEFORE UPDATE OF `status` ON `posts`
WHEN NEW.`status` NOT IN ('published', 'scheduled')
BEGIN SELECT RAISE(ABORT, 'posts.status must be published or scheduled'); END;--> statement-breakpoint
CREATE TRIGGER `blog_posts_publication_status_insert`
BEFORE INSERT ON `blog_posts`
WHEN NEW.`status` NOT IN ('published', 'scheduled')
BEGIN SELECT RAISE(ABORT, 'blog_posts.status must be published or scheduled'); END;--> statement-breakpoint
CREATE TRIGGER `blog_posts_publication_status_update`
BEFORE UPDATE OF `status` ON `blog_posts`
WHEN NEW.`status` NOT IN ('published', 'scheduled')
BEGIN SELECT RAISE(ABORT, 'blog_posts.status must be published or scheduled'); END;--> statement-breakpoint
CREATE TRIGGER `content_documents_platform_doc_insert`
BEFORE INSERT ON `content_documents`
WHEN NEW.`owner_type` = 'platform_doc'
BEGIN SELECT RAISE(ABORT, 'platform docs do not use content_documents'); END;--> statement-breakpoint
CREATE TRIGGER `content_documents_platform_doc_update`
BEFORE UPDATE OF `owner_type` ON `content_documents`
WHEN NEW.`owner_type` = 'platform_doc'
BEGIN SELECT RAISE(ABORT, 'platform docs do not use content_documents'); END;
