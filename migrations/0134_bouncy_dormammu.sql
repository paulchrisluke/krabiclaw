ALTER TABLE `blog_post_redirects` RENAME TO `platform_blog_redirects`;--> statement-breakpoint
ALTER TABLE `tenant_redirects` RENAME TO `site_redirects`;--> statement-breakpoint
ALTER TABLE `site_redirects` RENAME COLUMN "owner_variant_id" TO "owner_id";--> statement-breakpoint
INSERT INTO `site_locales` (`id`, `organization_id`, `site_id`, `locale`, `label`, `is_source`, `status`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(16))), s.organization_id, s.id, 'en', 'English', 1, 'published',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM `sites` s
 WHERE NOT EXISTS (SELECT 1 FROM `site_locales` sl WHERE sl.site_id = s.id AND sl.locale = 'en');--> statement-breakpoint
UPDATE `site_locales`
   SET `is_source` = CASE WHEN `locale` = 'en' THEN 1 ELSE 0 END,
       `status` = CASE WHEN `locale` = 'en' THEN 'published' ELSE 'disabled' END,
       `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');--> statement-breakpoint
CREATE TABLE `__localization_preflight` (`ok` integer NOT NULL CHECK (`ok` = 1));--> statement-breakpoint
INSERT INTO `__localization_preflight` (`ok`)
SELECT 0 FROM `sites` s
 WHERE (SELECT COUNT(*) FROM `site_locales` sl WHERE sl.site_id = s.id AND sl.locale = 'en' AND sl.is_source = 1 AND sl.status = 'published') <> 1;--> statement-breakpoint
DROP TABLE `__localization_preflight`;--> statement-breakpoint
CREATE TABLE `platform_locale_catalogs` (
	`locale` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`direction` text NOT NULL,
	`status` text DEFAULT 'unavailable' NOT NULL,
	`source_manifest_hash` text,
	`available_at` integer,
	`available_by_user_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_by_user_id` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by_user_id` text NOT NULL,
	CONSTRAINT "platform_locale_catalogs_direction_check" CHECK("platform_locale_catalogs"."direction" IN ('ltr', 'rtl')),
	CONSTRAINT "platform_locale_catalogs_status_check" CHECK("platform_locale_catalogs"."status" IN ('unavailable', 'available'))
);
--> statement-breakpoint
CREATE TABLE `platform_locale_messages` (
	`locale` text NOT NULL,
	`message_key` text NOT NULL,
	`message_value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by_user_id` text NOT NULL,
	PRIMARY KEY(`locale`, `message_key`),
	FOREIGN KEY (`locale`) REFERENCES `platform_locale_catalogs`(`locale`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `resource_localizations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`locale` text NOT NULL,
	`values_json` text NOT NULL,
	`route_path` text,
	`document_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_by_user_id` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by_user_id` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `content_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`site_id`,`locale`) REFERENCES `site_locales`(`organization_id`,`site_id`,`locale`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "resource_localizations_values_json_check" CHECK(json_valid("resource_localizations"."values_json") AND json_type("resource_localizations"."values_json") = 'object'),
	CONSTRAINT "resource_localizations_resource_type_check" CHECK("resource_localizations"."resource_type" IN ('site', 'business_location', 'product', 'experience', 'offering', 'site_post', 'tenant_blog_post', 'location_qa', 'media_asset', 'booking_policy', 'site_link_page', 'site_link_item', 'tenant_compliance', 'site_consultation_settings')),
	CONSTRAINT "resource_localizations_route_path_check" CHECK("resource_localizations"."route_path" IS NULL OR ("resource_localizations"."route_path" LIKE '/' || "resource_localizations"."locale" || '/%' AND "resource_localizations"."route_path" NOT LIKE '%?%' AND "resource_localizations"."route_path" NOT LIKE '%#%' AND "resource_localizations"."route_path" NOT LIKE '%//%'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resource_localizations_site_locale_route_unique` ON `resource_localizations` (`site_id`,`locale`,`route_path`) WHERE route_path IS NOT NULL;--> statement-breakpoint
CREATE INDEX `resource_localizations_site_locale_type_idx` ON `resource_localizations` (`site_id`,`locale`,`resource_type`);--> statement-breakpoint
CREATE INDEX `resource_localizations_resource_idx` ON `resource_localizations` (`resource_type`,`resource_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `resource_localizations_org_site_resource_locale_unique` ON `resource_localizations` (`organization_id`,`site_id`,`resource_type`,`resource_id`,`locale`);--> statement-breakpoint
CREATE TABLE `site_language_licenses` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`locale` text NOT NULL,
	`stripe_subscription_id` text,
	`stripe_subscription_item_id` text,
	`status` text DEFAULT 'disabled' NOT NULL,
	`operation_id` text,
	`provider_idempotency_key` text,
	`last_provider_quantity` integer,
	`last_error_code` text,
	`activated_at` integer,
	`disabled_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`,`site_id`,`locale`) REFERENCES `site_locales`(`organization_id`,`site_id`,`locale`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "site_language_licenses_status_check" CHECK("site_language_licenses"."status" IN ('enabling', 'active', 'disabling', 'disabled'))
);
--> statement-breakpoint
CREATE INDEX `site_language_licenses_organization_status_idx` ON `site_language_licenses` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `site_language_licenses_subscription_item_idx` ON `site_language_licenses` (`stripe_subscription_item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_language_licenses_org_site_locale_unique` ON `site_language_licenses` (`organization_id`,`site_id`,`locale`);--> statement-breakpoint
INSERT INTO `platform_locale_catalogs`
  (`locale`, `label`, `direction`, `status`, `created_at`, `created_by_user_id`, `updated_at`, `updated_by_user_id`)
VALUES ('th', 'Thai', 'ltr', 'unavailable', unixepoch(), 'system:migration-0134', unixepoch(), 'system:migration-0134');--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_platform_blog_redirects` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`old_slug` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `blog_posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `site_redirects`
  (`id`, `organization_id`, `site_id`, `locale`, `owner_id`, `from_path`, `to_path`, `status_code`, `behavior`, `reason`, `source`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(16))), p.organization_id, p.site_id, 'en', p.id,
       '/article/' || r.old_slug, '/article/' || p.slug, 301, 'redirect',
       'tenant_blog_slug_change', 'tenant-blog', r.created_at, r.created_at
  FROM `platform_blog_redirects` r
  JOIN `blog_posts` p ON p.id = r.post_id
 WHERE r.site_id IS NOT NULL
ON CONFLICT (`site_id`, `locale`, `from_path`) DO UPDATE SET
  `to_path` = excluded.`to_path`, `updated_at` = excluded.`updated_at`;--> statement-breakpoint
INSERT INTO `__new_platform_blog_redirects`("id", "post_id", "old_slug", "created_at")
SELECT "id", "post_id", "old_slug", "created_at" FROM `platform_blog_redirects` WHERE `site_id` IS NULL;--> statement-breakpoint
DROP TABLE `platform_blog_redirects`;--> statement-breakpoint
ALTER TABLE `__new_platform_blog_redirects` RENAME TO `platform_blog_redirects`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `platform_blog_redirects_slug_idx` ON `platform_blog_redirects` (`old_slug`);--> statement-breakpoint
CREATE INDEX `platform_blog_redirects_post_idx` ON `platform_blog_redirects` (`post_id`);--> statement-breakpoint
CREATE TABLE `__new_site_redirects` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`locale` text NOT NULL,
	`owner_type` text,
	`owner_id` text,
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
	CONSTRAINT "site_redirects_from_path_check" CHECK(from_path LIKE '/%'),
	CONSTRAINT "site_redirects_behavior_check" CHECK(behavior IN ('redirect', 'gone', 'noindex')),
	CONSTRAINT "site_redirects_redirect_to_path_check" CHECK(behavior != 'redirect' OR to_path IS NOT NULL),
	CONSTRAINT "site_redirects_owner_check" CHECK((owner_type IS NULL AND owner_id IS NULL) OR (owner_type IS NOT NULL AND owner_id IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_site_redirects`("id", "organization_id", "site_id", "locale", "owner_type", "owner_id", "from_path", "to_path", "status_code", "behavior", "reason", "source", "created_at", "updated_at")
SELECT "id", "organization_id", "site_id", "locale",
       CASE WHEN "owner_id" IS NULL THEN NULL WHEN "source" = 'tenant-blog' THEN 'tenant_blog_post' ELSE 'tenant_page' END,
       "owner_id", "from_path", "to_path", "status_code", "behavior", "reason", "source", "created_at", "updated_at"
  FROM `site_redirects`;--> statement-breakpoint
DROP TABLE `site_redirects`;--> statement-breakpoint
ALTER TABLE `__new_site_redirects` RENAME TO `site_redirects`;--> statement-breakpoint
CREATE INDEX `site_redirects_organization_id_idx` ON `site_redirects` (`organization_id`);--> statement-breakpoint
CREATE INDEX `site_redirects_site_locale_path_idx` ON `site_redirects` (`site_id`,`locale`,`from_path`);--> statement-breakpoint
CREATE INDEX `site_redirects_owner_idx` ON `site_redirects` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_redirects_site_locale_from_path_unique` ON `site_redirects` (`site_id`,`locale`,`from_path`);--> statement-breakpoint
ALTER TABLE `sites` DROP COLUMN `source_locale`;--> statement-breakpoint
CREATE TRIGGER `resource_localizations_reject_english_insert`
BEFORE INSERT ON `resource_localizations` WHEN NEW.`locale` = 'en'
BEGIN SELECT RAISE(ABORT, 'English source content cannot be stored in resource_localizations'); END;--> statement-breakpoint
CREATE TRIGGER `resource_localizations_reject_english_update`
BEFORE UPDATE OF `locale` ON `resource_localizations` WHEN NEW.`locale` = 'en'
BEGIN SELECT RAISE(ABORT, 'English source content cannot be stored in resource_localizations'); END;--> statement-breakpoint
CREATE TRIGGER `site_language_licenses_reject_english_insert`
BEFORE INSERT ON `site_language_licenses` WHEN NEW.`locale` = 'en'
BEGIN SELECT RAISE(ABORT, 'English source locale cannot have a paid language license'); END;--> statement-breakpoint
CREATE TRIGGER `site_language_licenses_reject_english_update`
BEFORE UPDATE OF `locale` ON `site_language_licenses` WHEN NEW.`locale` = 'en'
BEGIN SELECT RAISE(ABORT, 'English source locale cannot have a paid language license'); END;--> statement-breakpoint
CREATE TRIGGER `site_locales_preserve_english_source_delete`
BEFORE DELETE ON `site_locales` WHEN OLD.`locale` = 'en' AND OLD.`is_source` = 1
BEGIN SELECT RAISE(ABORT, 'English source locale cannot be deleted'); END;--> statement-breakpoint
CREATE TRIGGER `site_locales_preserve_english_source_update`
BEFORE UPDATE OF `locale`, `is_source`, `status` ON `site_locales`
WHEN OLD.`locale` = 'en' AND OLD.`is_source` = 1
  AND (NEW.`locale` <> 'en' OR NEW.`is_source` <> 1 OR NEW.`status` <> 'published')
BEGIN SELECT RAISE(ABORT, 'English source locale cannot be changed'); END;
