CREATE TABLE `stripe_credit_topups` (
	`checkout_session_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`credits` integer NOT NULL,
	`processed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stripe_credit_topups_organization_id_idx` ON `stripe_credit_topups` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_stripeCustomerId_unique` ON `organization` (`stripeCustomerId`);