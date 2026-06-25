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
CREATE UNIQUE INDEX `business_location_translations_organization_id_site_id_location_id_locale_unique` ON `business_location_translations` (`organization_id`,`site_id`,`location_id`,`locale`);--> statement-breakpoint
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
	`is_primary` numeric DEFAULT false,
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
CREATE UNIQUE INDEX `business_locations_organization_id_site_id_slug_unique` ON `business_locations` (`organization_id`,`site_id`,`slug`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `chowbot_messages_meta_message_id_unique` ON `chowbot_messages` (`meta_message_id`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `dashboard_preferences_user_id_organization_id_unique` ON `dashboard_preferences` (`user_id`,`organization_id`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `domain_reconciliation_jobs_domain_id_unique` ON `domain_reconciliation_jobs` (`domain_id`);--> statement-breakpoint
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
	`featured` numeric DEFAULT false NOT NULL,
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
CREATE UNIQUE INDEX `facebook_pages_connections_organization_id_site_id_unique` ON `facebook_pages_connections` (`organization_id`,`site_id`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `google_analytics_connections_organization_id_site_id_unique` ON `google_analytics_connections` (`organization_id`,`site_id`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `google_business_connections_organization_id_site_id_location_id_unique` ON `google_business_connections` (`organization_id`,`site_id`,`location_id`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `menu_item_translations_organization_id_site_id_menu_item_id_locale_unique` ON `menu_item_translations` (`organization_id`,`site_id`,`menu_item_id`,`locale`);--> statement-breakpoint
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
	`featured` numeric DEFAULT false NOT NULL,
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
CREATE UNIQUE INDEX `menu_translations_organization_id_site_id_menu_id_locale_unique` ON `menu_translations` (`organization_id`,`site_id`,`menu_id`,`locale`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `oauthAccessToken_token_unique` ON `oauthAccessToken` (`token`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `oauthClient_clientId_unique` ON `oauthClient` (`clientId`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `oauthConsent_clientId_userId_unique` ON `oauthConsent` (`clientId`,`userId`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `oauthRefreshToken_token_unique` ON `oauthRefreshToken` (`token`);--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text,
	`logo` text,
	`metadata` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_unique` ON `organization` (`slug`);--> statement-breakpoint
CREATE TABLE `organization_billing` (
	`id` text,
	`organization_id` text PRIMARY KEY NOT NULL,
	`stripe_customer_id` text,
	`stripe_subscription_id` text,
	`stripe_subscription_item_id` text,
	`status` text DEFAULT 'free' NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`current_period_end` text,
	`cancel_at_period_end` numeric DEFAULT false,
	`auto_topup_enabled` integer DEFAULT 0 NOT NULL,
	`auto_topup_bundle` integer DEFAULT 500 NOT NULL,
	`auto_topup_threshold` integer DEFAULT 100 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_billing_stripe_customer_id_unique` ON `organization_billing` (`stripe_customer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_billing_stripe_subscription_id_unique` ON `organization_billing` (`stripe_subscription_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_billing_stripe_subscription_item_id_unique` ON `organization_billing` (`stripe_subscription_item_id`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `organization_entitlements_organization_id_key_unique` ON `organization_entitlements` (`organization_id`,`key`);--> statement-breakpoint
CREATE TABLE `platform_analytics` (
	`id` text PRIMARY KEY NOT NULL,
	`metric` text NOT NULL,
	`value` integer NOT NULL,
	`date` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_analytics_metric_date_unique` ON `platform_analytics` (`metric`,`date`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `platform_blog_posts_slug_unique` ON `platform_blog_posts` (`slug`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `platform_content_page_unique` ON `platform_content` (`page`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `platform_docs_slug_unique` ON `platform_docs` (`slug`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `post_translations_organization_id_site_id_post_id_locale_unique` ON `post_translations` (`organization_id`,`site_id`,`post_id`,`locale`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `site_analytics_daily_site_id_date_unique` ON `site_analytics_daily` (`site_id`,`date`);--> statement-breakpoint
CREATE TABLE `site_billing` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`stripe_subscription_id` text,
	`stripe_subscription_item_id` text,
	`plan` text DEFAULT 'free' NOT NULL,
	`status` text DEFAULT 'free' NOT NULL,
	`current_period_end` text,
	`cancel_at_period_end` numeric DEFAULT false,
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
CREATE UNIQUE INDEX `site_billing_site_id_unique` ON `site_billing` (`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_billing_stripe_subscription_id_unique` ON `site_billing` (`stripe_subscription_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_billing_stripe_subscription_item_id_unique` ON `site_billing` (`stripe_subscription_item_id`);--> statement-breakpoint
CREATE TABLE `site_config` (
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`organization_id`, `site_id`, `key`),
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
CREATE UNIQUE INDEX `site_content_organization_id_site_id_location_id_page_field_unique` ON `site_content` (`organization_id`,`site_id`,`location_id`,`page`,`field`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `site_content_translations_organization_id_site_id_location_id_locale_page_field_unique` ON `site_content_translations` (`organization_id`,`site_id`,`location_id`,`locale`,`page`,`field`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `site_domains_domain_unique` ON `site_domains` (`domain`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_domains_cloudflare_hostname_id_unique` ON `site_domains` (`cloudflare_hostname_id`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `site_entitlements_site_id_key_unique` ON `site_entitlements` (`site_id`,`key`);--> statement-breakpoint
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
	`is_source` numeric DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`fallback_enabled` numeric DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_locales_organization_id_site_id_locale_unique` ON `site_locales` (`organization_id`,`site_id`,`locale`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `sites_slug_unique` ON `sites` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `sites_subdomain_unique` ON `sites` (`subdomain`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `stripe_webhook_events_stripe_event_id_unique` ON `stripe_webhook_events` (`stripe_event_id`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `themes_slug_unique` ON `themes` (`slug`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_phoneNumber_unique` ON `user` (`phoneNumber`);--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX idx_ai_usage_log_org ON ai_usage_log(organization_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX idx_analytics_daily_site
  ON site_analytics_daily(site_id, date DESC);
--> statement-breakpoint
CREATE INDEX idx_canary_runs_status_created
  ON canary_runs(status, created_at DESC);
--> statement-breakpoint
CREATE INDEX idx_canary_runs_type_created
  ON canary_runs(run_type, created_at DESC);
--> statement-breakpoint
CREATE INDEX idx_chowbot_conversations_site
  ON chowbot_conversations(site_id, user_id, status, updated_at DESC);
--> statement-breakpoint
CREATE INDEX idx_chowbot_messages_conversation
  ON chowbot_messages(conversation_id, created_at ASC);
--> statement-breakpoint
CREATE INDEX idx_contact_submissions_site ON contact_submissions(site_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX idx_domain_reconciliation_jobs_due
  ON domain_reconciliation_jobs(status, run_after);
--> statement-breakpoint
CREATE INDEX idx_experience_bookings_experience
  ON experience_bookings(experience_id, booking_date, time_slot);
--> statement-breakpoint
CREATE INDEX idx_experience_bookings_site
  ON experience_bookings(site_id, status, created_at DESC);
--> statement-breakpoint
CREATE INDEX idx_experience_slot_overrides_date
  ON experience_slot_overrides(experience_id, override_date);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_experience_slot_overrides_unique
  ON experience_slot_overrides(experience_id, override_date, time_slot);
--> statement-breakpoint
CREATE INDEX idx_experiences_location ON experiences(location_id);
--> statement-breakpoint
CREATE INDEX idx_experiences_site ON experiences(site_id);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_experiences_site_slug ON experiences(site_id, slug);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_google_business_connections_site_level_unique
  ON google_business_connections(organization_id, site_id)
  WHERE location_id IS NULL;
--> statement-breakpoint
CREATE INDEX idx_google_place_snapshots_place_id
  ON google_place_snapshots(place_id);
--> statement-breakpoint
CREATE INDEX idx_google_place_snapshots_site
  ON google_place_snapshots(site_id);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_location_qa_google_id
  ON location_qa(google_question_id) WHERE google_question_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX idx_location_qa_location
  ON location_qa(location_id, status, sort_order);
--> statement-breakpoint
CREATE INDEX idx_media_assets_location
  ON media_assets(location_id, status, created_at DESC)
  WHERE location_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX idx_media_assets_site
  ON media_assets(site_id, status, created_at DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_menu_items_menu_slug
  ON menu_items(menu_id, slug) WHERE slug != '';
--> statement-breakpoint
CREATE INDEX idx_notifications_org ON notifications(organization_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX idx_pageview_events_session
  ON site_pageview_events(site_id, session_id);
--> statement-breakpoint
CREATE INDEX idx_pageview_events_site_date
  ON site_pageview_events(site_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX idx_pageview_events_site_visitor
  ON site_pageview_events(site_id, visitor_id);
--> statement-breakpoint
CREATE INDEX idx_platform_contact_submissions_status_created
  ON platform_contact_submissions(status, created_at DESC);
--> statement-breakpoint
CREATE INDEX idx_platform_content_components_content
  ON platform_content_components(content_type, content_id, position);
--> statement-breakpoint
CREATE INDEX idx_platform_docs_category ON platform_docs(category, status, sort_order);
--> statement-breakpoint
CREATE INDEX idx_platform_docs_parent ON platform_docs(parent_doc_id, status, sort_order);
--> statement-breakpoint
CREATE INDEX idx_platform_pageview_events_created_at ON platform_pageview_events (created_at);
--> statement-breakpoint
CREATE INDEX idx_platform_pageview_events_session_id ON platform_pageview_events (session_id);
--> statement-breakpoint
CREATE INDEX idx_post_channel_jobs_post ON post_channel_jobs(post_id);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_posts_google_id
  ON posts(google_post_id) WHERE google_post_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX idx_posts_location
  ON posts(location_id) WHERE location_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX idx_posts_site ON posts(site_id, status, published_at DESC);
--> statement-breakpoint
CREATE INDEX idx_rate_limits_expires ON rate_limits(expires_at);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_reservation_submissions_cancel_token_hash
  ON reservation_submissions(cancellation_token_hash)
  WHERE cancellation_token_hash IS NOT NULL;
--> statement-breakpoint
CREATE INDEX idx_reservation_submissions_location ON reservation_submissions(location_id);
--> statement-breakpoint
CREATE INDEX idx_reservation_submissions_site ON reservation_submissions(site_id, date, created_at DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_reviews_google_id
  ON reviews(google_review_id) WHERE google_review_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX idx_service_addon_purchases_org
  ON service_addon_purchases(organization_id, created_at DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_service_addon_purchases_stripe_payment_intent_id
  ON service_addon_purchases(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX idx_site_billing_org ON site_billing(organization_id);
--> statement-breakpoint
CREATE INDEX idx_site_billing_subscription ON site_billing(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX idx_site_content_component ON site_content(component);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_site_content_site_level_unique
  ON site_content(organization_id, site_id, page, field)
  WHERE location_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX idx_site_content_translations_site_level_unique
  ON site_content_translations(organization_id, site_id, locale, page, field)
  WHERE location_id IS NULL;
--> statement-breakpoint
CREATE INDEX idx_site_domain_events_domain
  ON site_domain_events(domain_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX idx_site_domain_events_site
  ON site_domain_events(site_id, created_at DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_site_domains_one_canonical
  ON site_domains(site_id)
  WHERE role = 'canonical' AND status = 'active';
--> statement-breakpoint
CREATE INDEX idx_site_domains_reconcile
  ON site_domains(status, next_check_at);
--> statement-breakpoint
CREATE INDEX idx_site_entitlements_org ON site_entitlements(organization_id);
--> statement-breakpoint
CREATE INDEX idx_site_events_location
  ON site_events(location_id, created_at DESC)
  WHERE location_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX idx_site_events_site
  ON site_events(site_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX idx_site_locales_site
  ON site_locales(site_id, status, locale);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_site_transfer_pending
  ON site_transfer_requests(site_id) WHERE status = 'pending';
--> statement-breakpoint
CREATE INDEX idx_site_transfer_reminders
  ON site_transfer_requests(status, requires_payment, created_at);
--> statement-breakpoint
CREATE INDEX idx_site_transfer_site
  ON site_transfer_requests(site_id, status);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_site_transfer_token
  ON site_transfer_requests(token);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_sites_custom_domain_unique
  ON sites(custom_domain)
  WHERE custom_domain IS NOT NULL;
--> statement-breakpoint
CREATE INDEX idx_translation_job_items_job
  ON translation_job_items(job_id, status, entity_type);
--> statement-breakpoint
CREATE INDEX idx_translation_jobs_site
  ON translation_jobs(site_id, target_locale, status, created_at DESC);
--> statement-breakpoint
CREATE INDEX idx_work_requests_org
  ON work_requests(organization_id, status, created_at DESC);
--> statement-breakpoint
CREATE INDEX idx_work_requests_status
  ON work_requests(status, priority, created_at DESC);
--> statement-breakpoint
CREATE TRIGGER sync_media_assets_old_delete
AFTER DELETE ON media_assets
BEGIN
  DELETE FROM media_assets_old WHERE id = OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER sync_media_assets_old_insert
AFTER INSERT ON media_assets
BEGIN
  INSERT OR REPLACE INTO media_assets_old (
    id, organization_id, site_id, location_id, kind, provider, source,
    cloudflare_image_id, r2_key, google_media_name,
    public_url, thumbnail_url, mime_type, file_name, file_size,
    width, height, duration, alt_text, category, status, created_by_user_id, created_at, updated_at
  )
  VALUES (
    NEW.id, NEW.organization_id, NEW.site_id, NEW.location_id, NEW.kind, NEW.provider, NEW.source,
    NEW.cloudflare_image_id, NEW.r2_key, NEW.google_media_name,
    NEW.public_url, NEW.thumbnail_url, NEW.mime_type, NEW.file_name, NEW.file_size,
    NEW.width, NEW.height, NEW.duration, NEW.alt_text, NEW.category, NEW.status, NEW.created_by_user_id, NEW.created_at, NEW.updated_at
  );
END;
--> statement-breakpoint
CREATE TRIGGER sync_media_assets_old_update
AFTER UPDATE ON media_assets
BEGIN
  INSERT OR REPLACE INTO media_assets_old (
    id, organization_id, site_id, location_id, kind, provider, source,
    cloudflare_image_id, r2_key, google_media_name,
    public_url, thumbnail_url, mime_type, file_name, file_size,
    width, height, duration, alt_text, category, status, created_by_user_id, created_at, updated_at
  )
  VALUES (
    NEW.id, NEW.organization_id, NEW.site_id, NEW.location_id, NEW.kind, NEW.provider, NEW.source,
    NEW.cloudflare_image_id, NEW.r2_key, NEW.google_media_name,
    NEW.public_url, NEW.thumbnail_url, NEW.mime_type, NEW.file_name, NEW.file_size,
    NEW.width, NEW.height, NEW.duration, NEW.alt_text, NEW.category, NEW.status, NEW.created_by_user_id, NEW.created_at, NEW.updated_at
  );
END;
--> statement-breakpoint
CREATE TRIGGER trg_chowbot_channel_state_conversation_site_insert
BEFORE INSERT ON chowbot_channel_state
FOR EACH ROW
WHEN NEW.active_conversation_id IS NOT NULL
AND EXISTS (
  SELECT 1 FROM chowbot_conversations
  WHERE id = NEW.active_conversation_id
  AND site_id != NEW.selected_site_id
)
BEGIN
  SELECT RAISE(ABORT, 'active conversation site must match selected site');
END;
--> statement-breakpoint
CREATE TRIGGER trg_chowbot_channel_state_conversation_site_update
BEFORE UPDATE ON chowbot_channel_state
FOR EACH ROW
WHEN NEW.active_conversation_id IS NOT NULL
AND EXISTS (
  SELECT 1 FROM chowbot_conversations
  WHERE id = NEW.active_conversation_id
  AND site_id != NEW.selected_site_id
)
BEGIN
  SELECT RAISE(ABORT, 'active conversation site must match selected site');
END;
--> statement-breakpoint
CREATE TRIGGER trg_chowbot_channel_state_conversation_user_insert
BEFORE INSERT ON chowbot_channel_state
FOR EACH ROW
WHEN NEW.active_conversation_id IS NOT NULL
AND EXISTS (
  SELECT 1 FROM chowbot_conversations
  WHERE id = NEW.active_conversation_id
  AND user_id != NEW.user_id
)
BEGIN
  SELECT RAISE(ABORT, 'active conversation must belong to the same user');
END;
--> statement-breakpoint
CREATE TRIGGER trg_chowbot_channel_state_conversation_user_update
BEFORE UPDATE ON chowbot_channel_state
FOR EACH ROW
WHEN NEW.active_conversation_id IS NOT NULL
AND EXISTS (
  SELECT 1 FROM chowbot_conversations
  WHERE id = NEW.active_conversation_id
  AND user_id != NEW.user_id
)
BEGIN
  SELECT RAISE(ABORT, 'active conversation must belong to the same user');
END;
--> statement-breakpoint
CREATE TRIGGER trg_chowbot_messages_consistency_insert
BEFORE INSERT ON chowbot_messages
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM chowbot_conversations
  WHERE id = NEW.conversation_id
  AND (organization_id != NEW.organization_id OR site_id != NEW.site_id)
)
BEGIN
  SELECT RAISE(ABORT, 'chowbot_messages conversation organization/site mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER trg_chowbot_messages_consistency_update
BEFORE UPDATE ON chowbot_messages
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM chowbot_conversations
  WHERE id = NEW.conversation_id
  AND (organization_id != NEW.organization_id OR site_id != NEW.site_id)
)
BEGIN
  SELECT RAISE(ABORT, 'chowbot_messages conversation organization/site mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER trg_prune_rate_limits
AFTER INSERT ON rate_limits
WHEN abs(random()) % 100 < 5
BEGIN
  DELETE FROM rate_limits WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
END;
