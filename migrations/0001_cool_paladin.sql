CREATE TABLE `stripe_connected_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`stripe_account_id` text,
	`country` text NOT NULL,
	`livemode` integer NOT NULL,
	`status` text DEFAULT 'creating' NOT NULL,
	`card_payments_status` text,
	`requirements_json` text DEFAULT '[]' NOT NULL,
	`stripe_refreshed_at` text,
	`last_error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "stripe_connected_accounts_country_check" CHECK(length(country) = 2 AND country = upper(country) AND country NOT GLOB '*[^A-Z]*'),
	CONSTRAINT "stripe_connected_accounts_livemode_check" CHECK(livemode IN (0, 1)),
	CONSTRAINT "stripe_connected_accounts_status_check" CHECK(status IN ('creating', 'creation_failed', 'action_required', 'pending_review', 'restricted', 'ready')),
	CONSTRAINT "stripe_connected_accounts_capability_check" CHECK(card_payments_status IS NULL OR card_payments_status IN ('active', 'pending', 'restricted', 'unsupported')),
	CONSTRAINT "stripe_connected_accounts_requirements_check" CHECK(json_valid(requirements_json) AND json_type(requirements_json) = 'array'),
	CONSTRAINT "stripe_connected_accounts_identity_check" CHECK((stripe_account_id IS NULL AND status IN ('creating', 'creation_failed')) OR (trim(stripe_account_id) <> '' AND status IN ('action_required', 'pending_review', 'restricted', 'ready'))),
	CONSTRAINT "stripe_connected_accounts_instants_check" CHECK((stripe_refreshed_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', stripe_refreshed_at, '+0 days') IS stripe_refreshed_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stripe_connected_accounts_stripe_account_id_unique` ON `stripe_connected_accounts` (`stripe_account_id`);--> statement-breakpoint
CREATE INDEX `stripe_connected_accounts_status_idx` ON `stripe_connected_accounts` (`status`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `stripe_connected_accounts_org_unique` ON `stripe_connected_accounts` (`organization_id`);--> statement-breakpoint
DROP TABLE `legal_intake_references`;--> statement-breakpoint
DROP INDEX `stripe_webhook_events_retry_idx`;--> statement-breakpoint
ALTER TABLE `stripe_webhook_events` ADD `processor` text DEFAULT 'platform_billing' NOT NULL;--> statement-breakpoint
CREATE INDEX `stripe_webhook_events_retry_idx` ON `stripe_webhook_events` (`status`,`next_attempt_at`,`processor`);