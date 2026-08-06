ALTER TABLE `stripe_webhook_events` ADD `claimed_at` text;--> statement-breakpoint
ALTER TABLE `stripe_webhook_events` ADD `lease_expires_at` text;--> statement-breakpoint
ALTER TABLE `stripe_webhook_events` ADD `attempt_count` integer DEFAULT 0 NOT NULL;