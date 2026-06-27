PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_blog_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`site_id` text,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`body` text NOT NULL,
	`excerpt` text,
	`category` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`author_id` text,
	`featured_image_asset_id` text,
	`published_at` text,
	`scheduled_for` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`seo_description` text,
	`seo_keywords` text,
	`canonical_url` text,
	`robots` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`featured_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "blog_posts_scope_check" CHECK((organization_id IS NULL AND site_id IS NULL) OR (organization_id IS NOT NULL AND site_id IS NOT NULL)),
	CONSTRAINT "blog_posts_status_check" CHECK(status IN ('draft', 'published', 'scheduled', 'archived'))
);
--> statement-breakpoint
INSERT INTO `__new_blog_posts`("id", "organization_id", "site_id", "title", "slug", "body", "excerpt", "category", "status", "author_id", "featured_image_asset_id", "published_at", "scheduled_for", "created_at", "updated_at", "seo_description", "seo_keywords", "canonical_url", "robots") SELECT "id", "organization_id", "site_id", "title", "slug", "body", "excerpt", "category", "status", "author_id", "featured_image_asset_id", "published_at", "scheduled_for", "created_at", "updated_at", "seo_description", "seo_keywords", "canonical_url", "robots" FROM `blog_posts`;--> statement-breakpoint
DROP TABLE `blog_posts`;--> statement-breakpoint
ALTER TABLE `__new_blog_posts` RENAME TO `blog_posts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `blog_posts_platform_slug_idx` ON `blog_posts` (`slug`) WHERE site_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `blog_posts_site_slug_idx` ON `blog_posts` (`site_id`,`slug`) WHERE site_id IS NOT NULL;--> statement-breakpoint
DROP INDEX `sites_organization_id_id_unique`;
--> statement-breakpoint
CREATE TRIGGER `blog_posts_scope_org_site_insert`
BEFORE INSERT ON `blog_posts`
WHEN NEW.organization_id IS NOT NULL
  AND NEW.site_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sites
    WHERE id = NEW.site_id AND organization_id = NEW.organization_id
  )
BEGIN
  SELECT RAISE(ABORT, 'blog_posts site_id must belong to organization_id');
END;
--> statement-breakpoint
CREATE TRIGGER `blog_posts_scope_org_site_update`
BEFORE UPDATE OF `organization_id`, `site_id` ON `blog_posts`
WHEN NEW.organization_id IS NOT NULL
  AND NEW.site_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sites
    WHERE id = NEW.site_id AND organization_id = NEW.organization_id
  )
BEGIN
  SELECT RAISE(ABORT, 'blog_posts site_id must belong to organization_id');
END;
