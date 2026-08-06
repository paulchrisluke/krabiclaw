ALTER TABLE `organization_billing` ADD `past_due_since` text;
--> statement-breakpoint
ALTER TABLE `site_billing` ADD `past_due_since` text;
--> statement-breakpoint
CREATE TABLE `stripe_invoice_payments` (
  `stripe_invoice_id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL REFERENCES `organization`(`id`) ON DELETE CASCADE,
  `stripe_subscription_id` text NOT NULL,
  `base_plan_price_id` text,
  `status` text NOT NULL,
  `period_start` text,
  `period_end` text,
  `past_due_since` text,
  `last_event_created` integer NOT NULL,
  `last_event_id` text NOT NULL,
  `updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
--> statement-breakpoint
CREATE INDEX `stripe_invoice_payments_organization_idx` ON `stripe_invoice_payments` (`organization_id`, `period_end`);
--> statement-breakpoint
CREATE INDEX `stripe_invoice_payments_subscription_idx` ON `stripe_invoice_payments` (`stripe_subscription_id`, `period_end`);
--> statement-breakpoint
-- Preserve known coverage while moving the projection source to the invoice
-- ledger. Rows without a paid-through boundary remain deliberately unknown.
INSERT INTO `stripe_invoice_payments`
  (`stripe_invoice_id`, `organization_id`, `stripe_subscription_id`, `base_plan_price_id`, `status`, `period_end`, `last_event_created`, `last_event_id`)
SELECT
  COALESCE(NULLIF(`last_paid_invoice_id`, ''), 'legacy-org:' || `organization_id`),
  `organization_id`,
  COALESCE(NULLIF(`stripe_subscription_id`, ''), 'legacy-subscription:' || `organization_id`),
  'legacy',
  'paid',
  `paid_through`,
  COALESCE(`last_payment_event_created`, 0),
  COALESCE(NULLIF(`last_payment_event_id`, ''), 'legacy')
FROM `organization_billing`
WHERE `payment_status` IN ('paid', 'past_due') AND `paid_through` IS NOT NULL;
--> statement-breakpoint
UPDATE `organization_billing`
   SET `payment_status` = 'unknown',
       `paid_through` = NULL,
       `past_due_since` = NULL,
       `last_paid_invoice_id` = NULL
 WHERE `payment_status` = 'paid' AND `paid_through` IS NULL;
--> statement-breakpoint
UPDATE `site_billing`
   SET `payment_status` = 'unknown',
       `paid_through` = NULL,
       `past_due_since` = NULL,
       `last_paid_invoice_id` = NULL
 WHERE `payment_status` = 'paid' AND `paid_through` IS NULL;
