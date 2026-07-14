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
INSERT INTO `__new_tenant_compliance`("id", "organization_id", "site_id", "entity_name", "dba_name", "entity_type", "nonprofit_status", "registration_number", "service_area", "service_area_type", "disclaimer", "footer_disclaimer", "privacy_page_id", "terms_page_id", "notice_page_id", "document_asset_ids", "founder_name", "founding_date", "same_as", "contact_points", "address_visibility", "metadata_json", "created_at", "updated_at", "updated_by")
SELECT "id", "organization_id", "site_id", "entity_name", "dba_name", "entity_type",
	CASE
		WHEN "nonprofit_status" IS NULL OR trim("nonprofit_status") = '' THEN NULL
		WHEN lower(replace(replace(replace(replace(trim("nonprofit_status"), ' ', ''), '(', ''), ')', ''), '.', '')) IN ('501c1', '501c2', '501c3', '501c4', '501c5', '501c6', '501c7', '501c8', '501c9', '501c10', '501c11', '501c12', '501c13', '501c14', '501c15', '501c16', '501c17', '501c18', '501c19', '501c20', '501c21', '501c22', '501c23', '501c24', '501c25', '501c26', '501c27', '501c28', '501c29')
			THEN 'https://schema.org/Nonprofit501c' || substr(lower(replace(replace(replace(replace(trim("nonprofit_status"), ' ', ''), '(', ''), ')', ''), '.', '')), 5)
		WHEN "nonprofit_status" IN ('https://schema.org/NonprofitANBI', 'https://schema.org/NonprofitSBBI') THEN "nonprofit_status"
		WHEN substr("nonprofit_status", 1, 32) = 'https://schema.org/Nonprofit501c'
			AND substr("nonprofit_status", 33) IN ('1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29')
			THEN "nonprofit_status"
		ELSE NULL
	END,
	"registration_number", "service_area", NULL, "disclaimer", "footer_disclaimer",
	"privacy_page_id", "terms_page_id", "notice_page_id", "document_asset_ids",
	NULL, NULL, '[]', '[]', 'hidden', "metadata_json", "created_at", "updated_at", "updated_by"
FROM `tenant_compliance`;--> statement-breakpoint
DROP TABLE `tenant_compliance`;--> statement-breakpoint
ALTER TABLE `__new_tenant_compliance` RENAME TO `tenant_compliance`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_compliance_site_id_unique` ON `tenant_compliance` (`site_id`);
