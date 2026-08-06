DROP TABLE IF EXISTS `translation_job_items`;--> statement-breakpoint
DROP TABLE IF EXISTS `translation_jobs`;--> statement-breakpoint
DROP TABLE IF EXISTS `tenant_page_translation_fields`;--> statement-breakpoint
DELETE FROM `site_entitlements` WHERE `key` IN ('translation', 'translation_languages');--> statement-breakpoint
DELETE FROM `organization_entitlements` WHERE `key` IN ('translation', 'translation_languages');
