PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_analytics_events` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`organization_id` text,
	`location_id` text,
	`session_id` text,
	`visitor_id` text,
	`page_path` text,
	`duration_seconds` integer,
	`payload_json` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`received_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "analytics_events_instants_check" CHECK((created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (received_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', received_at, '+0 days') IS received_at)),
	CONSTRAINT "analytics_events_payload_check" CHECK(json_valid(payload_json) AND json_type(payload_json) IS 'object'),
	CONSTRAINT "analytics_events_shape_check" CHECK((kind = 'pageview' AND page_path IS NOT NULL) OR (kind IN ('conversion', 'interaction') AND organization_id IS NOT NULL AND duration_seconds IS NULL
    AND json_type(payload_json, '$.event_name') IS 'text' AND length(payload_json ->> '$.event_name') BETWEEN 1 AND 64
    AND (payload_json ->> '$.event_name') GLOB '[a-z]*' AND (payload_json ->> '$.event_name') NOT GLOB '*[^a-z0-9_]*'
    AND json_type(payload_json, '$.stage') IS 'text' AND (payload_json ->> '$.stage') IN ('schedule_navigation', 'external_booking_handoff', 'submitted', 'external_handoff', 'completed', 'viewed', 'started', 'occurred')
    AND ((session_id IS NULL) = (visitor_id IS NULL))
    AND ((json_type(payload_json, '$.attribution.source') IS 'text' AND json_type(payload_json, '$.attribution.medium') IS 'text' AND json_type(payload_json, '$.attributed_at') IS 'text')
      OR (session_id IS NULL AND json_type(payload_json, '$.attribution') IS 'null' AND json_type(payload_json, '$.attributed_at') IS 'null'))))
);
--> statement-breakpoint
INSERT INTO `__new_analytics_events`("id", "kind", "organization_id", "location_id", "session_id", "visitor_id", "page_path", "duration_seconds", "payload_json", "created_at", "received_at") SELECT "id", "kind", "organization_id", "location_id", "session_id", "visitor_id", "page_path", "duration_seconds", "payload_json", "created_at", "created_at" FROM `analytics_events`;--> statement-breakpoint
-- Handoff clicks are interactions, not conversions: history keeps them, under their own kind.
UPDATE `__new_analytics_events` SET `kind` = 'interaction' WHERE `kind` = 'conversion' AND json_extract(`payload_json`, '$.event_name') IN ('consultation_cta_click', 'product_order_external_click', 'link_click', 'donation_click');--> statement-breakpoint
DROP TABLE `analytics_events`;--> statement-breakpoint
ALTER TABLE `__new_analytics_events` RENAME TO `analytics_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `analytics_events_org_kind_created_idx` ON `analytics_events` (`organization_id`,`kind`,`created_at`);--> statement-breakpoint
CREATE INDEX `analytics_events_org_received_idx` ON `analytics_events` (`organization_id`,`received_at`);--> statement-breakpoint
CREATE INDEX `analytics_events_org_session_idx` ON `analytics_events` (`organization_id`,`kind`,`session_id`);--> statement-breakpoint
CREATE INDEX `analytics_events_org_visitor_idx` ON `analytics_events` (`organization_id`,`kind`,`visitor_id`);--> statement-breakpoint
CREATE INDEX `analytics_events_conversion_name_idx` ON `analytics_events` (`kind`,(payload_json ->> '$.event_name'),`created_at`);--> statement-breakpoint
CREATE INDEX `analytics_events_conversion_entity_idx` ON `analytics_events` (`organization_id`,(payload_json ->> '$.entity_type'),(payload_json ->> '$.entity_id')) WHERE kind IN ('conversion', 'interaction');--> statement-breakpoint
CREATE UNIQUE INDEX `analytics_events_conversion_entity_unique` ON `analytics_events` (`organization_id`,(payload_json ->> '$.event_name'),(payload_json ->> '$.entity_type'),(payload_json ->> '$.entity_id')) WHERE kind = 'conversion' AND (payload_json ->> '$.entity_type') IS NOT NULL AND (payload_json ->> '$.entity_id') IS NOT NULL AND (payload_json ->> '$.event_name') IN ('contact_submit', 'reservation_submit', 'booking_submit', 'sign_up', 'onboarding_complete', 'purchase', 'refund');--> statement-breakpoint
CREATE TABLE `__new_stripe_ga4_subscription_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`stripe_subscription_id` text,
	`action` text NOT NULL,
	`attribution_json` text,
	`client_id` text,
	`session_id` text,
	`session_captured_at` integer,
	`previous_price_id` text,
	`new_price_id` text,
	`effective_timing` text DEFAULT 'immediate' NOT NULL,
	`source` text DEFAULT 'browser' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`lifecycle_sent_at` text,
	`consumed_at` text,
	`consumed_event_id` text,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "stripe_ga4_subscription_intents_attribution_check" CHECK(attribution_json IS NULL OR (json_valid(attribution_json) AND json_type(attribution_json) IS 'object')),
	CONSTRAINT "stripe_ga4_subscription_intents_instants_check" CHECK((lifecycle_sent_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', lifecycle_sent_at, '+0 days') IS lifecycle_sent_at) AND (consumed_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', consumed_at, '+0 days') IS consumed_at) AND (expires_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', expires_at, '+0 days') IS expires_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at))
);
--> statement-breakpoint
INSERT INTO `__new_stripe_ga4_subscription_intents`("id", "organization_id", "user_id", "stripe_subscription_id", "action", "client_id", "session_id", "session_captured_at", "previous_price_id", "new_price_id", "effective_timing", "source", "status", "lifecycle_sent_at", "consumed_at", "consumed_event_id", "expires_at", "created_at", "updated_at") SELECT "id", "organization_id", "user_id", "stripe_subscription_id", "action", "client_id", "session_id", "session_captured_at", "previous_price_id", "new_price_id", "effective_timing", "source", "status", "lifecycle_sent_at", "consumed_at", "consumed_event_id", "expires_at", "created_at", "updated_at" FROM `stripe_ga4_subscription_intents`;--> statement-breakpoint
DROP TABLE `stripe_ga4_subscription_intents`;--> statement-breakpoint
ALTER TABLE `__new_stripe_ga4_subscription_intents` RENAME TO `stripe_ga4_subscription_intents`;--> statement-breakpoint
CREATE INDEX `stripe_ga4_subscription_intents_subscription_idx` ON `stripe_ga4_subscription_intents` (`stripe_subscription_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `stripe_ga4_subscription_intents_organization_idx` ON `stripe_ga4_subscription_intents` (`organization_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `stripe_ga4_subscription_intents_expiry_idx` ON `stripe_ga4_subscription_intents` (`status`,`expires_at`);