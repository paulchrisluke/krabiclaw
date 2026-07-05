ALTER TABLE `platform_contact_submissions` ADD `topic` text;--> statement-breakpoint
ALTER TABLE `platform_contact_submissions` ADD `source` text DEFAULT 'contact_page' NOT NULL;--> statement-breakpoint
ALTER TABLE `platform_contact_submissions` ADD `route_context` text;--> statement-breakpoint
ALTER TABLE `platform_contact_submissions` ADD `suggested_summary` text;--> statement-breakpoint
ALTER TABLE `platform_contact_submissions` ADD `agent_metadata_json` text;