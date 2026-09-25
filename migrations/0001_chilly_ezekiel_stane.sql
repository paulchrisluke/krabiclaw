PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`organization_id` text,
	`location_id` text,
	`customer_id` text,
	`review_id` text,
	`conversation_state` text,
	`resolved_at` text,
	`archived_at` text,
	`archived_by_user_id` text,
	`payload_json` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`archived_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`,`location_id`) REFERENCES `business_locations`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "requests_instants_check" CHECK((resolved_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', resolved_at, '+0 days') IS resolved_at) AND (archived_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', archived_at, '+0 days') IS archived_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)),
	CONSTRAINT "requests_payload_check" CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
	CONSTRAINT "requests_guest_payload_check" CHECK((json_type(payload_json, '$.guest.name') IS 'text' AND json_type(payload_json, '$.guest.email') IS 'text' AND (json_type(payload_json, '$.guest.phone') IS 'text' OR json_type(payload_json, '$.guest.phone') IS 'null'))),
	CONSTRAINT "requests_message_payload_check" CHECK(kind <> 'contact' OR json_type(payload_json, '$.message') IS 'text'),
	CONSTRAINT "requests_scope_check" CHECK(organization_id IS NOT NULL),
	CONSTRAINT "requests_state_check" CHECK(conversation_state IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_requests`("id", "kind", "organization_id", "location_id", "customer_id", "review_id", "conversation_state", "resolved_at", "archived_at", "archived_by_user_id", "payload_json", "created_at", "updated_at") SELECT "id", "kind", "organization_id", "location_id", "customer_id", "review_id", "conversation_state", "resolved_at", "archived_at", "archived_by_user_id", "payload_json", "created_at", "updated_at" FROM `requests`;--> statement-breakpoint
DROP TABLE `requests`;--> statement-breakpoint
ALTER TABLE `__new_requests` RENAME TO `requests`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `requests_review_owner_unique` ON `requests` (`organization_id`,`id`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `requests_scope_id_unique` ON `requests` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `requests_org_activity_idx` ON `requests` (`conversation_state`,`updated_at`);--> statement-breakpoint
CREATE INDEX `requests_org_kind_idx` ON `requests` (`kind`,`location_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `requests_customer_idx` ON `requests` (`customer_id`);--> statement-breakpoint
CREATE INDEX `requests_org_created_idx` ON `requests` (`organization_id`,`created_at`);