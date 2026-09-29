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
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "analytics_events_instants_check" CHECK((created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at)),
	CONSTRAINT "analytics_events_payload_check" CHECK(json_valid(payload_json) AND json_type(payload_json) IS 'object'),
	CONSTRAINT "analytics_events_shape_check" CHECK((kind = 'pageview' AND page_path IS NOT NULL) OR (kind = 'conversion' AND organization_id IS NOT NULL AND duration_seconds IS NULL
    AND json_type(payload_json, '$.event_name') IS 'text' AND length(payload_json ->> '$.event_name') BETWEEN 1 AND 64
    AND (payload_json ->> '$.event_name') GLOB '[a-z]*' AND (payload_json ->> '$.event_name') NOT GLOB '*[^a-z0-9_]*'
    AND json_type(payload_json, '$.stage') IS 'text' AND (payload_json ->> '$.stage') IN ('schedule_navigation', 'external_booking_handoff', 'submitted', 'external_handoff', 'completed')
    AND ((session_id IS NOT NULL AND visitor_id IS NOT NULL
        AND json_type(payload_json, '$.attribution.source') IS 'text' AND json_type(payload_json, '$.attribution.medium') IS 'text'
        AND json_type(payload_json, '$.attributed_at') IS 'text')
      OR (session_id IS NULL AND visitor_id IS NULL
        AND json_type(payload_json, '$.attribution') IS 'null' AND json_type(payload_json, '$.attributed_at') IS 'null'))))
);
--> statement-breakpoint
INSERT INTO `__new_analytics_events`("id", "kind", "organization_id", "location_id", "session_id", "visitor_id", "page_path", "duration_seconds", "payload_json", "created_at") SELECT "id", "kind", "organization_id", "location_id", "session_id", "visitor_id", "page_path", "duration_seconds", "payload_json", "created_at" FROM `analytics_events`;--> statement-breakpoint
DROP TABLE `analytics_events`;--> statement-breakpoint
ALTER TABLE `__new_analytics_events` RENAME TO `analytics_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `analytics_events_org_kind_created_idx` ON `analytics_events` (`organization_id`,`kind`,`created_at`);--> statement-breakpoint
CREATE INDEX `analytics_events_org_session_idx` ON `analytics_events` (`organization_id`,`kind`,`session_id`);--> statement-breakpoint
CREATE INDEX `analytics_events_org_visitor_idx` ON `analytics_events` (`organization_id`,`kind`,`visitor_id`);--> statement-breakpoint
CREATE INDEX `analytics_events_conversion_name_idx` ON `analytics_events` (`kind`,(payload_json ->> '$.event_name'),`created_at`);--> statement-breakpoint
CREATE INDEX `analytics_events_conversion_entity_idx` ON `analytics_events` (`organization_id`,(payload_json ->> '$.entity_type'),(payload_json ->> '$.entity_id')) WHERE kind = 'conversion';--> statement-breakpoint
CREATE UNIQUE INDEX `analytics_events_conversion_entity_unique` ON `analytics_events` (`organization_id`,(payload_json ->> '$.event_name'),(payload_json ->> '$.entity_type'),(payload_json ->> '$.entity_id')) WHERE kind = 'conversion' AND (payload_json ->> '$.entity_type') IS NOT NULL AND (payload_json ->> '$.entity_id') IS NOT NULL AND (payload_json ->> '$.event_name') IN ('contact_submit', 'reservation_submit', 'booking_submit', 'sign_up', 'onboarding_complete', 'purchase', 'refund');