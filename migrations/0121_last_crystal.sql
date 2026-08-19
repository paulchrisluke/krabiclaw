CREATE TABLE `spent_subdomains` (
	`domain` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`successor_domain` text,
	`spent_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);--> statement-breakpoint
CREATE INDEX `spent_subdomains_site_idx` ON `spent_subdomains` (`site_id`);--> statement-breakpoint

DROP TABLE `business_location_translations`;--> statement-breakpoint
DROP TABLE `menu_item_translations`;--> statement-breakpoint
DROP TABLE `menu_translations`;--> statement-breakpoint
DROP TABLE `post_translations`;--> statement-breakpoint
DROP TABLE `tenant_navigation_items`;--> statement-breakpoint

-- Preserve the previously published address when the current edited address differs.
INSERT OR IGNORE INTO `tenant_redirects`
  (`id`, `organization_id`, `site_id`, `locale`, `owner_variant_id`, `from_path`, `to_path`, `status_code`, `behavior`, `reason`, `source`, `created_at`, `updated_at`)
SELECT
  'migration-0121-' || `id`, `organization_id`, `site_id`, `locale`, `id`, `published_path`, `draft_path`, 301, 'redirect',
  'Preserved while removing tenant-page publication staging', 'migration', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM `tenant_page_variants`
WHERE `ever_published` = 1 AND `published_path` <> `draft_path`;--> statement-breakpoint

PRAGMA foreign_keys=OFF;--> statement-breakpoint

-- tenant_pages is referenced by tenant_page_variants and tenant_compliance. Rebuild
-- all children first so dropping the old parent cannot fire foreign-key actions.
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
);--> statement-breakpoint
INSERT INTO `__new_tenant_pages`
  (`id`, `organization_id`, `site_id`, `title`, `slug`, `page_type`, `recipe`, `summary`, `seo_title`, `seo_description`, `canonical_url`, `robots`, `sort_order`, `source`, `source_ref`, `created_at`, `updated_at`, `updated_by`)
SELECT
  `id`, `organization_id`, `site_id`, `title`, `slug`, `page_type`, `recipe`, `summary`, `seo_title`, `seo_description`, `canonical_url`, `robots`, `sort_order`, `source`, `source_ref`, `created_at`, `updated_at`, `updated_by`
FROM `tenant_pages`;--> statement-breakpoint

CREATE TABLE `__new_tenant_page_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`page_id` text NOT NULL,
	`locale` text NOT NULL,
	`document_id` text NOT NULL,
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
	FOREIGN KEY (`page_id`) REFERENCES `__new_tenant_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `content_documents`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `tenant_page_variants_path_check` CHECK(path LIKE '/%' AND path NOT LIKE '//%')
);--> statement-breakpoint
INSERT INTO `__new_tenant_page_variants`
  (`id`, `organization_id`, `site_id`, `page_id`, `locale`, `document_id`, `path`, `title`, `summary`, `seo_title`, `seo_description`, `canonical_url`, `robots`, `created_at`, `updated_at`, `updated_by`)
SELECT
  `id`, `organization_id`, `site_id`, `page_id`, `locale`, `draft_document_id`, `draft_path`, `title`, `summary`, `seo_title`, `seo_description`, `canonical_url`, `robots`, `created_at`, `updated_at`, `updated_by`
FROM `tenant_page_variants`;--> statement-breakpoint

CREATE TABLE `__new_tenant_compliance` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`entity_name` text,
	`dba_name` text,
	`entity_type` text,
	`nonprofit_status` text,
	`registration_number` text,
	`service_area` text,
	`service_area_type` text,
	`disclaimer` text,
	`footer_disclaimer` text,
	`privacy_page_id` text,
	`terms_page_id` text,
	`notice_page_id` text,
	`document_asset_ids` text,
	`founder_name` text,
	`founding_date` text,
	`same_as` text,
	`contact_points` text,
	`address_visibility` text DEFAULT 'hidden' NOT NULL,
	`metadata_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`privacy_page_id`) REFERENCES `__new_tenant_pages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`terms_page_id`) REFERENCES `__new_tenant_pages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`notice_page_id`) REFERENCES `__new_tenant_pages`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT `tenant_compliance_address_visibility_check` CHECK(address_visibility IN ('visible', 'hidden'))
);--> statement-breakpoint
INSERT INTO `__new_tenant_compliance`
  (`id`, `organization_id`, `site_id`, `entity_name`, `dba_name`, `entity_type`, `nonprofit_status`, `registration_number`, `service_area`, `service_area_type`, `disclaimer`, `footer_disclaimer`, `privacy_page_id`, `terms_page_id`, `notice_page_id`, `document_asset_ids`, `founder_name`, `founding_date`, `same_as`, `contact_points`, `address_visibility`, `metadata_json`, `created_at`, `updated_at`, `updated_by`)
SELECT
  `id`, `organization_id`, `site_id`, `entity_name`, `dba_name`, `entity_type`, `nonprofit_status`, `registration_number`, `service_area`, `service_area_type`, `disclaimer`, `footer_disclaimer`, `privacy_page_id`, `terms_page_id`, `notice_page_id`, `document_asset_ids`, `founder_name`, `founding_date`, `same_as`, `contact_points`, `address_visibility`, `metadata_json`, `created_at`, `updated_at`, `updated_by`
FROM `tenant_compliance`;--> statement-breakpoint

DROP TABLE `tenant_page_variants`;--> statement-breakpoint
DROP TABLE `tenant_compliance`;--> statement-breakpoint
DROP TABLE `tenant_pages`;--> statement-breakpoint
ALTER TABLE `__new_tenant_pages` RENAME TO `tenant_pages`;--> statement-breakpoint
ALTER TABLE `__new_tenant_page_variants` RENAME TO `tenant_page_variants`;--> statement-breakpoint
ALTER TABLE `__new_tenant_compliance` RENAME TO `tenant_compliance`;--> statement-breakpoint
CREATE INDEX `tenant_pages_site_sort_idx` ON `tenant_pages` (`site_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_page_variants_page_locale_unique` ON `tenant_page_variants` (`page_id`,`locale`);--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_page_variants_site_locale_path_unique` ON `tenant_page_variants` (`site_id`,`locale`,`path`);--> statement-breakpoint
CREATE INDEX `tenant_page_variants_site_path_idx` ON `tenant_page_variants` (`site_id`,`path`);--> statement-breakpoint
CREATE INDEX `tenant_page_variants_page_idx` ON `tenant_page_variants` (`page_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_compliance_site_id_unique` ON `tenant_compliance` (`site_id`);--> statement-breakpoint

-- site_link_pages is referenced by site_link_items; rebuild the pair child-first.
CREATE TABLE `__new_site_link_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`path` text DEFAULT '/links' NOT NULL,
	`title` text NOT NULL,
	`robots` text DEFAULT 'noindex,follow' NOT NULL,
	`seo_title` text,
	`seo_description` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `site_link_pages_path_check` CHECK(path LIKE '/%' AND path NOT LIKE '//%'),
	CONSTRAINT `site_link_pages_robots_check` CHECK(robots IN ('index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow'))
);--> statement-breakpoint
INSERT INTO `__new_site_link_pages`
  (`id`, `organization_id`, `site_id`, `path`, `title`, `robots`, `seo_title`, `seo_description`, `created_at`, `updated_at`, `updated_by`)
SELECT `id`, `organization_id`, `site_id`, `path`, `title`, `robots`, `seo_title`, `seo_description`, `created_at`, `updated_at`, `updated_by`
FROM `site_link_pages`;--> statement-breakpoint

CREATE TABLE `__new_site_link_items` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`link_page_id` text NOT NULL,
	`label` text NOT NULL,
	`destination` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`link_page_id`) REFERENCES `__new_site_link_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `site_link_items_status_check` CHECK(status IN ('active', 'hidden'))
);--> statement-breakpoint
INSERT INTO `__new_site_link_items`
  (`id`, `organization_id`, `site_id`, `link_page_id`, `label`, `destination`, `sort_order`, `status`, `created_at`, `updated_at`, `updated_by`)
SELECT `id`, `organization_id`, `site_id`, `link_page_id`, `label`, `destination`, `sort_order`, `status`, `created_at`, `updated_at`, `updated_by`
FROM `site_link_items`;--> statement-breakpoint
DROP TABLE `site_link_items`;--> statement-breakpoint
DROP TABLE `site_link_pages`;--> statement-breakpoint
ALTER TABLE `__new_site_link_pages` RENAME TO `site_link_pages`;--> statement-breakpoint
ALTER TABLE `__new_site_link_items` RENAME TO `site_link_items`;--> statement-breakpoint
CREATE UNIQUE INDEX `site_link_pages_site_id_unique` ON `site_link_pages` (`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_link_pages_organization_id_site_id_path_unique` ON `site_link_pages` (`organization_id`,`site_id`,`path`);--> statement-breakpoint
CREATE INDEX `site_link_pages_site_idx` ON `site_link_pages` (`site_id`);--> statement-breakpoint
CREATE INDEX `site_link_items_page_status_sort_idx` ON `site_link_items` (`link_page_id`,`status`,`sort_order`);--> statement-breakpoint
CREATE INDEX `site_link_items_site_idx` ON `site_link_items` (`site_id`);--> statement-breakpoint

-- offerings has no incoming foreign keys, so its generated status-check rebuild is safe.
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
);--> statement-breakpoint
INSERT INTO `__new_offerings`
  (`id`, `organization_id`, `site_id`, `location_id`, `name`, `slug`, `label`, `summary`, `short_description`, `body`, `features`, `faqs`, `cta_label`, `cta_url`, `thumbnail_asset_id`, `hero_image_asset_id`, `media_asset_ids`, `schema_type`, `seo_title`, `seo_description`, `canonical_path`, `sort_order`, `featured`, `source`, `source_ref`, `created_at`, `updated_at`, `updated_by`)
SELECT
  `id`, `organization_id`, `site_id`, `location_id`, `name`, `slug`, `label`, `summary`, `short_description`, `body`, `features`, `faqs`, `cta_label`, `cta_url`, `thumbnail_asset_id`, `hero_image_asset_id`, `media_asset_ids`, `schema_type`, `seo_title`, `seo_description`, `canonical_path`, `sort_order`, `featured`, `source`, `source_ref`, `created_at`, `updated_at`, `updated_by`
FROM `offerings`;--> statement-breakpoint
DROP TABLE `offerings`;--> statement-breakpoint
ALTER TABLE `__new_offerings` RENAME TO `offerings`;--> statement-breakpoint
CREATE INDEX `offerings_site_sort_idx` ON `offerings` (`site_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `offerings_organization_id_site_id_slug_unique` ON `offerings` (`organization_id`,`site_id`,`slug`);--> statement-breakpoint

PRAGMA foreign_keys=ON;--> statement-breakpoint

ALTER TABLE `menus` ADD `is_visible` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE `menus` SET `is_visible` = CASE WHEN `status` = 'published' THEN 1 ELSE 0 END;--> statement-breakpoint
ALTER TABLE `menus` DROP COLUMN `status`;--> statement-breakpoint
ALTER TABLE `blog_posts` DROP COLUMN `scheduled_revision_id`;--> statement-breakpoint
ALTER TABLE `content_documents` DROP COLUMN `draft_revision_id`;--> statement-breakpoint
ALTER TABLE `content_documents` DROP COLUMN `published_revision_id`;--> statement-breakpoint
DROP TABLE `content_revisions`;
