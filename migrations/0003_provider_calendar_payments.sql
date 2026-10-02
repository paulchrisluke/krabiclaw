CREATE TABLE `google_calendar_cleanup_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`account_id` text NOT NULL,
	`calendar_id` text NOT NULL,
	`event_id` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`next_attempt_at` text,
	`lease_token` text,
	`lease_until` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "google_calendar_cleanup_state_check" CHECK(state IN ('pending', 'error', 'deleted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_calendar_cleanup_provider_unique` ON `google_calendar_cleanup_jobs` (`calendar_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `google_calendar_cleanup_due_idx` ON `google_calendar_cleanup_jobs` (`state`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `google_calendar_event_links` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`integration_revision` text NOT NULL,
	`account_id` text NOT NULL,
	`calendar_id` text NOT NULL,
	`event_id` text NOT NULL,
	`booking_kind` text NOT NULL,
	`operational_id` text NOT NULL,
	`request_id` text,
	`booking_revision` text NOT NULL,
	`synced_revision` text,
	`state` text DEFAULT 'pending' NOT NULL,
	`last_error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text,
	`lease_token` text,
	`lease_until` text,
	`last_synced_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "google_calendar_kind_check" CHECK(booking_kind IN ('booking', 'reservation')),
	CONSTRAINT "google_calendar_state_check" CHECK(state IN ('pending', 'synced', 'cleanup', 'deleted', 'error'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_calendar_subject_unique` ON `google_calendar_event_links` (`organization_id`,`integration_revision`,`booking_kind`,`operational_id`) WHERE state <> 'deleted';--> statement-breakpoint
CREATE UNIQUE INDEX `google_calendar_provider_unique` ON `google_calendar_event_links` (`calendar_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `google_calendar_due_idx` ON `google_calendar_event_links` (`organization_id`,`state`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `member_scheduling` (
	`member_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`timezone` text NOT NULL,
	`weekly_json` text NOT NULL,
	`time_off_json` text NOT NULL,
	`windows_json` text NOT NULL,
	`windows_until` text NOT NULL,
	`public_name` text,
	`public_photo_url` text,
	`public_bio` text,
	`public_approved` integer DEFAULT 0 NOT NULL,
	`calendar_account_id` text,
	`calendar_ids_json` text DEFAULT '[]' NOT NULL,
	`calendar_revision` text NOT NULL,
	`busy_json` text DEFAULT '[]' NOT NULL,
	`busy_from` text,
	`busy_until` text,
	`busy_checked_at` text,
	`busy_error` text,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `member_scheduling_org_idx` ON `member_scheduling` (`organization_id`);--> statement-breakpoint
CREATE TABLE `payment_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`stripe_checkout_id` text,
	`checkout_url` text,
	`return_token` text NOT NULL,
	`status` text DEFAULT 'creating' NOT NULL,
	`expires_at` text NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_attempts_idempotency_key_unique` ON `payment_attempts` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `payment_authorizations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text,
	`payment_id` text NOT NULL,
	`action` text NOT NULL,
	`amount` integer NOT NULL,
	`expires_at` text NOT NULL,
	`approved_at` text,
	`consumed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `payment_billing_accounts` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`stripe_billing_customer_id` text NOT NULL,
	`metronome_customer_id` text,
	`metronome_contract_id` text,
	`contract_start_at` text NOT NULL,
	`currency` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payment_checkout_holds` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`price_id` text NOT NULL,
	`session_id` text NOT NULL,
	`assigned_member_id` text,
	`buyer_user_id` text,
	`request_id` text,
	`payment_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`calendar_group` text,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`converted_booking_id` text,
	FOREIGN KEY (`buyer_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "payment_holds_quantity_check" CHECK(quantity > 0 AND amount > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_checkout_holds_payment_id_unique` ON `payment_checkout_holds` (`payment_id`);--> statement-breakpoint
CREATE INDEX `payment_holds_capacity_idx` ON `payment_checkout_holds` (`session_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `payment_holds_calendar_idx` ON `payment_checkout_holds` (`organization_id`,`calendar_group`,`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `payment_claims` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`claimed_at` text,
	`claimed_user_id` text,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`claimed_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `payment_cost_snapshots` (
	`source_id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`payment_id` text,
	`incurred_by` text NOT NULL,
	`currency` text NOT NULL,
	`amount` integer NOT NULL,
	`incurred_at` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `payment_disputes` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`stripe_dispute_id` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`evidence_due_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_disputes_provider_unique` ON `payment_disputes` (`payment_id`,`stripe_dispute_id`);--> statement-breakpoint
CREATE TABLE `payment_fee_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`stripe_report_id` text,
	`livemode` integer NOT NULL,
	`interval_start` integer NOT NULL,
	`interval_end` integer NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payment_order_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`price_id` text NOT NULL,
	`title` text NOT NULL,
	`unit_amount` integer NOT NULL,
	`quantity` integer NOT NULL,
	`currency` text NOT NULL,
	`tax_behavior` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `payment_orders`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "payment_order_lines_amount_check" CHECK(unit_amount >= 0 AND quantity > 0)
);
--> statement-breakpoint
CREATE TABLE `payment_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`buyer_user_id` text,
	`payment_id` text NOT NULL,
	`fulfillment_status` text DEFAULT 'unfulfilled' NOT NULL,
	`currency` text NOT NULL,
	`amount` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`buyer_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_orders_payment_id_unique` ON `payment_orders` (`payment_id`);--> statement-breakpoint
CREATE TABLE `payment_refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`stripe_refund_id` text,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`attempted_at` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "payment_refunds_amount_check" CHECK(amount > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_refunds_idempotency_key_unique` ON `payment_refunds` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_refunds_provider_unique` ON `payment_refunds` (`payment_id`,`stripe_refund_id`);--> statement-breakpoint
CREATE TABLE `payment_servicing_tenants` (
	`organization_id` text NOT NULL,
	`stripe_account_id` text NOT NULL,
	`livemode` integer NOT NULL,
	`retained_at` text NOT NULL,
	PRIMARY KEY(`stripe_account_id`, `livemode`)
);
--> statement-breakpoint
CREATE TABLE `payment_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`payment_id` text,
	`kind` text NOT NULL,
	`currency` text NOT NULL,
	`amount` integer NOT NULL,
	`source_id` text NOT NULL,
	`provider_occurred_at` text NOT NULL,
	`delivery_at` text,
	`error` text,
	`billing_timestamp` text,
	`credit_note_id` text,
	`dead_letter_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_usage_events_source_id_unique` ON `payment_usage_events` (`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_usage_events_credit_note_id_unique` ON `payment_usage_events` (`credit_note_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`buyer_user_id` text,
	`stripe_account_id` text NOT NULL,
	`livemode` integer NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text,
	`location_id` text,
	`currency` text NOT NULL,
	`amount` integer NOT NULL,
	`price_snapshot_json` text NOT NULL,
	`tax_amount` integer DEFAULT 0 NOT NULL,
	`captured_amount` integer DEFAULT 0 NOT NULL,
	`refunded_amount` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`stripe_payment_intent_id` text,
	`stripe_charge_id` text,
	`receipt_url` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`buyer_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "payments_amounts_check" CHECK(amount >= 0 AND captured_amount >= 0 AND refunded_amount >= 0 AND refunded_amount <= captured_amount),
	CONSTRAINT "payments_currency_check" CHECK(length(currency) = 3 AND currency = upper(currency))
);
--> statement-breakpoint
CREATE INDEX `payments_tenant_created_idx` ON `payments` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payments_buyer_idx` ON `payments` (`buyer_user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_provider_unique` ON `payments` (`stripe_account_id`,`livemode`,`stripe_payment_intent_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_organization_integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`provider` text NOT NULL,
	`account_id` text NOT NULL,
	`target_id` text NOT NULL,
	`target_name` text NOT NULL,
	`measurement_id` text,
	`verified` integer,
	`verification_token` text,
	`calendar_group` text,
	`include_reservations` integer,
	`status` text,
	`last_error` text,
	`revision` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "organization_integrations_provider_check" CHECK(provider IN ('facebook', 'instagram', 'google_analytics', 'google_search_console', 'google_calendar')),
	CONSTRAINT "organization_integrations_values_check" CHECK(trim(account_id) <> '' AND trim(target_id) <> '' AND trim(target_name) <> '' AND trim(revision) <> ''),
	CONSTRAINT "organization_integrations_measurement_check" CHECK((provider = 'google_analytics') = (measurement_id IS NOT NULL)),
	CONSTRAINT "organization_integrations_verification_check" CHECK((provider = 'google_search_console') = (verified IS NOT NULL) AND (verification_token IS NULL OR provider = 'google_search_console') AND (verified IS NULL OR verified IN (0, 1))),
	CONSTRAINT "organization_integrations_calendar_check" CHECK((provider = 'google_calendar') = (include_reservations IS NOT NULL AND status IS NOT NULL) AND (include_reservations IS NULL OR include_reservations IN (0, 1)) AND (status IS NULL OR status IN ('active', 'disabled', 'error')) AND (provider = 'google_calendar' OR (calendar_group IS NULL AND include_reservations IS NULL AND status IS NULL AND last_error IS NULL))),
	CONSTRAINT "organization_integrations_instants_check" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)
);
--> statement-breakpoint
INSERT INTO `__new_organization_integrations`("id", "organization_id", "provider", "account_id", "target_id", "target_name", "measurement_id", "verified", "verification_token", "revision", "created_at", "updated_at") SELECT "id", "organization_id", "provider", "account_id", "target_id", "target_name", "measurement_id", "verified", "verification_token", "revision", "created_at", "updated_at" FROM `organization_integrations`;--> statement-breakpoint
DROP TABLE `organization_integrations`;--> statement-breakpoint
ALTER TABLE `__new_organization_integrations` RENAME TO `organization_integrations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `organization_integrations_account_idx` ON `organization_integrations` (`provider`,`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_integrations_provider_unique` ON `organization_integrations` (`organization_id`,`provider`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_integrations_target_unique` ON `organization_integrations` (`provider`,`target_id`);--> statement-breakpoint
ALTER TABLE `bookings` ADD `assigned_member_id` text;--> statement-breakpoint
ALTER TABLE `product_booking_configs` ADD `scheduling_mode` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `product_booking_configs` ADD `assigned_member_id` text;--> statement-breakpoint
ALTER TABLE `product_sessions` ADD `assigned_member_id` text;
