ALTER TABLE `stripe_invoice_payments` ADD `ga4_purchase_status` text DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE `stripe_invoice_payments` ADD `ga4_purchase_event_id` text;
--> statement-breakpoint
ALTER TABLE `stripe_invoice_payments` ADD `ga4_purchase_attempt_count` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `stripe_invoice_payments` ADD `ga4_purchase_claimed_at` text;
--> statement-breakpoint
ALTER TABLE `stripe_invoice_payments` ADD `ga4_purchase_sent_at` text;
--> statement-breakpoint
ALTER TABLE `stripe_invoice_payments` ADD `ga4_purchase_error` text;
