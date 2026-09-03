CREATE TABLE `ordering_qr_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`service_point_id` text,
	`version` integer NOT NULL,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`,`site_id`,`location_id`,`service_point_id`) REFERENCES `service_points`(`organization_id`,`site_id`,`location_id`,`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "ordering_qr_version_check" CHECK(version > 0),
	CONSTRAINT "ordering_qr_token_hash_check" CHECK(length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "ordering_qr_status_check" CHECK(status IN ('active','revoked')),
	CONSTRAINT "ordering_qr_revoked_at_check" CHECK((status = 'active' AND revoked_at IS NULL) OR (status = 'revoked' AND revoked_at IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ordering_qr_token_hash_unique` ON `ordering_qr_credentials` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ordering_qr_service_point_version_unique` ON `ordering_qr_credentials` (`service_point_id`,`version`) WHERE service_point_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ordering_qr_one_active_per_service_point` ON `ordering_qr_credentials` (`service_point_id`) WHERE service_point_id IS NOT NULL AND status = 'active';--> statement-breakpoint
CREATE INDEX `idx_ordering_qr_scope_status` ON `ordering_qr_credentials` (`organization_id`,`site_id`,`location_id`,`status`);--> statement-breakpoint
CREATE TABLE `service_points` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`label` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`,`site_id`,`location_id`) REFERENCES `business_locations`(`organization_id`,`site_id`,`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "service_points_label_check" CHECK(length(trim(label)) BETWEEN 1 AND 120),
	CONSTRAINT "service_points_status_check" CHECK(status IN ('active','paused'))
);
--> statement-breakpoint
CREATE INDEX `idx_service_points_location_status` ON `service_points` (`organization_id`,`site_id`,`location_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `service_points_scope_id_unique` ON `service_points` (`organization_id`,`site_id`,`location_id`,`id`);