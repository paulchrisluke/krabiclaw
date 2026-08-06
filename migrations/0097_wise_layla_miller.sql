ALTER TABLE `organization_billing` ADD `last_payment_event_created` integer;--> statement-breakpoint
ALTER TABLE `organization_billing` ADD `last_payment_event_id` text;--> statement-breakpoint
ALTER TABLE `site_billing` ADD `last_payment_event_created` integer;--> statement-breakpoint
ALTER TABLE `site_billing` ADD `last_payment_event_id` text;