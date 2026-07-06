CREATE TABLE `mcp_tool_call_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`site_id` text,
	`location_id` text,
	`user_id` text,
	`mcp_surface` text DEFAULT 'client' NOT NULL,
	`request_id` text,
	`method` text NOT NULL,
	`tool_name` text,
	`tool_domain` text,
	`is_mutating` integer,
	`arguments_summary_json` text,
	`result_summary_json` text,
	`status` text NOT NULL,
	`error_code` text,
	`error_message` text,
	`duration_ms` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_mcp_tool_call_events_created_at` ON `mcp_tool_call_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_mcp_tool_call_events_tool_status` ON `mcp_tool_call_events` (`tool_name`,`status`);--> statement-breakpoint
CREATE INDEX `idx_mcp_tool_call_events_site` ON `mcp_tool_call_events` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_mcp_tool_call_events_org` ON `mcp_tool_call_events` (`organization_id`,`created_at`);