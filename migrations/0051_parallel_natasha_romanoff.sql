CREATE TABLE `invitation_access_scope` (
	`id` text PRIMARY KEY NOT NULL,
	`invitation_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`invitation_id`) REFERENCES `invitation`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invitation_access_scope_unique` ON `invitation_access_scope` (`invitation_id`,`site_id`,`location_id`);--> statement-breakpoint
CREATE INDEX `idx_invitation_access_scope_invitation_id` ON `invitation_access_scope` (`invitation_id`);--> statement-breakpoint
CREATE TABLE `member_access_scope` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_member_access_scope_unique` ON `member_access_scope` (`member_id`,`site_id`,`location_id`);--> statement-breakpoint
CREATE INDEX `idx_member_access_scope_member_id` ON `member_access_scope` (`member_id`);--> statement-breakpoint
CREATE INDEX `idx_member_access_scope_resource` ON `member_access_scope` (`organization_id`,`site_id`,`location_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invitation_access_scope_site_unique` ON `invitation_access_scope` (`invitation_id`,`site_id`) WHERE location_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_member_access_scope_site_unique` ON `member_access_scope` (`member_id`,`site_id`) WHERE location_id IS NULL;
