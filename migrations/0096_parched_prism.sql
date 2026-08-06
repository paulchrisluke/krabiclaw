CREATE TABLE `stripe_subscription_versions` (
	`stripe_subscription_id` text PRIMARY KEY NOT NULL,
	`last_event_created` integer NOT NULL,
	`last_event_id` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `organization_billing` ADD `payment_status` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `organization_billing` ADD `paid_through` text;--> statement-breakpoint
ALTER TABLE `organization_billing` ADD `last_paid_invoice_id` text;--> statement-breakpoint
ALTER TABLE `site_billing` ADD `payment_status` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `site_billing` ADD `paid_through` text;--> statement-breakpoint
ALTER TABLE `site_billing` ADD `last_paid_invoice_id` text;--> statement-breakpoint
ALTER TABLE `stripe_webhook_events` ADD `claim_token` text;--> statement-breakpoint
ALTER TABLE `stripe_webhook_events` ADD `next_attempt_at` text;--> statement-breakpoint
ALTER TABLE `stripe_webhook_events` ADD `dead_lettered_at` text;
--> statement-breakpoint
UPDATE organization_billing
SET payment_status = CASE
  WHEN status = 'active' THEN 'paid'
  WHEN status = 'trialing' THEN 'trialing'
  ELSE payment_status
END
WHERE status IN ('active', 'trialing');
--> statement-breakpoint
UPDATE site_billing
SET payment_status = CASE
  WHEN status = 'active' THEN 'paid'
  WHEN status = 'trialing' THEN 'trialing'
  ELSE payment_status
END
WHERE status IN ('active', 'trialing');
