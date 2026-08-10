ALTER TABLE `organization_billing` ADD `ga_client_id` text;
--> statement-breakpoint
ALTER TABLE `organization_billing` ADD `ga_user_id` text REFERENCES `user`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
CREATE TABLE `stripe_ga4_subscription_intents` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL REFERENCES `organization`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `stripe_subscription_id` text,
  `action` text NOT NULL,
  `site_id` text REFERENCES `sites`(`id`) ON DELETE SET NULL,
  `client_id` text,
  `session_id` text,
  `session_captured_at` integer,
  `previous_price_id` text,
  `new_price_id` text,
  `effective_timing` text NOT NULL DEFAULT 'immediate',
  `source` text NOT NULL DEFAULT 'browser',
  `status` text NOT NULL DEFAULT 'pending',
  `lifecycle_sent_at` text,
  `consumed_at` text,
  `consumed_event_id` text,
  `expires_at` text NOT NULL,
  `created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  `updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT `stripe_ga4_subscription_intents_action_check`
    CHECK (`action` IN ('initial_subscription', 'upgrade', 'downgrade')),
  CONSTRAINT `stripe_ga4_subscription_intents_status_check`
    CHECK (`status` IN ('pending', 'consumed', 'expired')),
  CONSTRAINT `stripe_ga4_subscription_intents_timing_check`
    CHECK (`effective_timing` IN ('immediate', 'period_end'))
);
--> statement-breakpoint
CREATE INDEX `stripe_ga4_subscription_intents_subscription_idx`
  ON `stripe_ga4_subscription_intents` (`stripe_subscription_id`, `status`, `created_at`);
--> statement-breakpoint
CREATE INDEX `stripe_ga4_subscription_intents_organization_idx`
  ON `stripe_ga4_subscription_intents` (`organization_id`, `status`, `created_at`);
--> statement-breakpoint
CREATE INDEX `stripe_ga4_subscription_intents_expiry_idx`
  ON `stripe_ga4_subscription_intents` (`status`, `expires_at`);
