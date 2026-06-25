CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`expiresAt` integer,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`password` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ai_credits` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`lifetime_used` integer DEFAULT 0 NOT NULL,
	`last_topped_up_at` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ai_usage_log` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text,
	`action` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`credits_charged` integer DEFAULT 0 NOT NULL,
	`cf_gateway_log_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `business_location_translations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`locale` text NOT NULL,
	`title` text,
	`address` text,
	`city` text,
	`description` text,
	`short_description` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`source_hash` text,
	`translated_at` text,
	`reviewed_at` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `business_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`slug` text NOT NULL,
	`google_location_id` text,
	`google_connection_id` text,
	`title` text NOT NULL,
	`address` text,
	`city` text,
	`neighborhood` text,
	`phone` text,
	`website_url` text,
	`maps_url` text,
	`latitude` real,
	`longitude` real,
	`opening_hours` text,
	`categories` text,
	`rating` real,
	`review_count` integer,
	`is_primary` numeric,
	`status` text DEFAULT 'active',
	`last_synced_at` text,
	`description` text,
	`short_description` text,
	`description_provenance` text,
	`special_hours` text,
	`price_level` text,
	`attributes` text,
	`email` text,
	`facebook_url` text,
	`facebook_page_id` text,
	`facebook_connection_id` text,
	`instagram_url` text,
	`tiktok_url` text,
	`grab_url` text,
	`uber_eats_url` text,
	`foodpanda_url` text,
	`google_place_id` text,
	`hero_image_asset_id` text,
	`hero_video_asset_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`notification_phone` text,
	`timezone` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`google_connection_id`) REFERENCES `google_business_connections`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`facebook_connection_id`) REFERENCES `facebook_pages_connections`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`hero_image_asset_id`) REFERENCES `media_assets_old`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`hero_video_asset_id`) REFERENCES `media_assets_old`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `canary_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`run_type` text NOT NULL,
	`environment` text DEFAULT 'production' NOT NULL,
	`status` text NOT NULL,
	`organization_id` text,
	`site_id` text,
	`details_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `chowbot_channel_state` (
	`user_id` text NOT NULL,
	`channel` text NOT NULL,
	`selected_site_id` text,
	`active_conversation_id` text,
	`pending_media` text,
	`pending_confirmation` text,
	`last_inbound_id` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`selected_site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`active_conversation_id`) REFERENCES `chowbot_conversations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `chowbot_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text DEFAULT 'New Conversation' NOT NULL,
	`active_channel` text DEFAULT 'dashboard' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`selected_location_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`selected_location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `chowbot_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`user_id` text,
	`role` text NOT NULL,
	`channel` text NOT NULL,
	`content` text,
	`media` text,
	`meta_message_id` text,
	`tool_calls` text,
	`status` text DEFAULT 'sent' NOT NULL,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `chowbot_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `contact_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`ip_hash` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `d1_migrations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`applied_at` numeric DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dashboard_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`selected_location_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`selected_location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `domain_reconciliation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`domain_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`run_after` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (`domain_id`) REFERENCES `site_domains`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `experience_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`experience_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`guest_name` text NOT NULL,
	`guest_email` text NOT NULL,
	`guest_phone` text,
	`party_size` integer DEFAULT 1 NOT NULL,
	`booking_date` text NOT NULL,
	`time_slot` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`ip_hash` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`experience_id`) REFERENCES `experiences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `experience_slot_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`experience_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`override_date` text NOT NULL,
	`time_slot` text NOT NULL,
	`status` text DEFAULT 'closed' NOT NULL,
	`capacity_override` integer,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`experience_id`) REFERENCES `experiences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `experiences` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`tagline` text,
	`body` text,
	`image_asset_id` text,
	`video_asset_id` text,
	`images` text,
	`price` text,
	`price_amount` numeric,
	`duration_minutes` integer,
	`max_capacity` integer,
	`time_slots` text,
	`recurring_slots` text,
	`available_note` text,
	`status` text DEFAULT 'active' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`featured` numeric NOT NULL,
	`featured_sort_order` integer DEFAULT 0 NOT NULL,
	`seo_title` text,
	`seo_description` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by` text,
	`highlights` text,
	`included_items` text,
	`what_to_bring` text,
	`meeting_point` text,
	`cancellation_policy` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`video_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `facebook_pages_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`connected_by_user_id` text,
	`facebook_user_id` text NOT NULL,
	`facebook_page_id` text,
	`facebook_page_name` text,
	`encrypted_user_token` text NOT NULL,
	`encrypted_page_token` text,
	`user_token_expires_at` text,
	`scopes` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connected_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `google_analytics_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`connected_by_user_id` text,
	`provider_account_email` text NOT NULL,
	`encrypted_access_token` text NOT NULL,
	`encrypted_refresh_token` text NOT NULL,
	`scopes` text NOT NULL,
	`ga4_property_id` text,
	`ga4_property_name` text,
	`ga4_measurement_id` text,
	`search_console_site_url` text,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connected_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `google_business_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`connected_by_user_id` text,
	`provider_account_email` text NOT NULL,
	`encrypted_access_token` text NOT NULL,
	`encrypted_refresh_token` text NOT NULL,
	`scopes` text NOT NULL,
	`expires_at` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`connected_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `google_business_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`site_id` text,
	`google_location_id` text,
	`event_type` text,
	`payload` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `google_place_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`place_id` text NOT NULL,
	`source_url` text,
	`snapshot_json` text NOT NULL,
	`fetched_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text NOT NULL,
	`email` text NOT NULL,
	`role` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expiresAt` integer NOT NULL,
	`inviterId` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviterId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `jwks` (
	`id` text PRIMARY KEY NOT NULL,
	`publicKey` text NOT NULL,
	`privateKey` text NOT NULL,
	`alg` text,
	`crv` text,
	`createdAt` integer NOT NULL,
	`expiresAt` integer
);
--> statement-breakpoint
CREATE TABLE `location_qa` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`google_question_id` text,
	`question` text NOT NULL,
	`question_author` text,
	`question_date` text,
	`answer` text,
	`answer_author` text,
	`answer_date` text,
	`is_owner_answer` integer DEFAULT 0 NOT NULL,
	`upvote_count` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `mcp_workspace_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`site_id` text,
	`location_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`kind` text NOT NULL,
	`provider` text NOT NULL,
	`source` text NOT NULL,
	`cloudflare_image_id` text,
	`r2_key` text,
	`google_media_name` text,
	`public_url` text,
	`thumbnail_url` text,
	`mime_type` text,
	`file_name` text,
	`file_size` integer,
	`width` integer,
	`height` integer,
	`duration` integer,
	`alt_text` text,
	`category` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`delete_pending_at` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `media_assets_old` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`kind` text NOT NULL,
	`provider` text NOT NULL,
	`source` text NOT NULL,
	`cloudflare_image_id` text,
	`r2_key` text,
	`google_media_name` text,
	`public_url` text,
	`thumbnail_url` text,
	`mime_type` text,
	`file_name` text,
	`file_size` integer,
	`width` integer,
	`height` integer,
	`duration` integer,
	`alt_text` text,
	`category` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `member` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text NOT NULL,
	`userId` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `menu_item_translations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`menu_item_id` text NOT NULL,
	`locale` text NOT NULL,
	`section` text,
	`name` text,
	`description` text,
	`allergens` text,
	`ingredients` text,
	`dietary_notes` text,
	`preparation` text,
	`serving_note` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`source_hash` text,
	`translated_at` text,
	`reviewed_at` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `menu_items` (
	`id` text PRIMARY KEY NOT NULL,
	`menu_id` text NOT NULL,
	`section` text NOT NULL,
	`name` text NOT NULL,
	`slug` text DEFAULT '' NOT NULL,
	`description` text,
	`price_amount` numeric,
	`image_asset_id` text,
	`available` numeric DEFAULT 1 NOT NULL,
	`featured` numeric NOT NULL,
	`featured_sort_order` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`allergens` text,
	`ingredients` text,
	`dietary_notes` text,
	`preparation` text,
	`serving_note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`menu_id`) REFERENCES `menus`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image_asset_id`) REFERENCES `media_assets_old`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `menu_translations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`menu_id` text NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`description` text,
	`section_order` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`source_hash` text,
	`translated_at` text,
	`reviewed_at` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`menu_id`) REFERENCES `menus`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `menus` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`section_order` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text,
	`channel` text DEFAULT 'dashboard' NOT NULL,
	`template` text NOT NULL,
	`recipient` text,
	`title` text,
	`payload` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider_message_id` text,
	`error` text,
	`read_at` text,
	`sent_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `oauthAccessToken` (
	`id` text PRIMARY KEY NOT NULL,
	`clientId` text NOT NULL,
	`userId` text,
	`token` text NOT NULL,
	`scopes` text DEFAULT '' NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`sessionId` text,
	`referenceId` text,
	`refreshId` text
);
--> statement-breakpoint
CREATE TABLE `oauthClient` (
	`id` text PRIMARY KEY NOT NULL,
	`clientId` text NOT NULL,
	`clientSecret` text,
	`name` text NOT NULL,
	`redirectUris` text NOT NULL,
	`scopes` text DEFAULT '' NOT NULL,
	`public` integer DEFAULT 0 NOT NULL,
	`requirePkce` integer DEFAULT 1 NOT NULL,
	`skipConsent` integer DEFAULT 0 NOT NULL,
	`userId` text,
	`metadata` text,
	`disabled` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`enableEndSession` integer,
	`subjectType` text,
	`uri` text,
	`icon` text,
	`contacts` text,
	`tos` text,
	`policy` text,
	`softwareId` text,
	`softwareVersion` text,
	`softwareStatement` text,
	`postLogoutRedirectUris` text,
	`tokenEndpointAuthMethod` text,
	`grantTypes` text,
	`responseTypes` text,
	`type` text,
	`referenceId` text
);
--> statement-breakpoint
CREATE TABLE `oauthConsent` (
	`id` text PRIMARY KEY NOT NULL,
	`clientId` text NOT NULL,
	`userId` text NOT NULL,
	`scopes` text DEFAULT '' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`referenceId` text
);
--> statement-breakpoint
CREATE TABLE `oauthRefreshToken` (
	`id` text PRIMARY KEY NOT NULL,
	`clientId` text NOT NULL,
	`userId` text,
	`token` text NOT NULL,
	`scopes` text DEFAULT '' NOT NULL,
	`accessTokenId` text,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`sessionId` text,
	`referenceId` text,
	`revoked` integer,
	`authTime` integer
);
--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text,
	`logo` text,
	`metadata` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `organization_billing` (
	`id` text,
	`organization_id` text PRIMARY KEY NOT NULL,
	`stripe_customer_id` text,
	`stripe_subscription_id` text,
	`stripe_subscription_item_id` text,
	`status` text DEFAULT 'free' NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`current_period_end` text,
	`cancel_at_period_end` numeric,
	`auto_topup_enabled` integer DEFAULT 0 NOT NULL,
	`auto_topup_bundle` integer DEFAULT 500 NOT NULL,
	`auto_topup_threshold` integer DEFAULT 100 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `organization_entitlements` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`source` text DEFAULT 'system' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `platform_analytics` (
	`id` text PRIMARY KEY NOT NULL,
	`metric` text NOT NULL,
	`value` integer NOT NULL,
	`date` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `platform_analytics_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`page_views` integer DEFAULT 0,
	`unique_sessions` integer DEFAULT 0,
	`avg_session_duration` integer DEFAULT 0,
	`unique_visitors` integer DEFAULT 0,
	`pages_per_session` real,
	`returning_visitors` integer DEFAULT 0,
	`top_pages` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_analytics_daily_date_unique` ON `platform_analytics_daily` (`date`);--> statement-breakpoint
CREATE TABLE `platform_blog_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`body` text NOT NULL,
	`excerpt` text,
	`category` text,
	`author_id` text,
	`featured_image_asset_id` text,
	`published_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`seo_description` text,
	`seo_keywords` text,
	`canonical_url` text,
	`robots` text,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`featured_image_asset_id`) REFERENCES `media_assets_old`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `platform_contact_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`ip_hash` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `platform_content` (
	`id` text PRIMARY KEY NOT NULL,
	`page` text NOT NULL,
	`content` text NOT NULL,
	`updated_by` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `platform_content_components` (
	`id` text PRIMARY KEY NOT NULL,
	`content_type` text NOT NULL,
	`content_id` text NOT NULL,
	`type` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`data_json` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`label` text,
	`status` text DEFAULT 'active' NOT NULL,
	`render_enabled` integer DEFAULT 1 NOT NULL,
	`schema_enabled` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `platform_docs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`body` text NOT NULL,
	`excerpt` text,
	`category` text,
	`author_id` text,
	`seo_description` text,
	`seo_keywords` text,
	`featured_image_asset_id` text,
	`sort_order` integer DEFAULT 0,
	`parent_doc_id` text,
	`difficulty_level` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`canonical_url` text,
	`robots` text,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`featured_image_asset_id`) REFERENCES `media_assets_old`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `platform_pageview_events` (
	`id` text PRIMARY KEY NOT NULL,
	`page_path` text NOT NULL,
	`referrer` text,
	`user_agent` text,
	`ip_hash` text,
	`session_id` text,
	`visitor_id` text,
	`duration_seconds` integer,
	`country` text,
	`region` text,
	`city` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `post_channel_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`channel` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider_post_id` text,
	`error` text,
	`published_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `post_translations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`post_id` text NOT NULL,
	`locale` text NOT NULL,
	`title` text,
	`body` text,
	`event_title` text,
	`offer_terms` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`source_hash` text,
	`translated_at` text,
	`reviewed_at` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`google_post_id` text,
	`post_type` text DEFAULT 'standard' NOT NULL,
	`title` text,
	`body` text NOT NULL,
	`image_asset_id` text,
	`cta_type` text,
	`cta_url` text,
	`event_title` text,
	`event_start` text,
	`event_end` text,
	`offer_coupon` text,
	`offer_terms` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`scheduled_for` text,
	`published_at` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`image_asset_id`) REFERENCES `media_assets_old`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`expires_at` text
);
--> statement-breakpoint
CREATE TABLE `reservation_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`guests` text NOT NULL,
	`requests` text,
	`status` text DEFAULT 'new' NOT NULL,
	`ip_hash` text,
	`cancellation_token_hash` text,
	`cancellation_token_expires_at` text,
	`cancellation_token_used_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`site_id` text,
	`location_id` text,
	`menu_item_slug` text,
	`author_name` text,
	`reviewer_photo_url` text,
	`rating` integer NOT NULL,
	`title` text,
	`content` text,
	`google_review_id` text,
	`owner_reply` text,
	`owner_reply_at` text,
	`photo_urls` text,
	`helpful_count` integer DEFAULT 0,
	`status` text DEFAULT 'pending',
	`source` text DEFAULT 'direct',
	`ip_hash` text,
	`user_agent` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `service_addon_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`addon_type` text NOT NULL,
	`stripe_payment_intent_id` text,
	`fulfilled_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL,
	`token` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`activeOrganizationId` text,
	`activeTeamId` text,
	`impersonatedBy` text,
	`userId` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `site_analytics_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`date` text NOT NULL,
	`page_views` integer DEFAULT 0,
	`unique_sessions` integer DEFAULT 0,
	`avg_session_duration` integer DEFAULT 0,
	`top_pages` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`unique_visitors` integer DEFAULT 0,
	`pages_per_session` real,
	`returning_visitors` integer DEFAULT 0,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `site_billing` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`stripe_subscription_id` text,
	`stripe_subscription_item_id` text,
	`plan` text DEFAULT 'free' NOT NULL,
	`status` text DEFAULT 'free' NOT NULL,
	`current_period_end` text,
	`cancel_at_period_end` numeric,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`stripe_customer_id` text,
	`payment_method` text DEFAULT 'stripe' NOT NULL,
	`local_rate` integer,
	`local_currency` text,
	`last_reminder_sent_at` text,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `site_config` (
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `site_content` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`page` text NOT NULL,
	`field` text NOT NULL,
	`content` text,
	`hero_title` text,
	`hero_subtitle` text,
	`hero_image_asset_id` text,
	`hero_video_asset_id` text,
	`value` text,
	`type` text DEFAULT 'text' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	`component` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`hero_image_asset_id`) REFERENCES `media_assets_old`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`hero_video_asset_id`) REFERENCES `media_assets_old`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `site_content_translations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`locale` text NOT NULL,
	`page` text NOT NULL,
	`field` text NOT NULL,
	`content` text,
	`hero_title` text,
	`hero_subtitle` text,
	`value` text,
	`type` text DEFAULT 'text' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`source_hash` text,
	`translated_at` text,
	`reviewed_at` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	`component` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `site_domain_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`domain_id` text,
	`event_type` text NOT NULL,
	`actor_type` text DEFAULT 'system' NOT NULL,
	`actor_id` text,
	`message` text,
	`before_state` text,
	`after_state` text,
	`metadata` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`domain_id`) REFERENCES `site_domains`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `site_domains` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`domain` text NOT NULL,
	`type` text NOT NULL,
	`role` text DEFAULT 'secondary' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`cloudflare_hostname_id` text,
	`cloudflare_hostname_status` text,
	`cloudflare_ssl_status` text,
	`ownership_validation_name` text,
	`ownership_validation_type` text,
	`ownership_validation_value` text,
	`ssl_validation_name` text,
	`ssl_validation_type` text,
	`ssl_validation_value` text,
	`dns_target` text,
	`dns_status` text DEFAULT 'pending' NOT NULL,
	`last_synced_at` text,
	`next_check_at` text,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`activated_at` text,
	`error_message` text,
	`metadata` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `site_entitlements` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`source` text DEFAULT 'system' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `site_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`actor_id` text,
	`event_type` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`metadata` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `site_locales` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`locale` text NOT NULL,
	`label` text,
	`is_source` numeric NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`fallback_enabled` numeric DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `site_pageview_events` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`page_path` text NOT NULL,
	`referrer` text,
	`user_agent` text,
	`ip_hash` text,
	`session_id` text,
	`duration_seconds` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`visitor_id` text,
	`country` text,
	`region` text,
	`city` text,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `site_transfer_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`from_organization_id` text NOT NULL,
	`to_email` text NOT NULL,
	`token` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`initiated_by_user_id` text NOT NULL,
	`accepted_by_user_id` text,
	`claiming_user_id` text,
	`claiming_organization_id` text,
	`message` text,
	`invited_plan` text,
	`invited_coupon` text,
	`invited_domain` text,
	`requires_payment` integer DEFAULT 0 NOT NULL,
	`stripe_checkout_session_id` text,
	`payment_completed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`completed_at` text,
	`last_reminder_at` text,
	`reminder_count` integer DEFAULT 0 NOT NULL,
	`custom_domains_snapshot` text,
	`custom_domains_removed_at` text,
	`invited_interval` text DEFAULT 'month' NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`initiated_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`accepted_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`claiming_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `sites` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`theme_id` text DEFAULT 'saya-theme-v1' NOT NULL,
	`theme` text DEFAULT 'saya' NOT NULL,
	`slug` text NOT NULL,
	`subdomain` text,
	`custom_domain` text,
	`custom_domain_status` text DEFAULT 'none',
	`primary_location_id` text,
	`public_url` text,
	`brand_name` text,
	`brand_description` text,
	`logo_url` text,
	`logo_asset_id` text,
	`contact_email` text,
	`contact_phone` text,
	`source_locale` text DEFAULT 'en' NOT NULL,
	`default_currency` text DEFAULT 'THB' NOT NULL,
	`status` text DEFAULT 'active',
	`plan` text DEFAULT 'free',
	`onboarding_status` text DEFAULT 'pending',
	`url_structure` text DEFAULT 'location_subdirectories' NOT NULL,
	`vertical` text DEFAULT 'restaurant' NOT NULL,
	`content_source` text,
	`media_source` text,
	`settings` text,
	`last_published_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_by` text,
	`og_image_asset_id` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`logo_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`og_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `stripe_webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`stripe_event_id` text,
	`event_type` text,
	`status` text DEFAULT 'pending',
	`payload` text,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `themes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`version` text DEFAULT '1.0.0',
	`description` text,
	`status` text DEFAULT 'active',
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
--> statement-breakpoint
CREATE TABLE `token_exchange_cache` (
	`code` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`response_body` text DEFAULT '' NOT NULL,
	`http_status` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `translation_job_items` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`target_locale` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`location_id` text,
	`page` text,
	`field` text NOT NULL,
	`source_hash` text NOT NULL,
	`source_chars` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `translation_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `translation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`source_locale` text NOT NULL,
	`target_locale` text NOT NULL,
	`scope` text DEFAULT 'site' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`total_items` integer DEFAULT 0 NOT NULL,
	`total_chars` integer DEFAULT 0 NOT NULL,
	`estimated_input_tokens` integer DEFAULT 0 NOT NULL,
	`estimated_output_tokens` integer DEFAULT 0 NOT NULL,
	`estimated_credits` integer DEFAULT 0 NOT NULL,
	`actual_input_tokens` integer DEFAULT 0 NOT NULL,
	`actual_output_tokens` integer DEFAULT 0 NOT NULL,
	`actual_credits` integer DEFAULT 0 NOT NULL,
	`processed_items` integer DEFAULT 0 NOT NULL,
	`failed_items` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_by` text,
	`started_at` text,
	`finished_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`emailVerified` integer DEFAULT 0 NOT NULL,
	`image` text,
	`phoneNumber` text,
	`phoneNumberVerified` integer DEFAULT 0 NOT NULL,
	`role` text DEFAULT 'user',
	`banned` integer DEFAULT 0,
	`banReason` text,
	`banExpires` integer,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `work_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`source` text DEFAULT 'dashboard' NOT NULL,
	`notes` text,
	`assigned_to` text,
	`completed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assigned_to`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
