PRAGMA foreign_keys=OFF;
CREATE TABLE `tenant_page_translation_fields` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `site_id` text NOT NULL,
  `page_id` text NOT NULL,
  `variant_id` text NOT NULL,
  `locale` text NOT NULL,
  `field` text NOT NULL,
  `target_block_id` text,
  `source_hash` text,
  `status` text DEFAULT 'missing' NOT NULL,
  `translated_at` text,
  `reviewed_at` text,
  `reviewed_by` text,
  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE cascade,
  FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON DELETE cascade,
  FOREIGN KEY (`page_id`) REFERENCES `tenant_pages`(`id`) ON DELETE cascade,
  FOREIGN KEY (`variant_id`) REFERENCES `tenant_page_variants`(`id`) ON DELETE cascade,
  FOREIGN KEY (`reviewed_by`) REFERENCES `user`(`id`) ON DELETE set null,
  CONSTRAINT `tenant_page_translation_fields_status_check` CHECK(status IN ('missing', 'draft', 'published'))
);
CREATE INDEX `tenant_page_translation_fields_site_locale_idx` ON `tenant_page_translation_fields` (`site_id`,`locale`,`status`);
CREATE INDEX `tenant_page_translation_fields_page_idx` ON `tenant_page_translation_fields` (`page_id`);
CREATE UNIQUE INDEX `tenant_page_translation_fields_variant_field_unique` ON `tenant_page_translation_fields` (`variant_id`,`field`);
--> statement-breakpoint

CREATE TABLE `__tenant_redirects_backup` AS
SELECT id, organization_id, site_id, from_path, to_path, status_code, behavior, reason, source, created_at, updated_at
FROM `tenant_redirects`;
DROP TABLE `tenant_redirects`;
CREATE TABLE `tenant_redirects` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `site_id` text NOT NULL,
  `locale` text NOT NULL,
  `owner_variant_id` text,
  `from_path` text NOT NULL,
  `to_path` text,
  `status_code` integer DEFAULT 301 NOT NULL,
  `behavior` text DEFAULT 'redirect' NOT NULL,
  `reason` text,
  `source` text DEFAULT 'manual' NOT NULL,
  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE cascade,
  FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON DELETE cascade,
  CONSTRAINT `tenant_redirects_from_path_check` CHECK(from_path LIKE '/%'),
  CONSTRAINT `tenant_redirects_behavior_check` CHECK(behavior IN ('redirect', 'gone', 'noindex')),
  CONSTRAINT `tenant_redirects_redirect_to_path_check` CHECK(behavior != 'redirect' OR to_path IS NOT NULL)
);
INSERT INTO `tenant_redirects`
  (id, organization_id, site_id, locale, owner_variant_id, from_path, to_path, status_code, behavior, reason, source, created_at, updated_at)
SELECT
  b.id,
  b.organization_id,
  b.site_id,
  COALESCE(
    (SELECT v.locale FROM tenant_page_variants v WHERE v.site_id = b.site_id AND v.published_path = b.from_path ORDER BY v.status = 'published' DESC LIMIT 1),
    (SELECT sl.locale FROM site_locales sl WHERE sl.site_id = b.site_id AND sl.is_source = 1 LIMIT 1),
    (SELECT s.source_locale FROM sites s WHERE s.id = b.site_id),
    'en'
  ),
  NULL,
  b.from_path,
  b.to_path,
  b.status_code,
  b.behavior,
  b.reason,
  b.source,
  b.created_at,
  b.updated_at
FROM `__tenant_redirects_backup` b;
DROP TABLE `__tenant_redirects_backup`;
CREATE INDEX `tenant_redirects_organization_id_idx` ON `tenant_redirects` (`organization_id`);
CREATE INDEX `tenant_redirects_site_locale_path_idx` ON `tenant_redirects` (`site_id`,`locale`,`from_path`);
CREATE UNIQUE INDEX `tenant_redirects_site_locale_from_path_unique` ON `tenant_redirects` (`site_id`,`locale`,`from_path`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
