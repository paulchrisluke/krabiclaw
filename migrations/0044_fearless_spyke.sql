PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	FOREIGN KEY (`privacy_page_id`) REFERENCES `tenant_pages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`terms_page_id`) REFERENCES `tenant_pages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`notice_page_id`) REFERENCES `tenant_pages`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "tenant_compliance_address_visibility_check" CHECK(address_visibility IN ('visible', 'hidden'))
);
--> statement-breakpoint
INSERT INTO `__new_tenant_compliance`("id", "organization_id", "site_id", "entity_name", "dba_name", "entity_type", "nonprofit_status", "registration_number", "service_area", "service_area_type", "disclaimer", "footer_disclaimer", "privacy_page_id", "terms_page_id", "notice_page_id", "document_asset_ids", "founder_name", "founding_date", "same_as", "contact_points", "address_visibility", "metadata_json", "created_at", "updated_at", "updated_by") SELECT "id", "organization_id", "site_id", "entity_name", "dba_name", "entity_type", "nonprofit_status", "registration_number", "service_area", "service_area_type", "disclaimer", "footer_disclaimer", "privacy_page_id", "terms_page_id", "notice_page_id", "document_asset_ids", "founder_name", "founding_date", "same_as", "contact_points", "address_visibility", "metadata_json", "created_at", "updated_at", "updated_by" FROM `tenant_compliance`;--> statement-breakpoint
DROP TABLE `tenant_compliance`;--> statement-breakpoint
ALTER TABLE `__new_tenant_compliance` RENAME TO `tenant_compliance`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_compliance_site_id_unique` ON `tenant_compliance` (`site_id`);