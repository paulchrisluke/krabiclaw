PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_site_consultation_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`mode` text DEFAULT 'external_url' NOT NULL,
	`cta_label` text NOT NULL,
	`external_url` text,
	`schedule_path` text NOT NULL,
	`confirmation_path` text NOT NULL,
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
INSERT INTO `__new_site_consultation_settings`("id", "organization_id", "site_id", "mode", "cta_label", "external_url", "schedule_path", "confirmation_path", "tracking_enabled", "metadata_json", "created_at", "updated_at", "updated_by") SELECT "id", "organization_id", "site_id", "mode", "cta_label", "external_url", "schedule_path", "confirmation_path", "tracking_enabled", "metadata_json", "created_at", "updated_at", "updated_by" FROM `site_consultation_settings`;--> statement-breakpoint
DROP TABLE `site_consultation_settings`;--> statement-breakpoint
ALTER TABLE `__new_site_consultation_settings` RENAME TO `site_consultation_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `site_consultation_settings_site_id_unique` ON `site_consultation_settings` (`site_id`);--> statement-breakpoint
CREATE INDEX `site_consultation_settings_organization_id_idx` ON `site_consultation_settings` (`organization_id`);