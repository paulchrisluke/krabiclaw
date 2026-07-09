CREATE TABLE `client_import_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`site_id` text,
	`slug` text NOT NULL,
	`artifact_type` text NOT NULL,
	`path` text NOT NULL,
	`hash` text,
	`status` text DEFAULT 'generated' NOT NULL,
	`summary_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "client_import_artifacts_status_check" CHECK(status IN ('generated', 'approved', 'applied', 'superseded'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_import_artifacts_slug_type_path_unique` ON `client_import_artifacts` (`slug`,`artifact_type`,`path`);--> statement-breakpoint
CREATE TABLE `offerings` (
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
	`status` text DEFAULT 'draft' NOT NULL,
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
	FOREIGN KEY (`hero_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "offerings_status_check" CHECK(status IN ('draft', 'published', 'archived'))
);
--> statement-breakpoint
CREATE INDEX `offerings_site_status_sort_idx` ON `offerings` (`site_id`,`status`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `offerings_organization_id_site_id_slug_unique` ON `offerings` (`organization_id`,`site_id`,`slug`);--> statement-breakpoint
CREATE TABLE `site_consultation_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`mode` text DEFAULT 'external_url' NOT NULL,
	`cta_label` text DEFAULT 'Book a consultation' NOT NULL,
	`external_url` text,
	`schedule_path` text DEFAULT '/schedule' NOT NULL,
	`confirmation_path` text DEFAULT '/contact/confirmed' NOT NULL,
	`tracking_enabled` integer DEFAULT 1 NOT NULL,
	`metadata_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "site_consultation_settings_mode_check" CHECK(mode IN ('external_url', 'native_disabled')),
	CONSTRAINT "site_consultation_settings_schedule_path_check" CHECK(schedule_path LIKE '/%'),
	CONSTRAINT "site_consultation_settings_confirmation_path_check" CHECK(confirmation_path LIKE '/%')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_consultation_settings_site_id_unique` ON `site_consultation_settings` (`site_id`);--> statement-breakpoint
CREATE TABLE `site_conversion_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`event_name` text NOT NULL,
	`page_type` text,
	`page_path` text,
	`page_location` text,
	`cta_destination` text,
	`tenant` text,
	`metadata_json` text,
	`ip_hash` text,
	`user_agent` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "site_conversion_events_name_check" CHECK(event_name IN ('page_view', 'book_consultation_click', 'contact_submit'))
);
--> statement-breakpoint
CREATE INDEX `site_conversion_events_site_created_idx` ON `site_conversion_events` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `site_conversion_events_name_created_idx` ON `site_conversion_events` (`event_name`,`created_at`);--> statement-breakpoint
CREATE TABLE `site_theme_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`template_slug` text NOT NULL,
	`tokens_json` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "site_theme_tokens_status_check" CHECK(status IN ('active', 'disabled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_theme_tokens_site_template_unique` ON `site_theme_tokens` (`site_id`,`template_slug`);--> statement-breakpoint
CREATE TABLE `tenant_compliance` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`entity_name` text,
	`dba_name` text,
	`entity_type` text,
	`nonprofit_status` text,
	`registration_number` text,
	`service_area` text,
	`disclaimer` text,
	`footer_disclaimer` text,
	`privacy_page_id` text,
	`terms_page_id` text,
	`notice_page_id` text,
	`document_asset_ids` text,
	`metadata_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`privacy_page_id`) REFERENCES `tenant_pages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`terms_page_id`) REFERENCES `tenant_pages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`notice_page_id`) REFERENCES `tenant_pages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_compliance_site_id_unique` ON `tenant_compliance` (`site_id`);--> statement-breakpoint
CREATE TABLE `tenant_navigation_items` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`area` text DEFAULT 'header' NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`item_type` text DEFAULT 'internal' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`metadata_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tenant_navigation_items_area_check" CHECK(area IN ('header', 'footer', 'legal', 'social')),
	CONSTRAINT "tenant_navigation_items_status_check" CHECK(status IN ('active', 'hidden'))
);
--> statement-breakpoint
CREATE INDEX `tenant_navigation_items_site_area_sort_idx` ON `tenant_navigation_items` (`site_id`,`area`,`sort_order`);--> statement-breakpoint
CREATE TABLE `tenant_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`path` text NOT NULL,
	`title` text NOT NULL,
	`slug` text,
	`page_type` text DEFAULT 'static' NOT NULL,
	`summary` text,
	`body` text,
	`components_json` text,
	`cta_label` text,
	`cta_url` text,
	`seo_title` text,
	`seo_description` text,
	`canonical_url` text,
	`robots` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`source_ref` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tenant_pages_path_check" CHECK(path LIKE '/%'),
	CONSTRAINT "tenant_pages_status_check" CHECK(status IN ('draft', 'published', 'archived'))
);
--> statement-breakpoint
CREATE INDEX `tenant_pages_site_status_sort_idx` ON `tenant_pages` (`site_id`,`status`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_pages_organization_id_site_id_path_unique` ON `tenant_pages` (`organization_id`,`site_id`,`path`);--> statement-breakpoint
CREATE TABLE `tenant_redirects` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`from_path` text NOT NULL,
	`to_path` text,
	`status_code` integer DEFAULT 301 NOT NULL,
	`behavior` text DEFAULT 'redirect' NOT NULL,
	`reason` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tenant_redirects_from_path_check" CHECK(from_path LIKE '/%'),
	CONSTRAINT "tenant_redirects_behavior_check" CHECK(behavior IN ('redirect', 'gone', 'noindex'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_redirects_site_from_path_unique` ON `tenant_redirects` (`site_id`,`from_path`);--> statement-breakpoint
DROP TRIGGER IF EXISTS `blog_posts_scope_org_site_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `blog_posts_scope_org_site_update`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sites` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`theme_id` text DEFAULT 'saya-theme-v1' NOT NULL,
	`theme` text DEFAULT 'saya' NOT NULL,
	`slug` text NOT NULL,
	`subdomain` text,
	`custom_domain` text,
	`custom_domain_status` text DEFAULT 'none',
	`primary_location_id` text,
	`public_url` text,
	`brand_name` text,
	`brand_description` text,
	`logo_url` text,
	`logo_asset_id` text,
	`contact_email` text,
	`contact_phone` text,
	`source_locale` text DEFAULT 'en' NOT NULL,
	`default_currency` text DEFAULT 'THB' NOT NULL,
	`status` text DEFAULT 'active',
	`plan` text DEFAULT 'free',
	`onboarding_status` text DEFAULT 'pending',
	`url_structure` text DEFAULT 'location_subdirectories' NOT NULL,
	`vertical` text DEFAULT 'restaurant' NOT NULL,
	`content_source` text,
	`media_source` text,
	`settings` text,
	`last_published_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_by` text,
	`og_image_asset_id` text,
	`seo_title` text,
	`seo_description` text,
	`canonical_url` text,
	`robots` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`logo_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`og_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "sites_status_check" CHECK("__new_sites"."status" IN ('active', 'inactive', 'suspended')),
	CONSTRAINT "sites_plan_check" CHECK("__new_sites"."plan" IN ('free', 'growth', 'managed', 'seo_accelerator')),
	CONSTRAINT "sites_onboarding_status_check" CHECK("__new_sites"."onboarding_status" IN ('pending', 'active', 'failed')),
	CONSTRAINT "sites_url_structure_check" CHECK("__new_sites"."url_structure" IN ('location_subdirectories', 'brand_pages')),
	CONSTRAINT "sites_vertical_check" CHECK("__new_sites"."vertical" IN ('restaurant', 'experience', 'retail', 'wellness', 'service', 'professional_service')),
	CONSTRAINT "sites_content_source_check" CHECK("__new_sites"."content_source" IN ('google_maps', 'client_supplied', 'generated')),
	CONSTRAINT "sites_media_source_check" CHECK("__new_sites"."media_source" IN ('client_photos', 'stock', 'mixed'))
);
--> statement-breakpoint
INSERT INTO `__new_sites`("id", "organization_id", "theme_id", "theme", "slug", "subdomain", "custom_domain", "custom_domain_status", "primary_location_id", "public_url", "brand_name", "brand_description", "logo_url", "logo_asset_id", "contact_email", "contact_phone", "source_locale", "default_currency", "status", "plan", "onboarding_status", "url_structure", "vertical", "content_source", "media_source", "settings", "last_published_at", "created_at", "updated_at", "updated_by", "og_image_asset_id", "seo_title", "seo_description", "canonical_url", "robots") SELECT "id", "organization_id", "theme_id", "theme", "slug", "subdomain", "custom_domain", "custom_domain_status", "primary_location_id", "public_url", "brand_name", "brand_description", "logo_url", "logo_asset_id", "contact_email", "contact_phone", "source_locale", "default_currency", "status", "plan", "onboarding_status", "url_structure", "vertical", "content_source", "media_source", "settings", "last_published_at", "created_at", "updated_at", "updated_by", "og_image_asset_id", "seo_title", "seo_description", "canonical_url", "robots" FROM `sites`;--> statement-breakpoint
DROP TABLE `sites`;--> statement-breakpoint
ALTER TABLE `__new_sites` RENAME TO `sites`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `sites_slug_unique` ON `sites` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `sites_subdomain_unique` ON `sites` (`subdomain`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sites_custom_domain_unique`
  ON `sites` (`custom_domain`)
  WHERE `custom_domain` IS NOT NULL;--> statement-breakpoint
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
