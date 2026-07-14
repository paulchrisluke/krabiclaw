CREATE TABLE `customer_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`email_at_claim` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`token_hash` text,
	`token_expires_at` integer,
	`verified_at` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "customer_claims_status_check" CHECK(status IN ('pending', 'verified', 'expired', 'rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_customer_claims_customer_user_unique` ON `customer_claims` (`customer_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_customer_claims_user_id` ON `customer_claims` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_customer_claims_customer_id` ON `customer_claims` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_customer_claims_token_hash` ON `customer_claims` (`token_hash`);