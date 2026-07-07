CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`user_id` text,
	`stripe_customer_id` text,
	`name` text,
	`email` text,
	`email_normalized` text,
	`email_hash` text,
	`phone` text,
	`phone_normalized` text,
	`source` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`review_request_opted_out_at` text,
	`marketing_opted_out_at` text,
	`loyalty_points_balance` integer DEFAULT 0 NOT NULL,
	`last_booking_at` text,
	`last_review_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "customers_source_check" CHECK(source IN ('reservation', 'experience_booking', 'review_request', 'manual', 'stripe', 'import')),
	CONSTRAINT "customers_status_check" CHECK(status IN ('active', 'merged', 'suppressed', 'deleted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_customers_site_email_normalized_unique` ON `customers` (`site_id`,`email_normalized`) WHERE email_normalized IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_customers_stripe_customer_id_unique` ON `customers` (`stripe_customer_id`) WHERE stripe_customer_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_customers_organization_id` ON `customers` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_customers_site_id` ON `customers` (`site_id`);--> statement-breakpoint
CREATE INDEX `idx_customers_org_site_email_hash` ON `customers` (`organization_id`,`site_id`,`email_hash`);--> statement-breakpoint
CREATE INDEX `idx_customers_user_id` ON `customers` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_customers_stripe_customer_id` ON `customers` (`stripe_customer_id`);--> statement-breakpoint
ALTER TABLE `experience_bookings` ADD `customer_id` text REFERENCES customers(id);--> statement-breakpoint
ALTER TABLE `reservation_submissions` ADD `customer_id` text REFERENCES customers(id);--> statement-breakpoint
ALTER TABLE `user` ADD `isAnonymous` integer DEFAULT 0 NOT NULL;