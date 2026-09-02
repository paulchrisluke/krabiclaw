CREATE TABLE `catalog_provider_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_account_reference` text,
	`external_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`location_id`) REFERENCES `business_locations`(`organization_id`,`site_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "catalog_provider_mappings_resource_type_check" CHECK("catalog_provider_mappings"."resource_type" IN ('product', 'price', 'modifier_group', 'modifier_option')),
	CONSTRAINT "catalog_provider_mappings_provider_not_blank_check" CHECK(trim("catalog_provider_mappings"."provider") <> '' AND trim("catalog_provider_mappings"."external_id") <> '')
);
--> statement-breakpoint
CREATE INDEX `catalog_provider_mappings_resource_idx` ON `catalog_provider_mappings` (`site_id`,`resource_type`,`resource_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_provider_mappings_resource_provider_unique` ON `catalog_provider_mappings` (`organization_id`,`site_id`,`location_id`,`resource_type`,`resource_id`,`provider`,`provider_account_reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_provider_mappings_external_unique` ON `catalog_provider_mappings` (`organization_id`,`site_id`,`location_id`,`provider`,`provider_account_reference`,`external_id`);--> statement-breakpoint
CREATE TABLE `modifier_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`name` text NOT NULL,
	`minimum_selections` integer DEFAULT 0 NOT NULL,
	`maximum_selections` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`location_id`) REFERENCES `business_locations`(`organization_id`,`site_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "modifier_groups_name_not_blank_check" CHECK(trim("modifier_groups"."name") <> ''),
	CONSTRAINT "modifier_groups_selection_check" CHECK("modifier_groups"."minimum_selections" >= 0 AND "modifier_groups"."maximum_selections" >= 1 AND "modifier_groups"."minimum_selections" <= "modifier_groups"."maximum_selections"),
	CONSTRAINT "modifier_groups_order_check" CHECK("modifier_groups"."sort_order" >= 0),
	CONSTRAINT "modifier_groups_active_check" CHECK("modifier_groups"."is_active" IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX `modifier_groups_location_order_idx` ON `modifier_groups` (`site_id`,`location_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `modifier_groups_scope_id_unique` ON `modifier_groups` (`organization_id`,`site_id`,`location_id`,`id`);--> statement-breakpoint
CREATE TABLE `modifier_options` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`modifier_group_id` text NOT NULL,
	`name` text NOT NULL,
	`price_delta_minor` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`modifier_group_id`) REFERENCES `modifier_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`location_id`,`modifier_group_id`) REFERENCES `modifier_groups`(`organization_id`,`site_id`,`location_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "modifier_options_name_not_blank_check" CHECK(trim("modifier_options"."name") <> ''),
	CONSTRAINT "modifier_options_price_check" CHECK("modifier_options"."price_delta_minor" >= 0),
	CONSTRAINT "modifier_options_order_check" CHECK("modifier_options"."sort_order" >= 0),
	CONSTRAINT "modifier_options_active_check" CHECK("modifier_options"."is_active" IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX `modifier_options_group_order_idx` ON `modifier_options` (`modifier_group_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `modifier_options_scope_id_unique` ON `modifier_options` (`organization_id`,`site_id`,`location_id`,`id`);--> statement-breakpoint
CREATE TABLE `product_channel_availability` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`product_id` text NOT NULL,
	`channel` text NOT NULL,
	`is_available` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`location_id`,`product_id`) REFERENCES `products`(`organization_id`,`site_id`,`location_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "product_channel_availability_channel_check" CHECK("product_channel_availability"."channel" IN ('seo', 'ordering')),
	CONSTRAINT "product_channel_availability_boolean_check" CHECK("product_channel_availability"."is_available" IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX `product_channel_availability_location_channel_idx` ON `product_channel_availability` (`site_id`,`location_id`,`channel`,`is_available`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_channel_availability_scope_unique` ON `product_channel_availability` (`organization_id`,`site_id`,`location_id`,`product_id`,`channel`);--> statement-breakpoint
CREATE TABLE `product_menu_placements` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`product_id` text NOT NULL,
	`section` text NOT NULL,
	`sort_order` integer NOT NULL,
	`is_published` integer DEFAULT true NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`featured_sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`location_id`,`product_id`) REFERENCES `products`(`organization_id`,`site_id`,`location_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "product_menu_placements_section_not_blank_check" CHECK(trim("product_menu_placements"."section") <> ''),
	CONSTRAINT "product_menu_placements_order_check" CHECK("product_menu_placements"."sort_order" >= 0 AND "product_menu_placements"."featured_sort_order" >= 0),
	CONSTRAINT "product_menu_placements_boolean_check" CHECK("product_menu_placements"."is_published" IN (0, 1) AND "product_menu_placements"."featured" IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX `product_menu_placements_location_order_idx` ON `product_menu_placements` (`site_id`,`location_id`,`is_published`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_menu_placements_scope_product_unique` ON `product_menu_placements` (`organization_id`,`site_id`,`location_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `product_modifier_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`product_id` text NOT NULL,
	`modifier_group_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`modifier_group_id`) REFERENCES `modifier_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`location_id`,`product_id`) REFERENCES `products`(`organization_id`,`site_id`,`location_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`location_id`,`modifier_group_id`) REFERENCES `modifier_groups`(`organization_id`,`site_id`,`location_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "product_modifier_groups_order_check" CHECK("product_modifier_groups"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE INDEX `product_modifier_groups_product_order_idx` ON `product_modifier_groups` (`product_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_modifier_groups_product_group_unique` ON `product_modifier_groups` (`product_id`,`modifier_group_id`);