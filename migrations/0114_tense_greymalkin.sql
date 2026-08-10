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
	`team_id` text,
	`feature_overrides` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`logo_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`og_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "sites_status_check" CHECK("__new_sites"."status" IN ('active', 'inactive', 'suspended')),
	CONSTRAINT "sites_plan_check" CHECK("__new_sites"."plan" IN ('free', 'growth', 'managed', 'seo_accelerator')),
	CONSTRAINT "sites_onboarding_status_check" CHECK("__new_sites"."onboarding_status" IN ('pending', 'active', 'failed')),
	CONSTRAINT "sites_vertical_check" CHECK("__new_sites"."vertical" IN ('restaurant', 'experience', 'retail', 'wellness', 'service')),
	CONSTRAINT "sites_content_source_check" CHECK("__new_sites"."content_source" IN ('google_maps', 'client_supplied', 'generated')),
	CONSTRAINT "sites_media_source_check" CHECK("__new_sites"."media_source" IN ('client_photos', 'stock', 'mixed'))
);
--> statement-breakpoint
INSERT INTO `__new_sites`("id", "organization_id", "theme_id", "theme", "slug", "subdomain", "custom_domain", "custom_domain_status", "primary_location_id", "public_url", "brand_name", "brand_description", "logo_url", "logo_asset_id", "contact_email", "contact_phone", "source_locale", "default_currency", "status", "plan", "onboarding_status", "vertical", "content_source", "media_source", "settings", "last_published_at", "created_at", "updated_at", "updated_by", "og_image_asset_id", "seo_title", "seo_description", "canonical_url", "robots", "team_id", "feature_overrides") SELECT "id", "organization_id", "theme_id", "theme", "slug", "subdomain", "custom_domain", "custom_domain_status", "primary_location_id", "public_url", "brand_name", "brand_description", "logo_url", "logo_asset_id", "contact_email", "contact_phone", "source_locale", "default_currency", "status", "plan", "onboarding_status", "vertical", "content_source", "media_source", "settings", "last_published_at", "created_at", "updated_at", "updated_by", "og_image_asset_id", "seo_title", "seo_description", "canonical_url", "robots", "team_id", "feature_overrides" FROM `sites`;--> statement-breakpoint
DROP TABLE `sites`;--> statement-breakpoint
ALTER TABLE `__new_sites` RENAME TO `sites`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `sites_slug_unique` ON `sites` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `sites_subdomain_unique` ON `sites` (`subdomain`);--> statement-breakpoint
CREATE INDEX `sites_organization_id_idx` ON `sites` (`organization_id`);--> statement-breakpoint
CREATE INDEX `sites_created_at_idx` ON `sites` (`created_at`);