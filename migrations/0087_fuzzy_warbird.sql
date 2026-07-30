ALTER TABLE `site_domains` ADD `validation_strategy` text DEFAULT 'http_auto' NOT NULL;--> statement-breakpoint
ALTER TABLE `site_domains` ADD `certificate_last_active_at` text;--> statement-breakpoint
ALTER TABLE `site_domains` ADD `renewal_issue_started_at` text;--> statement-breakpoint
ALTER TABLE `site_domains` ADD `renewal_notification_sent_at` text;--> statement-breakpoint
ALTER TABLE `site_domains` ADD `certificate_expires_at` text;