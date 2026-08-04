DROP TABLE IF EXISTS `__new_site_billing`;--> statement-breakpoint
CREATE TABLE `__new_site_billing` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`stripe_subscription_id` text,
	`stripe_subscription_item_id` text,
	`plan` text DEFAULT 'free' NOT NULL,
	`status` text DEFAULT 'free' NOT NULL,
	`current_period_end` text,
	`cancel_at_period_end` numeric DEFAULT false,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`stripe_customer_id` text,
	`payment_method` text DEFAULT 'stripe' NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `site_billing_site_id_unique` UNIQUE(`site_id`),
	CONSTRAINT `site_billing_stripe_subscription_id_unique` UNIQUE(`stripe_subscription_id`),
	CONSTRAINT `site_billing_stripe_subscription_item_id_unique` UNIQUE(`stripe_subscription_item_id`)
);--> statement-breakpoint
INSERT INTO `__new_site_billing` (
	`id`, `site_id`, `organization_id`, `stripe_subscription_id`, `stripe_subscription_item_id`,
	`plan`, `status`, `current_period_end`, `cancel_at_period_end`, `updated_at`,
	`stripe_customer_id`, `payment_method`
)
SELECT
	`id`, `site_id`, `organization_id`, `stripe_subscription_id`, `stripe_subscription_item_id`,
	`plan`, `status`, `current_period_end`, `cancel_at_period_end`, `updated_at`,
	`stripe_customer_id`, `payment_method`
FROM `site_billing`;--> statement-breakpoint
DROP TABLE `site_billing`;--> statement-breakpoint
ALTER TABLE `__new_site_billing` RENAME TO `site_billing`;--> statement-breakpoint
CREATE INDEX `idx_site_billing_org` ON `site_billing` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_site_billing_subscription` ON `site_billing` (`stripe_subscription_id`) WHERE `stripe_subscription_id` IS NOT NULL;
