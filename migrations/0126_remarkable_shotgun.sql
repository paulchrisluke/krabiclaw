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
	CONSTRAINT "site_locales_status_check" CHECK(status IN ('published', 'disabled') AND (is_source = 0 OR status = 'published'))
);
--> statement-breakpoint
INSERT INTO `__new_site_locales`("id", "organization_id", "site_id", "locale", "label", "is_source", "status", "created_at", "updated_at")
SELECT "id", "organization_id", "site_id", "locale", "label", "is_source", CASE WHEN "is_source" = 1 THEN 'published' ELSE "status" END, "created_at", "updated_at"
FROM `site_locales`;--> statement-breakpoint
DROP TABLE `site_locales`;--> statement-breakpoint
ALTER TABLE `__new_site_locales` RENAME TO `site_locales`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_site_locales_one_source_per_site` ON `site_locales` (`organization_id`,`site_id`) WHERE is_source = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `site_locales_organization_id_site_id_locale_unique` ON `site_locales` (`organization_id`,`site_id`,`locale`);
