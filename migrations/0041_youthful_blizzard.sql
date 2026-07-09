CREATE TABLE IF NOT EXISTS `client_import_artifacts` (
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
CREATE UNIQUE INDEX IF NOT EXISTS `client_import_artifacts_slug_type_path_unique` ON `client_import_artifacts` (`slug`,`artifact_type`,`path`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `offerings` (
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
CREATE INDEX IF NOT EXISTS `offerings_site_status_sort_idx` ON `offerings` (`site_id`,`status`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `offerings_organization_id_site_id_slug_unique` ON `offerings` (`organization_id`,`site_id`,`slug`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `site_consultation_settings` (
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
CREATE UNIQUE INDEX IF NOT EXISTS `site_consultation_settings_site_id_unique` ON `site_consultation_settings` (`site_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `site_conversion_events` (
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
CREATE INDEX IF NOT EXISTS `site_conversion_events_site_created_idx` ON `site_conversion_events` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `site_conversion_events_name_created_idx` ON `site_conversion_events` (`event_name`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `site_theme_tokens` (
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
CREATE UNIQUE INDEX IF NOT EXISTS `site_theme_tokens_site_template_unique` ON `site_theme_tokens` (`site_id`,`template_slug`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tenant_compliance` (
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
CREATE UNIQUE INDEX IF NOT EXISTS `tenant_compliance_site_id_unique` ON `tenant_compliance` (`site_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tenant_navigation_items` (
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
CREATE INDEX IF NOT EXISTS `tenant_navigation_items_site_area_sort_idx` ON `tenant_navigation_items` (`site_id`,`area`,`sort_order`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tenant_pages` (
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
CREATE INDEX IF NOT EXISTS `tenant_pages_site_status_sort_idx` ON `tenant_pages` (`site_id`,`status`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `tenant_pages_organization_id_site_id_path_unique` ON `tenant_pages` (`organization_id`,`site_id`,`path`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tenant_redirects` (
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
CREATE UNIQUE INDEX IF NOT EXISTS `tenant_redirects_site_from_path_unique` ON `tenant_redirects` (`site_id`,`from_path`);--> statement-breakpoint
