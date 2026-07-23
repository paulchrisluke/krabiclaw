ALTER TABLE `mcp_tool_call_events` ADD `http_status` integer;--> statement-breakpoint
ALTER TABLE `mcp_tool_call_events` ADD `jsonrpc_error_code` integer;--> statement-breakpoint
ALTER TABLE `mcp_tool_call_events` ADD `jsonrpc_error_message` text;--> statement-breakpoint
ALTER TABLE `mcp_tool_call_events` ADD `protocol_version` text;--> statement-breakpoint
ALTER TABLE `mcp_tool_call_events` ADD `session_id_hash` text;--> statement-breakpoint
ALTER TABLE `mcp_tool_call_events` ADD `oauth_client_id_hash` text;--> statement-breakpoint
ALTER TABLE `mcp_tool_call_events` ADD `user_agent` text;--> statement-breakpoint
ALTER TABLE `mcp_tool_call_events` ADD `cf_ray_id` text;--> statement-breakpoint
ALTER TABLE `mcp_tool_call_events` ADD `deployment_version` text;--> statement-breakpoint
ALTER TABLE `mcp_tool_call_events` ADD `catalog_fingerprint` text;--> statement-breakpoint
ALTER TABLE `mcp_tool_call_events` ADD `compatibility_alias_used` integer;--> statement-breakpoint
ALTER TABLE `mcp_tool_call_events` ADD `compatibility_tool_name` text;--> statement-breakpoint
ALTER TABLE `mcp_tool_call_events` ADD `replacement_tool_names` text;--> statement-breakpoint
ALTER TABLE `mcp_tool_call_events` ADD `unknown_tool_name` text;--> statement-breakpoint
CREATE INDEX `idx_mcp_tool_call_events_method_created` ON `mcp_tool_call_events` (`method`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_mcp_tool_call_events_session` ON `mcp_tool_call_events` (`session_id_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_mcp_tool_call_events_unknown` ON `mcp_tool_call_events` (`unknown_tool_name`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_mcp_tool_call_events_compat` ON `mcp_tool_call_events` (`compatibility_tool_name`,`created_at`);