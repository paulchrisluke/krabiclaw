ALTER TABLE `ai_credits` ADD `balance_period_key` text;--> statement-breakpoint
ALTER TABLE `usage_events` ADD `session_id` text;--> statement-breakpoint
ALTER TABLE `usage_quota_grants` ADD `applied_at` text;