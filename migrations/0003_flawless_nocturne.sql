CREATE TABLE `inventory_authorities` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`authority_type` text NOT NULL,
	`provider` text,
	`oauth_client_id` text,
	`provider_account_reference` text,
	`external_location_reference` text,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`location_id`) REFERENCES `business_locations`(`organization_id`,`site_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "inventory_authorities_type_check" CHECK("inventory_authorities"."authority_type" IN ('krabiclaw', 'external')),
	CONSTRAINT "inventory_authorities_configuration_check" CHECK((
		"inventory_authorities"."authority_type" = 'krabiclaw'
		AND "inventory_authorities"."provider" IS NULL
		AND "inventory_authorities"."oauth_client_id" IS NULL
		AND "inventory_authorities"."provider_account_reference" IS NULL
		AND "inventory_authorities"."external_location_reference" IS NULL
	) OR (
		"inventory_authorities"."authority_type" = 'external'
		AND "inventory_authorities"."provider" IS NOT NULL AND trim("inventory_authorities"."provider") <> ''
		AND "inventory_authorities"."oauth_client_id" IS NOT NULL AND trim("inventory_authorities"."oauth_client_id") <> ''
		AND "inventory_authorities"."provider_account_reference" IS NOT NULL AND trim("inventory_authorities"."provider_account_reference") <> ''
		AND "inventory_authorities"."external_location_reference" IS NOT NULL AND trim("inventory_authorities"."external_location_reference") <> ''
	))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_authorities_location_unique` ON `inventory_authorities` (`organization_id`,`site_id`,`location_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_authorities_scope_id_unique` ON `inventory_authorities` (`organization_id`,`site_id`,`location_id`,`id`);--> statement-breakpoint
CREATE TABLE `inventory_external_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`authority_id` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`requested_product_id` text NOT NULL,
	`product_id` text,
	`resource_version` integer NOT NULL,
	`quantity_on_hand` integer NOT NULL,
	`valid_until` text NOT NULL,
	`oauth_client_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`received_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`authority_id`) REFERENCES `inventory_authorities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`,`site_id`,`location_id`,`authority_id`) REFERENCES `inventory_authorities`(`organization_id`,`site_id`,`location_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "inventory_external_events_version_quantity_check" CHECK("inventory_external_events"."resource_version" >= 0 AND "inventory_external_events"."quantity_on_hand" >= 0),
	CONSTRAINT "inventory_external_events_payload_check" CHECK(json_valid("inventory_external_events"."payload_json") AND json_type("inventory_external_events"."payload_json") = 'object')
);
--> statement-breakpoint
CREATE INDEX `inventory_external_events_product_version_idx` ON `inventory_external_events` (`site_id`,`location_id`,`requested_product_id`,`resource_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_external_events_provider_event_unique` ON `inventory_external_events` (`authority_id`,`provider_event_id`);--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`product_id` text NOT NULL,
	`authority_id` text NOT NULL,
	`quantity_on_hand` integer DEFAULT 0 NOT NULL,
	`quantity_reserved` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`source_version` integer,
	`valid_until` text,
	`state` text DEFAULT 'unresolved' NOT NULL,
	`last_external_event_id` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`authority_id`) REFERENCES `inventory_authorities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`location_id`,`product_id`) REFERENCES `products`(`organization_id`,`site_id`,`location_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`location_id`,`authority_id`) REFERENCES `inventory_authorities`(`organization_id`,`site_id`,`location_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "inventory_items_quantity_check" CHECK("inventory_items"."quantity_on_hand" >= 0 AND "inventory_items"."quantity_reserved" >= 0 AND "inventory_items"."quantity_reserved" <= "inventory_items"."quantity_on_hand"),
	CONSTRAINT "inventory_items_revision_check" CHECK("inventory_items"."revision" >= 0 AND ("inventory_items"."source_version" IS NULL OR "inventory_items"."source_version" >= 0)),
	CONSTRAINT "inventory_items_state_check" CHECK("inventory_items"."state" IN ('current', 'unresolved'))
);
--> statement-breakpoint
CREATE INDEX `inventory_items_location_state_idx` ON `inventory_items` (`site_id`,`location_id`,`state`,`valid_until`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_items_product_unique` ON `inventory_items` (`organization_id`,`site_id`,`location_id`,`product_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_items_scope_id_unique` ON `inventory_items` (`organization_id`,`site_id`,`location_id`,`id`);--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`product_id` text NOT NULL,
	`inventory_item_id` text NOT NULL,
	`authority_id` text NOT NULL,
	`movement_type` text NOT NULL,
	`quantity_on_hand_delta` integer NOT NULL,
	`quantity_reserved_delta` integer NOT NULL,
	`resulting_quantity_on_hand` integer NOT NULL,
	`resulting_quantity_reserved` integer NOT NULL,
	`base_revision` integer NOT NULL,
	`resulting_revision` integer NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text NOT NULL,
	`reference_type` text,
	`reference_id` text,
	`idempotency_key` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`authority_id`) REFERENCES `inventory_authorities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`location_id`,`authority_id`) REFERENCES `inventory_authorities`(`organization_id`,`site_id`,`location_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "inventory_movements_type_check" CHECK("inventory_movements"."movement_type" IN ('restock', 'reserve', 'release', 'consume', 'waste', 'manual_adjustment', 'external_sync')),
	CONSTRAINT "inventory_movements_actor_check" CHECK("inventory_movements"."actor_type" IN ('user', 'integration', 'system')),
	CONSTRAINT "inventory_movements_result_check" CHECK("inventory_movements"."resulting_quantity_on_hand" >= 0 AND "inventory_movements"."resulting_quantity_reserved" >= 0 AND "inventory_movements"."resulting_quantity_reserved" <= "inventory_movements"."resulting_quantity_on_hand"),
	CONSTRAINT "inventory_movements_revision_check" CHECK("inventory_movements"."base_revision" >= 0 AND "inventory_movements"."resulting_revision" = "inventory_movements"."base_revision" + 1),
	CONSTRAINT "inventory_movements_reference_check" CHECK(("inventory_movements"."reference_type" IS NULL AND "inventory_movements"."reference_id" IS NULL) OR (trim("inventory_movements"."reference_type") <> '' AND trim("inventory_movements"."reference_id") <> ''))
);
--> statement-breakpoint
CREATE INDEX `inventory_movements_product_created_idx` ON `inventory_movements` (`site_id`,`location_id`,`product_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_movements_idempotency_unique` ON `inventory_movements` (`organization_id`,`site_id`,`location_id`,`idempotency_key`);