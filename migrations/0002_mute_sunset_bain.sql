CREATE TABLE `merchant_handoff_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`destination_id` text NOT NULL,
	`order_id` text NOT NULL,
	`command_version` integer DEFAULT 1 NOT NULL,
	`order_version` integer NOT NULL,
	`expected_state_version` integer NOT NULL,
	`type` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`provider_mappings_json` text NOT NULL,
	`command_snapshot_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`result_snapshot_json` text,
	`error_code` text,
	`error_message` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`destination_id`) REFERENCES `merchant_handoff_destinations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `merchant_handoff_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`,`organization_id`,`site_id`,`location_id`) REFERENCES `merchant_handoff_orders`(`id`,`organization_id`,`site_id`,`location_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`,`order_version`) REFERENCES `merchant_handoff_orders`(`id`,`order_version`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "merchant_handoff_commands_version_check" CHECK("merchant_handoff_commands"."command_version" > 0),
	CONSTRAINT "merchant_handoff_commands_order_version_check" CHECK("merchant_handoff_commands"."order_version" > 0),
	CONSTRAINT "merchant_handoff_commands_expected_state_version_check" CHECK("merchant_handoff_commands"."expected_state_version" > 0),
	CONSTRAINT "merchant_handoff_commands_type_check" CHECK("merchant_handoff_commands"."type" IN ('accept', 'deny', 'ready_time_update', 'ready', 'cancel', 'complete')),
	CONSTRAINT "merchant_handoff_commands_status_check" CHECK("merchant_handoff_commands"."status" IN ('pending', 'applied', 'denied', 'error'))
);
--> statement-breakpoint
CREATE INDEX `merchant_handoff_commands_order_created_idx` ON `merchant_handoff_commands` (`order_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_handoff_commands_destination_key_unique` ON `merchant_handoff_commands` (`destination_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `merchant_handoff_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`destination_id` text NOT NULL,
	`order_id` text NOT NULL,
	`event_version` integer DEFAULT 1 NOT NULL,
	`order_version` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`payload_snapshot_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider_status_code` integer,
	`error_code` text,
	`error_message` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`delivered_at` text,
	`failed_at` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`destination_id`) REFERENCES `merchant_handoff_destinations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `merchant_handoff_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`,`organization_id`,`site_id`,`location_id`) REFERENCES `merchant_handoff_orders`(`id`,`organization_id`,`site_id`,`location_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`,`order_version`) REFERENCES `merchant_handoff_orders`(`id`,`order_version`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "merchant_handoff_deliveries_event_version_check" CHECK("merchant_handoff_deliveries"."event_version" > 0),
	CONSTRAINT "merchant_handoff_deliveries_order_version_check" CHECK("merchant_handoff_deliveries"."order_version" > 0),
	CONSTRAINT "merchant_handoff_deliveries_status_check" CHECK("merchant_handoff_deliveries"."status" IN ('pending', 'delivered', 'failed')),
	CONSTRAINT "merchant_handoff_deliveries_terminal_time_check" CHECK(("merchant_handoff_deliveries"."status" = 'pending' AND "merchant_handoff_deliveries"."delivered_at" IS NULL AND "merchant_handoff_deliveries"."failed_at" IS NULL) OR ("merchant_handoff_deliveries"."status" = 'delivered' AND "merchant_handoff_deliveries"."delivered_at" IS NOT NULL AND "merchant_handoff_deliveries"."failed_at" IS NULL) OR ("merchant_handoff_deliveries"."status" = 'failed' AND "merchant_handoff_deliveries"."delivered_at" IS NULL AND "merchant_handoff_deliveries"."failed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `merchant_handoff_deliveries_order_created_idx` ON `merchant_handoff_deliveries` (`order_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_handoff_deliveries_order_version_unique` ON `merchant_handoff_deliveries` (`order_id`,`order_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_handoff_deliveries_order_key_unique` ON `merchant_handoff_deliveries` (`order_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `merchant_handoff_destinations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`endpoint_url` text NOT NULL,
	`oauth_client_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_location_id` text NOT NULL,
	`capabilities_json` text NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`,`site_id`,`location_id`) REFERENCES `business_locations`(`organization_id`,`site_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "merchant_handoff_destinations_version_check" CHECK("merchant_handoff_destinations"."version" > 0),
	CONSTRAINT "merchant_handoff_destinations_status_check" CHECK("merchant_handoff_destinations"."status" IN ('active', 'inactive')),
	CONSTRAINT "merchant_handoff_destinations_endpoint_url_check" CHECK("merchant_handoff_destinations"."endpoint_url" LIKE 'https://_%' OR "merchant_handoff_destinations"."endpoint_url" LIKE 'http://localhost:%' OR "merchant_handoff_destinations"."endpoint_url" LIKE 'http://127.0.0.1:%'),
	CONSTRAINT "merchant_handoff_destinations_provider_check" CHECK(length(trim("merchant_handoff_destinations"."provider")) > 0),
	CONSTRAINT "merchant_handoff_destinations_provider_location_check" CHECK(length(trim("merchant_handoff_destinations"."provider_location_id")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_handoff_destinations_one_active_location_unique` ON `merchant_handoff_destinations` (`organization_id`,`site_id`,`location_id`) WHERE status = 'active';--> statement-breakpoint
CREATE INDEX `merchant_handoff_destinations_oauth_client_idx` ON `merchant_handoff_destinations` (`oauth_client_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_handoff_destinations_scope_id_unique` ON `merchant_handoff_destinations` (`id`,`organization_id`,`site_id`,`location_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_handoff_destinations_id_version_unique` ON `merchant_handoff_destinations` (`id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_handoff_destinations_scope_version_unique` ON `merchant_handoff_destinations` (`organization_id`,`site_id`,`location_id`,`version`);--> statement-breakpoint
CREATE TABLE `merchant_handoff_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`destination_id` text NOT NULL,
	`destination_version` integer NOT NULL,
	`order_version` integer NOT NULL,
	`provider_order_id` text,
	`provider_mappings_json` text NOT NULL,
	`order_snapshot_json` text NOT NULL,
	`merchant_state` text DEFAULT 'pending' NOT NULL,
	`fulfillment_state` text DEFAULT 'unstarted' NOT NULL,
	`state_version` integer DEFAULT 1 NOT NULL,
	`ready_at` text,
	`last_command_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`destination_id`) REFERENCES `merchant_handoff_destinations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`destination_id`,`organization_id`,`site_id`,`location_id`) REFERENCES `merchant_handoff_destinations`(`id`,`organization_id`,`site_id`,`location_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`destination_id`,`destination_version`) REFERENCES `merchant_handoff_destinations`(`id`,`version`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "merchant_handoff_orders_destination_version_check" CHECK("merchant_handoff_orders"."destination_version" > 0),
	CONSTRAINT "merchant_handoff_orders_order_version_check" CHECK("merchant_handoff_orders"."order_version" > 0),
	CONSTRAINT "merchant_handoff_orders_state_version_check" CHECK("merchant_handoff_orders"."state_version" > 0),
	CONSTRAINT "merchant_handoff_orders_merchant_state_check" CHECK("merchant_handoff_orders"."merchant_state" IN ('pending', 'accepted', 'denied', 'cancelled')),
	CONSTRAINT "merchant_handoff_orders_fulfillment_state_check" CHECK("merchant_handoff_orders"."fulfillment_state" IN ('unstarted', 'preparing', 'ready', 'completed', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX `merchant_handoff_orders_location_created_idx` ON `merchant_handoff_orders` (`location_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_handoff_orders_scope_id_unique` ON `merchant_handoff_orders` (`id`,`organization_id`,`site_id`,`location_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_handoff_orders_id_version_unique` ON `merchant_handoff_orders` (`id`,`order_version`);