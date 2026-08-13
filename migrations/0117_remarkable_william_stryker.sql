DROP INDEX `idx_mcp_tool_call_events_compat`;--> statement-breakpoint
ALTER TABLE `mcp_tool_call_events` DROP COLUMN `deployment_version`;--> statement-breakpoint
ALTER TABLE `mcp_tool_call_events` DROP COLUMN `compatibility_alias_used`;--> statement-breakpoint
ALTER TABLE `mcp_tool_call_events` DROP COLUMN `compatibility_tool_name`;--> statement-breakpoint
ALTER TABLE `mcp_tool_call_events` DROP COLUMN `replacement_tool_names`;