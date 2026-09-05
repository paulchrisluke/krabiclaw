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
CREATE INDEX `account_userId_idx` ON `account` (`userId`);--> statement-breakpoint
CREATE TABLE `availability_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`owner_type` text NOT NULL,
	`location_id` text,
	`experience_id` text,
	`override_date` text NOT NULL,
	`time_slot` text NOT NULL,
	`status` text DEFAULT 'closed' NOT NULL,
	`capacity_override` integer,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`location_id`) REFERENCES `business_locations`(`organization_id`,`site_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`experience_id`) REFERENCES `experiences`(`organization_id`,`site_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "availability_overrides_owner_check" CHECK(
		(owner_type = 'location' AND location_id IS NOT NULL AND experience_id IS NULL)
		OR (owner_type = 'experience' AND location_id IS NULL AND experience_id IS NOT NULL)
	),
	CONSTRAINT "availability_overrides_status_check" CHECK(status IN ('open', 'closed')),
	CONSTRAINT "availability_overrides_capacity_check" CHECK(capacity_override IS NULL OR capacity_override >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `availability_overrides_location_slot_unique` ON `availability_overrides` (`location_id`,`override_date`,`time_slot`) WHERE owner_type = 'location';--> statement-breakpoint
CREATE UNIQUE INDEX `availability_overrides_experience_slot_unique` ON `availability_overrides` (`experience_id`,`override_date`,`time_slot`) WHERE owner_type = 'experience';--> statement-breakpoint
CREATE INDEX `availability_overrides_site_month_idx` ON `availability_overrides` (`site_id`,`override_date`);--> statement-breakpoint
CREATE TABLE `blog_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`excerpt` text,
	`category` text,
	`tags_json` text,
	`nav_section` text,
	`nav_title` text,
	`nav_order` integer,
	`nav_section_order` integer,
	`hide_from_nav` integer DEFAULT 0 NOT NULL,
	`featured_order` integer,
	`status` text DEFAULT 'published' NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`author_id` text,
	`published_at` text,
	`first_published_at` text,
	`scheduled_for` text,
	`slug_manually_overridden` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`seo_title` text,
	`seo_description` text,
	`seo_keywords` text,
	`canonical_url` text,
	`robots` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "blog_posts_status_check" CHECK(status IN ('published', 'scheduled')),
	CONSTRAINT "blog_posts_visibility_check" CHECK(visibility IN ('public', 'unlisted'))
);
--> statement-breakpoint
CREATE INDEX `blog_posts_org_site_idx` ON `blog_posts` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `blog_posts_site_slug_unique` ON `blog_posts` (`site_id`,`slug`);--> statement-breakpoint
CREATE TABLE `booking_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`policy_type` text NOT NULL,
	`scope_type` text NOT NULL,
	`location_id` text,
	`experience_id` text,
	`advance_notice_minutes` integer,
	`free_cancellation_until_minutes` integer,
	`reschedule_allowed` numeric,
	`reschedule_cutoff_minutes` integer,
	`deposit_required` numeric,
	`deposit_trigger_party_size` integer,
	`minimum_guest_age` integer,
	`accessibility_contact_required` numeric,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`experience_id`) REFERENCES `experiences`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "booking_policies_policy_type_check" CHECK(policy_type IN ('reservation', 'experience')),
	CONSTRAINT "booking_policies_scope_type_check" CHECK(scope_type IN ('site', 'location', 'experience')),
	CONSTRAINT "booking_policies_reservation_location_scope_check" CHECK(policy_type != 'reservation' OR (scope_type = 'location' AND location_id IS NOT NULL AND experience_id IS NULL))
);
--> statement-breakpoint
CREATE INDEX `booking_policies_site_type_idx` ON `booking_policies` (`site_id`,`policy_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_policies_reservation_location_unique` ON `booking_policies` (`location_id`) WHERE policy_type = 'reservation' AND scope_type = 'location' AND location_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `booking_policies_experience_site_unique` ON `booking_policies` (`site_id`) WHERE policy_type = 'experience' AND scope_type = 'site';--> statement-breakpoint
CREATE UNIQUE INDEX `booking_policies_experience_location_unique` ON `booking_policies` (`location_id`) WHERE policy_type = 'experience' AND scope_type = 'location' AND location_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `booking_policies_experience_scope_unique` ON `booking_policies` (`experience_id`) WHERE policy_type = 'experience' AND scope_type = 'experience' AND experience_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `booking_policies_organization_id_idx` ON `booking_policies` (`organization_id`);--> statement-breakpoint
CREATE TABLE `business_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`slug` text NOT NULL,
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
	`google_review_url` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`notification_phone` text,
	`timezone` text,
	`max_capacity` integer,
	`seo_title` text,
	`seo_description` text,
	`canonical_url` text,
	`robots` text,
	`team_id` text,
	`feature_overrides` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`facebook_connection_id`) REFERENCES `facebook_pages_connections`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `business_locations_organization_id_site_id_slug_unique` ON `business_locations` (`organization_id`,`site_id`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `business_locations_organization_id_site_id_id_unique` ON `business_locations` (`organization_id`,`site_id`,`id`);--> statement-breakpoint
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
CREATE INDEX `idx_canary_runs_status_created` ON `canary_runs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_canary_runs_type_created` ON `canary_runs` (`run_type`,`created_at`);--> statement-breakpoint
CREATE TABLE `chowbot_channel_state` (
	`user_id` text NOT NULL,
	`channel` text NOT NULL,
	`selected_site_id` text,
	`active_conversation_id` text,
	`pending_message_id` text,
	`pending_confirmation` text,
	`last_inbound_id` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`user_id`, `channel`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`selected_site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`active_conversation_id`) REFERENCES `chowbot_conversations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`pending_message_id`) REFERENCES `chowbot_messages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`active_conversation_id`,`selected_site_id`,`user_id`) REFERENCES `chowbot_conversations`(`id`,`site_id`,`user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chowbot_channel_state_active_site_check" CHECK(active_conversation_id IS NULL OR selected_site_id IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `chowbot_channel_state_user_id_idx` ON `chowbot_channel_state` (`user_id`);--> statement-breakpoint
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
CREATE INDEX `chowbot_conversations_org_site_idx` ON `chowbot_conversations` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX `chowbot_conversations_user_id_idx` ON `chowbot_conversations` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_chowbot_conversations_site` ON `chowbot_conversations` (`site_id`,`user_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `chowbot_conversations_id_site_user_unique` ON `chowbot_conversations` (`id`,`site_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `chowbot_conversations_id_org_site_unique` ON `chowbot_conversations` (`id`,`organization_id`,`site_id`);--> statement-breakpoint
CREATE TABLE `chowbot_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`user_id` text,
	`role` text NOT NULL,
	`channel` text NOT NULL,
	`content` text,
	`meta_message_id` text,
	`tool_calls` text,
	`status` text DEFAULT 'sent' NOT NULL,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `chowbot_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`conversation_id`,`organization_id`,`site_id`) REFERENCES `chowbot_conversations`(`id`,`organization_id`,`site_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chowbot_messages_meta_message_id_unique` ON `chowbot_messages` (`meta_message_id`);--> statement-breakpoint
CREATE INDEX `idx_chowbot_messages_conversation` ON `chowbot_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `chowbot_messages_org_site_idx` ON `chowbot_messages` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE TABLE `contact_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`subject` text,
	`message` text NOT NULL,
	`consent_at` text,
	`status` text DEFAULT 'new' NOT NULL,
	`ip_hash` text,
	`location_id` text,
	`experience_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`experience_id`) REFERENCES `experiences`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `contact_submissions_org_site_idx` ON `contact_submissions` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX `contact_submissions_location_idx` ON `contact_submissions` (`location_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_contact_submissions_site` ON `contact_submissions` (`site_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `content_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`parent_block_id` text,
	`type` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`level` integer,
	`data_json` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `content_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `content_blocks_document_position_idx` ON `content_blocks` (`document_id`,`position`);--> statement-breakpoint
CREATE INDEX `content_blocks_parent_idx` ON `content_blocks` (`parent_block_id`);--> statement-breakpoint
CREATE TABLE `content_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_documents_owner_unique` ON `content_documents` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`user_id` text,
	`stripe_customer_id` text,
	`name` text,
	`email` text,
	`email_normalized` text,
	`email_hash` text,
	`phone` text,
	`phone_normalized` text,
	`phone_metadata_version` text,
	`source` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`review_request_opted_out_at` text,
	`marketing_opted_out_at` text,
	`loyalty_points_balance` integer DEFAULT 0 NOT NULL,
	`last_booking_at` text,
	`last_review_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "customers_source_check" CHECK(source IN ('reservation', 'experience_booking', 'review_request', 'manual', 'stripe', 'import')),
	CONSTRAINT "customers_status_check" CHECK(status IN ('active', 'merged', 'suppressed', 'deleted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_customers_site_email_normalized_unique` ON `customers` (`site_id`,`email_normalized`) WHERE email_normalized IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_customers_stripe_customer_id_unique` ON `customers` (`stripe_customer_id`) WHERE stripe_customer_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_customers_organization_id` ON `customers` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_customers_site_id` ON `customers` (`site_id`);--> statement-breakpoint
CREATE INDEX `idx_customers_org_site_email_hash` ON `customers` (`organization_id`,`site_id`,`email_hash`);--> statement-breakpoint
CREATE INDEX `idx_customers_user_id` ON `customers` (`user_id`);--> statement-breakpoint
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
CREATE INDEX `idx_domain_reconciliation_jobs_due` ON `domain_reconciliation_jobs` (`status`,`run_after`);--> statement-breakpoint
CREATE TABLE `experience_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`experience_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`customer_id` text,
	`location_id` text NOT NULL,
	`guest_name` text NOT NULL,
	`guest_email` text NOT NULL,
	`guest_phone` text,
	`party_size` integer DEFAULT 1 NOT NULL,
	`booking_date` text NOT NULL,
	`time_slot` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`ip_hash` text,
	`cancellation_token_hash` text,
	`cancellation_token_expires_at` text,
	`cancellation_token_used_at` text,
	`completed_at` text,
	`completion_source` text,
	`review_request_sent_at` text,
	`review_reminder_sent_at` text,
	`review_submitted_at` text,
	`review_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`experience_id`) REFERENCES `experiences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "experience_bookings_completion_source_check" CHECK(completion_source IS NULL OR completion_source IN ('manual', 'auto'))
);
--> statement-breakpoint
CREATE INDEX `idx_experience_bookings_customer_id` ON `experience_bookings` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_experience_bookings_review_request_due` ON `experience_bookings` (`site_id`,`status`,`completed_at`,`review_request_sent_at`);--> statement-breakpoint
CREATE INDEX `idx_experience_bookings_review_reminder_due` ON `experience_bookings` (`site_id`,`review_request_sent_at`,`review_reminder_sent_at`,`review_submitted_at`);--> statement-breakpoint
CREATE INDEX `experience_bookings_site_date_owner_slot_idx` ON `experience_bookings` (`site_id`,`booking_date`,`experience_id`,`time_slot`,`status`);--> statement-breakpoint
CREATE INDEX `experience_bookings_organization_id_idx` ON `experience_bookings` (`organization_id`);--> statement-breakpoint
CREATE TABLE `experiences` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`tagline` text,
	`pricing_note` text,
	`duration_minutes` integer,
	`max_capacity` integer,
	`time_slots` text,
	`recurring_slots` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`included_items` text,
	`what_to_bring` text,
	`meeting_point` text,
	`cancellation_policy` text,
	FOREIGN KEY (`id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`location_id`,`id`) REFERENCES `products`(`organization_id`,`site_id`,`location_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `experiences_org_site_idx` ON `experiences` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `experiences_org_site_id_unique` ON `experiences` (`organization_id`,`site_id`,`id`);--> statement-breakpoint
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
CREATE TABLE `guest_thread_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`channel` text NOT NULL,
	`provider` text NOT NULL,
	`purpose` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider_message_id` text,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `guest_thread_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "guest_thread_deliveries_channel_check" CHECK(channel IN ('email', 'whatsapp')),
	CONSTRAINT "guest_thread_deliveries_provider_check" CHECK((channel = 'email' AND provider IN ('resend', 'log_only')) OR (channel = 'whatsapp' AND provider IN ('meta', 'log_only'))),
	CONSTRAINT "guest_thread_deliveries_purpose_check" CHECK(purpose IN ('owner_alert', 'guest_acknowledgement', 'member_reply', 'status_update')),
	CONSTRAINT "guest_thread_deliveries_status_check" CHECK(status IN ('pending', 'accepted', 'sent', 'delivered', 'read', 'failed', 'unknown'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guest_thread_deliveries_provider_message_unique` ON `guest_thread_deliveries` (`provider`,`provider_message_id`) WHERE provider_message_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `guest_thread_deliveries_entry_status_idx` ON `guest_thread_deliveries` (`entry_id`,`status`);--> statement-breakpoint
CREATE TABLE `guest_thread_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`kind` text NOT NULL,
	`actor_kind` text NOT NULL,
	`actor_user_id` text,
	`channel` text,
	`body` text,
	`event_name` text,
	`payload_json` text,
	`dedupe_key` text NOT NULL,
	`sequence` integer NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `guest_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "guest_thread_entries_kind_check" CHECK(kind IN ('submission', 'message', 'operation', 'assignment', 'resolution')),
	CONSTRAINT "guest_thread_entries_actor_kind_check" CHECK(actor_kind IN ('guest', 'member', 'system')),
	CONSTRAINT "guest_thread_entries_channel_check" CHECK(channel IS NULL OR channel IN ('web', 'email', 'whatsapp', 'system'))
);
--> statement-breakpoint
CREATE INDEX `guest_thread_entries_thread_occurred_idx` ON `guest_thread_entries` (`thread_id`,`occurred_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `guest_thread_entries_dedupe_key_unique` ON `guest_thread_entries` (`dedupe_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `guest_thread_entries_thread_sequence_unique` ON `guest_thread_entries` (`thread_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `guest_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`submission_type` text NOT NULL,
	`submission_id` text NOT NULL,
	`guest_name` text NOT NULL,
	`guest_email` text,
	`guest_phone` text,
	`conversation_state` text DEFAULT 'needs_attention' NOT NULL,
	`resolved_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "guest_threads_submission_type_check" CHECK(submission_type IN ('contact', 'reservation', 'experience_booking')),
	CONSTRAINT "guest_threads_conversation_state_check" CHECK(conversation_state IN ('needs_attention', 'waiting_on_guest', 'resolved'))
);
--> statement-breakpoint
CREATE INDEX `guest_threads_site_updated_idx` ON `guest_threads` (`site_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `guest_threads_location_updated_idx` ON `guest_threads` (`location_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `guest_threads_conversation_state_idx` ON `guest_threads` (`site_id`,`conversation_state`,`updated_at`);--> statement-breakpoint
CREATE INDEX `guest_threads_organization_id_idx` ON `guest_threads` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `guest_threads_submission_unique` ON `guest_threads` (`submission_type`,`submission_id`);--> statement-breakpoint
CREATE TABLE `invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text NOT NULL,
	`email` text NOT NULL,
	`role` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expiresAt` integer NOT NULL,
	`inviterId` text NOT NULL,
	`teamId` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviterId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`teamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `invitation_organizationId_idx` ON `invitation` (`organizationId`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invitation_org_pending_owner` ON `invitation` (`organizationId`) WHERE role = 'owner' AND status = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invitation_org_email_pending_unique` ON `invitation` (`organizationId`,lower("email")) WHERE status = 'pending';--> statement-breakpoint
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
	`location_id` text,
	`page_path` text,
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
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "location_qa_scope_check" CHECK(location_id IS NULL OR page_path IS NULL),
	CONSTRAINT "location_qa_page_path_check" CHECK(page_path IS NULL OR page_path LIKE '/%'),
	CONSTRAINT "location_qa_source_check" CHECK(source IN ('manual','import','template')),
	CONSTRAINT "location_qa_status_check" CHECK(status IN ('published','hidden'))
);
--> statement-breakpoint
CREATE INDEX `idx_location_qa_location` ON `location_qa` (`location_id`,`status`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_location_qa_site` ON `location_qa` (`site_id`,`status`,`sort_order`) WHERE location_id IS NULL;--> statement-breakpoint
CREATE INDEX `idx_location_qa_page` ON `location_qa` (`site_id`,`page_path`,`status`,`sort_order`) WHERE location_id IS NULL AND page_path IS NOT NULL;--> statement-breakpoint
CREATE INDEX `location_qa_organization_id_idx` ON `location_qa` (`organization_id`);--> statement-breakpoint
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
	`http_status` integer,
	`jsonrpc_error_code` integer,
	`jsonrpc_error_message` text,
	`protocol_version` text,
	`session_id_hash` text,
	`oauth_client_id_hash` text,
	`user_agent` text,
	`cf_ray_id` text,
	`catalog_fingerprint` text,
	`unknown_tool_name` text,
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
CREATE INDEX `idx_mcp_tool_call_events_org` ON `mcp_tool_call_events` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_mcp_tool_call_events_method_created` ON `mcp_tool_call_events` (`method`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_mcp_tool_call_events_session` ON `mcp_tool_call_events` (`session_id_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_mcp_tool_call_events_unknown` ON `mcp_tool_call_events` (`unknown_tool_name`,`created_at`);--> statement-breakpoint
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
	`kind` text NOT NULL,
	`provider` text NOT NULL,
	`source` text NOT NULL,
	`cloudflare_image_id` text,
	`r2_key` text,
	`public_url` text,
	`thumbnail_url` text,
	`mime_type` text,
	`file_name` text,
	`file_size` integer,
	`width` integer,
	`height` integer,
	`duration` integer,
	`alt_text` text,
	`generation_key` text,
	`category` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "media_assets_category_check" CHECK(category IS NULL OR category IN ('exterior', 'interior', 'food', 'menu', 'team', 'other', 'logo', 'blog')),
	CONSTRAINT "media_assets_video_thumbnail_check" CHECK(kind <> 'video' OR (thumbnail_url IS NOT NULL AND length(trim(thumbnail_url)) > 0)),
	CONSTRAINT "media_assets_status_check" CHECK(status IN ('pending', 'active', 'deleted', 'failed')),
	CONSTRAINT "media_assets_provider_check" CHECK(provider IN ('cloudflare_images', 'cloudflare_r2')),
	CONSTRAINT "media_assets_source_check" CHECK(source IN ('uploaded', 'generated', 'external'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_org_site_id_unique` ON `media_assets` (`organization_id`,`site_id`,`id`);--> statement-breakpoint
CREATE TABLE `media_placements` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`slot` text NOT NULL,
	`asset_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`asset_id`) REFERENCES `media_assets`(`organization_id`,`site_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "media_placements_status_check" CHECK("media_placements"."status" IN ('pending', 'active', 'rejected'))
);
--> statement-breakpoint
CREATE INDEX `media_placements_asset_idx` ON `media_placements` (`organization_id`,`site_id`,`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_placements_site_owner_slot_asset_unique` ON `media_placements` (`site_id`,`owner_type`,`owner_id`,`slot`,`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_placements_site_owner_slot_order_unique` ON `media_placements` (`site_id`,`owner_type`,`owner_id`,`slot`,`sort_order`);--> statement-breakpoint
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
CREATE INDEX `member_userId_organizationId_idx` ON `member` (`userId`,`organizationId`);--> statement-breakpoint
CREATE INDEX `member_organizationId_idx` ON `member` (`organizationId`);--> statement-breakpoint
CREATE TABLE `notification_reads` (
	`notification_id` text NOT NULL,
	`user_id` text NOT NULL,
	`read_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`notification_id`, `user_id`),
	FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_reads_user_read_at_idx` ON `notification_reads` (`user_id`,`read_at`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`site_id` text,
	`location_id` text,
	`source_entry_id` text,
	`scope` text DEFAULT 'organization' NOT NULL,
	`severity` text DEFAULT 'info' NOT NULL,
	`target_user_id` text,
	`deep_link` text,
	`message` text,
	`template` text NOT NULL,
	`title` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_entry_id`) REFERENCES `guest_thread_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `notifications_scope_created_at_idx` ON `notifications` (`scope`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_organization_created_at_idx` ON `notifications` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_site_created_at_idx` ON `notifications` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_target_user_created_at_idx` ON `notifications` (`target_user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_source_entry_unique` ON `notifications` (`source_entry_id`) WHERE source_entry_id IS NOT NULL;--> statement-breakpoint
CREATE TABLE `oauthAccessToken` (
	`id` text PRIMARY KEY NOT NULL,
	`clientId` text NOT NULL,
	`userId` text,
	`token` text NOT NULL,
	`scopes` text DEFAULT '[]' NOT NULL,
	`authorizationCodeId` text,
	`resources` text,
	`requestedUserInfoClaims` text,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`sessionId` text,
	`referenceId` text,
	`refreshId` text,
	`revoked` integer,
	`confirmation` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauthAccessToken_token_unique` ON `oauthAccessToken` (`token`);--> statement-breakpoint
CREATE TABLE `oauthClient` (
	`id` text PRIMARY KEY NOT NULL,
	`clientId` text NOT NULL,
	`clientSecret` text,
	`name` text NOT NULL,
	`redirectUris` text NOT NULL,
	`scopesJson` text DEFAULT '[]' NOT NULL,
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
	`backchannelLogoutUri` text,
	`backchannelLogoutSessionRequired` integer DEFAULT 0 NOT NULL,
	`tokenEndpointAuthMethod` text,
	`jwks` text,
	`jwksUri` text,
	`grantTypes` text,
	`responseTypes` text,
	`type` text,
	`dpopBoundAccessTokens` integer DEFAULT 0 NOT NULL,
	`referenceId` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauthClient_clientId_unique` ON `oauthClient` (`clientId`);--> statement-breakpoint
CREATE TABLE `oauthClientAssertion` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauthClientResource` (
	`id` text PRIMARY KEY NOT NULL,
	`clientId` text NOT NULL,
	`resourceId` text NOT NULL,
	`metadata` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`clientId`) REFERENCES `oauthClient`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resourceId`) REFERENCES `oauthResource`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `oauthConsent` (
	`id` text PRIMARY KEY NOT NULL,
	`clientId` text NOT NULL,
	`userId` text NOT NULL,
	`scopes` text DEFAULT '' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`referenceId` text,
	`resources` text,
	`requestedUserInfoClaims` text
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
	`authorizationCodeId` text,
	`resources` text,
	`requestedUserInfoClaims` text,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`sessionId` text,
	`referenceId` text,
	`revoked` integer,
	`rotatedAt` integer,
	`rotationReplayResponse` text,
	`rotationReplayExpiresAt` integer,
	`authTime` integer,
	`confirmation` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauthRefreshToken_token_unique` ON `oauthRefreshToken` (`token`);--> statement-breakpoint
CREATE TABLE `oauthResource` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`name` text NOT NULL,
	`accessTokenTtl` integer,
	`refreshTokenTtl` integer,
	`signingAlgorithm` text,
	`signingKeyId` text,
	`allowedScopes` text,
	`customClaims` text,
	`dpopBoundAccessTokensRequired` integer DEFAULT 0 NOT NULL,
	`disabled` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`policyVersion` integer DEFAULT 1 NOT NULL,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauthResource_identifier_unique` ON `oauthResource` (`identifier`);--> statement-breakpoint
CREATE TABLE `offerings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`label` text,
	`summary` text,
	`short_description` text,
	`body` text,
	`features` text,
	`faqs` text,
	`cta_label` text,
	`cta_url` text,
	`schema_type` text,
	`seo_title` text,
	`seo_description` text,
	`canonical_path` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`featured` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`source_ref` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `offerings_site_sort_idx` ON `offerings` (`site_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `offerings_organization_id_site_id_slug_unique` ON `offerings` (`organization_id`,`site_id`,`slug`);--> statement-breakpoint
CREATE TABLE `onboarding_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text,
	`name` text NOT NULL,
	`vertical` text NOT NULL,
	`subdomain_candidate` text,
	`source_type` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`payload_json` text NOT NULL,
	`committed_site_id` text,
	`committed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`committed_site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "onboarding_drafts_status_check" CHECK(status IN ('active', 'committing', 'committed', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_onboarding_drafts_active_user_unique` ON `onboarding_drafts` (`user_id`) WHERE status = 'active';--> statement-breakpoint
CREATE INDEX `onboarding_drafts_user_id_idx` ON `onboarding_drafts` (`user_id`);--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo` text,
	`metadata` text,
	`stripeCustomerId` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "organization_slug_required_check" CHECK(trim("organization"."slug") <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_unique` ON `organization` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_stripeCustomerId_unique` ON `organization` (`stripeCustomerId`);--> statement-breakpoint
CREATE TABLE `organization_billing` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`stripe_customer_id` text,
	`stripe_subscription_id` text,
	`payment_status` text DEFAULT 'unknown' NOT NULL,
	`paid_through` text,
	`past_due_since` text,
	`last_paid_invoice_id` text,
	`last_payment_event_created` integer,
	`last_payment_event_id` text,
	`access_plan` text DEFAULT 'free' NOT NULL,
	`access_expires_at` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "organization_billing_access_plan_check" CHECK("organization_billing"."access_plan" IN ('free', 'growth', 'managed', 'seo_accelerator'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_billing_stripe_customer_id_unique` ON `organization_billing` (`stripe_customer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_billing_stripe_subscription_id_unique` ON `organization_billing` (`stripe_subscription_id`);--> statement-breakpoint
CREATE TABLE `organization_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text,
	`location_id` text,
	`actor_id` text,
	`event_type` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`metadata` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `organization_events_org_created_idx` ON `organization_events` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `organization_events_location_created_idx` ON `organization_events` (`location_id`,`created_at`) WHERE location_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `organization_events_site_created_idx` ON `organization_events` (`site_id`,`created_at`) WHERE site_id IS NOT NULL;--> statement-breakpoint
CREATE TABLE `platform_contact_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`topic` text,
	`message` text NOT NULL,
	`source` text DEFAULT 'contact_page' NOT NULL,
	`route_context` text,
	`suggested_summary` text,
	`agent_metadata_json` text,
	`status` text DEFAULT 'new' NOT NULL,
	`ip_hash` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_platform_contact_submissions_status_created` ON `platform_contact_submissions` (`status`,`created_at`);--> statement-breakpoint
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
CREATE TABLE `platform_docs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`excerpt` text,
	`category` text,
	`nav_section` text,
	`nav_title` text,
	`nav_order` integer,
	`nav_section_order` integer,
	`nav_group` text,
	`nav_group_order` integer,
	`hide_from_nav` integer DEFAULT 0 NOT NULL,
	`featured_order` integer,
	`author_id` text,
	`seo_description` text,
	`seo_keywords` text,
	`sort_order` integer DEFAULT 0,
	`difficulty_level` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`canonical_url` text,
	`robots` text,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_docs_slug_unique` ON `platform_docs` (`slug`);--> statement-breakpoint
CREATE TABLE `platform_locale_catalogs` (
	`locale` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`direction` text NOT NULL,
	`status` text DEFAULT 'unavailable' NOT NULL,
	`source_manifest_hash` text,
	`available_at` text,
	`available_by_user_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by_user_id` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by_user_id` text NOT NULL,
	CONSTRAINT "platform_locale_catalogs_direction_check" CHECK("platform_locale_catalogs"."direction" IN ('ltr', 'rtl')),
	CONSTRAINT "platform_locale_catalogs_status_check" CHECK("platform_locale_catalogs"."status" IN ('unavailable', 'available'))
);
--> statement-breakpoint
CREATE TABLE `platform_locale_messages` (
	`locale` text NOT NULL,
	`message_key` text NOT NULL,
	`message_value` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by_user_id` text NOT NULL,
	PRIMARY KEY(`locale`, `message_key`),
	FOREIGN KEY (`locale`) REFERENCES `platform_locale_catalogs`(`locale`) ON UPDATE no action ON DELETE cascade
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
CREATE UNIQUE INDEX `post_channel_jobs_post_channel_unique` ON `post_channel_jobs` (`post_id`,`channel`);--> statement-breakpoint
CREATE UNIQUE INDEX `post_channel_jobs_provider_post_unique` ON `post_channel_jobs` (`organization_id`,`channel`,`provider_post_id`);--> statement-breakpoint
CREATE INDEX `post_channel_jobs_post_id_idx` ON `post_channel_jobs` (`post_id`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`slug` text,
	`post_type` text DEFAULT 'standard' NOT NULL,
	`title` text,
	`body` text NOT NULL,
	`seo_title` text,
	`seo_description` text,
	`cta_type` text,
	`cta_url` text,
	`event_title` text,
	`event_start` text,
	`event_end` text,
	`offer_coupon` text,
	`offer_terms` text,
	`status` text DEFAULT 'published' NOT NULL,
	`scheduled_for` text,
	`published_at` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "posts_status_check" CHECK(status IN ('published', 'scheduled')),
	CONSTRAINT "posts_source_check" CHECK(source IN ('manual', 'template')),
	CONSTRAINT "posts_post_type_check" CHECK(post_type IN ('standard', 'offer', 'event', 'update'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_site_slug_idx` ON `posts` (`site_id`,`slug`);--> statement-breakpoint
CREATE INDEX `posts_org_site_idx` ON `posts` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE TABLE `prices` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`product_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`unit` text DEFAULT 'item' NOT NULL,
	`tax_behavior` text DEFAULT 'unspecified' NOT NULL,
	`compare_at_amount_minor` integer,
	`valid_from` text NOT NULL,
	`valid_until` text,
	`provenance` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`location_id`,`product_id`) REFERENCES `products`(`organization_id`,`site_id`,`location_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "prices_amount_check" CHECK("prices"."amount_minor" >= 0),
	CONSTRAINT "prices_compare_at_check" CHECK("prices"."compare_at_amount_minor" IS NULL OR "prices"."compare_at_amount_minor" > "prices"."amount_minor"),
	CONSTRAINT "prices_currency_check" CHECK("prices"."currency" IN ('THB','USD','EUR','GBP','JPY','AUD','CAD','SGD','HKD','MYR','IDR','PHP','VND','INR')),
	CONSTRAINT "prices_unit_check" CHECK("prices"."unit" IN ('item', 'person', 'table')),
	CONSTRAINT "prices_tax_behavior_check" CHECK("prices"."tax_behavior" IN ('unspecified', 'inclusive', 'exclusive')),
	CONSTRAINT "prices_validity_check" CHECK("prices"."valid_until" IS NULL OR "prices"."valid_until" > "prices"."valid_from")
);
--> statement-breakpoint
CREATE INDEX `prices_product_validity_idx` ON `prices` (`organization_id`,`site_id`,`product_id`,`valid_from`,`valid_until`);--> statement-breakpoint
CREATE INDEX `prices_site_location_validity_idx` ON `prices` (`site_id`,`location_id`,`valid_from`,`valid_until`);--> statement-breakpoint
CREATE TABLE `product_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`product_type` text DEFAULT 'standard' NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`location_id`) REFERENCES `business_locations`(`organization_id`,`site_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "product_categories_name_not_blank_check" CHECK(trim("product_categories"."name") <> ''),
	CONSTRAINT "product_categories_slug_check" CHECK("product_categories"."slug" <> '' AND "product_categories"."slug" = lower("product_categories"."slug") AND "product_categories"."slug" NOT GLOB '*[^a-z0-9-]*' AND "product_categories"."slug" NOT LIKE '-%' AND "product_categories"."slug" NOT LIKE '%-' AND "product_categories"."slug" NOT LIKE '%--%'),
	CONSTRAINT "product_categories_sort_order_check" CHECK("product_categories"."sort_order" >= 0),
	CONSTRAINT "product_categories_type_check" CHECK("product_categories"."product_type" IN ('standard', 'experience'))
);
--> statement-breakpoint
CREATE INDEX `product_categories_location_type_sort_idx` ON `product_categories` (`site_id`,`location_id`,`product_type`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_categories_scope_id_unique` ON `product_categories` (`organization_id`,`site_id`,`location_id`,`product_type`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_categories_location_type_slug_unique` ON `product_categories` (`site_id`,`location_id`,`product_type`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_categories_location_type_name_unique` ON `product_categories` (`site_id`,`location_id`,`product_type`,`name`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`product_type` text DEFAULT 'standard' NOT NULL,
	`category_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`order_url` text,
	`is_visible` integer DEFAULT 1 NOT NULL,
	`available` integer DEFAULT 1 NOT NULL,
	`featured` integer DEFAULT 0 NOT NULL,
	`featured_sort_order` integer DEFAULT 0 NOT NULL,
	`sort_order` integer NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`details_json` text DEFAULT '[]' NOT NULL,
	`seo_title` text,
	`seo_description` text,
	`canonical_url` text,
	`robots` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`location_id`) REFERENCES `business_locations`(`organization_id`,`site_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`location_id`,`product_type`,`category_id`) REFERENCES `product_categories`(`organization_id`,`site_id`,`location_id`,`product_type`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "products_name_not_blank_check" CHECK(trim("products"."name") <> ''),
	CONSTRAINT "products_slug_check" CHECK("products"."slug" <> '' AND "products"."slug" = lower("products"."slug") AND "products"."slug" NOT GLOB '*[^a-z0-9-]*' AND "products"."slug" NOT LIKE '-%' AND "products"."slug" NOT LIKE '%-' AND "products"."slug" NOT LIKE '%--%'),
	CONSTRAINT "products_sort_order_check" CHECK("products"."sort_order" >= 0),
	CONSTRAINT "products_featured_sort_order_check" CHECK("products"."featured_sort_order" >= 0),
	CONSTRAINT "products_boolean_check" CHECK("products"."is_visible" IN (0, 1) AND "products"."available" IN (0, 1) AND "products"."featured" IN (0, 1)),
	CONSTRAINT "products_type_check" CHECK("products"."product_type" IN ('standard', 'experience')),
	CONSTRAINT "products_tags_json_check" CHECK(json_valid("products"."tags_json") AND json_type("products"."tags_json") = 'array'),
	CONSTRAINT "products_details_json_check" CHECK(json_valid("products"."details_json") AND json_type("products"."details_json") = 'array'),
	CONSTRAINT "products_source_check" CHECK("products"."source" IN ('manual', 'template', 'ai', 'import', 'copy')),
	CONSTRAINT "products_order_url_check" CHECK("products"."order_url" IS NULL OR ("products"."order_url" LIKE 'https://_%' AND instr("products"."order_url", '@') = 0 AND instr("products"."order_url", char(10)) = 0 AND instr("products"."order_url", char(13)) = 0)),
	CONSTRAINT "products_robots_check" CHECK("products"."robots" IS NULL OR "products"."robots" IN ('index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow'))
);
--> statement-breakpoint
CREATE INDEX `products_category_sort_order_idx` ON `products` (`category_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `products_site_location_type_sort_order_idx` ON `products` (`site_id`,`location_id`,`product_type`,`sort_order`);--> statement-breakpoint
CREATE INDEX `products_site_location_visible_sort_idx` ON `products` (`site_id`,`location_id`,`is_visible`,`sort_order`);--> statement-breakpoint
CREATE INDEX `products_site_location_featured_sort_idx` ON `products` (`site_id`,`location_id`,`featured`,`featured_sort_order`);--> statement-breakpoint
CREATE INDEX `products_organization_site_idx` ON `products` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_scope_id_unique` ON `products` (`organization_id`,`site_id`,`location_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_site_location_slug_unique` ON `products` (`site_id`,`location_id`,`slug`);--> statement-breakpoint
CREATE TABLE `public_resource_cache_invalidations` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`claimed_at` text,
	`processed_at` text,
	`last_error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `public_resource_cache_invalidations_status_idx` ON `public_resource_cache_invalidations` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `public_resource_cache_invalidations_site_idx` ON `public_resource_cache_invalidations` (`site_id`,`status`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`expires_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_rate_limits_expires` ON `rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `reservation_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`customer_id` text,
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
	`completed_at` text,
	`completion_source` text,
	`review_request_sent_at` text,
	`review_reminder_sent_at` text,
	`review_submitted_at` text,
	`review_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "reservation_submissions_completion_source_check" CHECK(completion_source IS NULL OR completion_source IN ('manual', 'auto'))
);
--> statement-breakpoint
CREATE INDEX `idx_reservation_submissions_customer_id` ON `reservation_submissions` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_reservation_submissions_review_request_due` ON `reservation_submissions` (`site_id`,`status`,`completed_at`,`review_request_sent_at`);--> statement-breakpoint
CREATE INDEX `idx_reservation_submissions_review_reminder_due` ON `reservation_submissions` (`site_id`,`review_request_sent_at`,`review_reminder_sent_at`,`review_submitted_at`);--> statement-breakpoint
CREATE INDEX `reservation_submissions_site_date_owner_slot_idx` ON `reservation_submissions` (`site_id`,`date`,`location_id`,`time`,`status`);--> statement-breakpoint
CREATE INDEX `reservation_submissions_organization_id_idx` ON `reservation_submissions` (`organization_id`);--> statement-breakpoint
CREATE TABLE `resource_localizations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`locale` text NOT NULL,
	`values_json` text NOT NULL,
	`route_path` text,
	`document_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by_user_id` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by_user_id` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `content_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`site_id`,`locale`) REFERENCES `site_locales`(`organization_id`,`site_id`,`locale`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "resource_localizations_values_json_check" CHECK(json_valid("resource_localizations"."values_json") AND json_type("resource_localizations"."values_json") = 'object'),
	CONSTRAINT "resource_localizations_non_english_check" CHECK("resource_localizations"."locale" <> 'en'),
	CONSTRAINT "resource_localizations_route_path_check" CHECK("resource_localizations"."route_path" IS NULL OR ("resource_localizations"."route_path" LIKE '/' || "resource_localizations"."locale" || '/%' AND "resource_localizations"."route_path" NOT LIKE '%?%' AND "resource_localizations"."route_path" NOT LIKE '%#%' AND "resource_localizations"."route_path" NOT LIKE '%//%'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resource_localizations_site_locale_route_unique` ON `resource_localizations` (`site_id`,`locale`,`route_path`) WHERE route_path IS NOT NULL;--> statement-breakpoint
CREATE INDEX `resource_localizations_site_locale_type_idx` ON `resource_localizations` (`site_id`,`locale`,`resource_type`);--> statement-breakpoint
CREATE INDEX `resource_localizations_resource_idx` ON `resource_localizations` (`resource_type`,`resource_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `resource_localizations_org_site_resource_locale_unique` ON `resource_localizations` (`organization_id`,`site_id`,`resource_type`,`resource_id`,`locale`);--> statement-breakpoint
CREATE TABLE `review_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`customer_id` text NOT NULL,
	`booking_type` text NOT NULL,
	`booking_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`first_sent_at` text,
	`reminder_sent_at` text,
	`submitted_at` text,
	`clicked_at` text,
	`revoked_at` text,
	`send_count` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`anonymous_user_id` text,
	`user_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`anonymous_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "review_requests_booking_type_check" CHECK(booking_type IN ('reservation', 'experience_booking'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_requests_token_hash_unique` ON `review_requests` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_review_requests_active_booking_unique` ON `review_requests` (`site_id`,`booking_type`,`booking_id`) WHERE revoked_at IS NULL AND submitted_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_review_requests_send_due` ON `review_requests` (`site_id`,`first_sent_at`,`reminder_sent_at`,`submitted_at`,`expires_at`);--> statement-breakpoint
CREATE INDEX `review_requests_organization_id_idx` ON `review_requests` (`organization_id`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`site_id` text,
	`location_id` text,
	`customer_id` text,
	`booking_id` text,
	`booking_type` text,
	`review_request_id` text,
	`user_id` text,
	`product_id` text,
	`author_name` text,
	`rating` integer NOT NULL,
	`title` text,
	`content` text,
	`google_review_id` text,
	`owner_reply` text,
	`owner_reply_at` text,
	`helpful_count` integer DEFAULT 0,
	`status` text DEFAULT 'pending',
	`source` text DEFAULT 'direct',
	`entered_by_user_id` text,
	`collection_method` text,
	`original_review_date` text,
	`original_reference` text,
	`publication_authorized` integer DEFAULT 0 NOT NULL,
	`ip_hash` text,
	`user_agent` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`review_request_id`) REFERENCES `review_requests`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`entered_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`,`site_id`,`location_id`,`product_id`) REFERENCES `products`(`organization_id`,`site_id`,`location_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "reviews_booking_type_check" CHECK(booking_type IS NULL OR booking_type IN ('reservation', 'experience_booking')),
	CONSTRAINT "reviews_rating_check" CHECK(rating BETWEEN 1 AND 5),
	CONSTRAINT "reviews_publication_authorized_check" CHECK(publication_authorized IN (0, 1)),
	CONSTRAINT "reviews_collection_method_check" CHECK(collection_method IS NULL OR collection_method IN ('in_person', 'email', 'phone', 'migration', 'other')),
	CONSTRAINT "reviews_product_scope_check" CHECK(product_id IS NULL OR (organization_id IS NOT NULL AND site_id IS NOT NULL AND location_id IS NOT NULL)),
	CONSTRAINT "reviews_owner_entered_provenance_check" CHECK(source != 'owner_entered' OR (organization_id IS NOT NULL AND site_id IS NOT NULL AND location_id IS NULL AND entered_by_user_id IS NOT NULL AND collection_method IS NOT NULL AND publication_authorized = 1))
);
--> statement-breakpoint
CREATE INDEX `idx_reviews_request_id` ON `reviews` (`review_request_id`);--> statement-breakpoint
CREATE INDEX `idx_reviews_customer_id` ON `reviews` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_reviews_location_status` ON `reviews` (`location_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_reviews_site_status` ON `reviews` (`site_id`,`status`,`created_at`) WHERE location_id IS NULL;--> statement-breakpoint
CREATE INDEX `idx_reviews_product_status_created` ON `reviews` (`product_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `reviews_organization_id_idx` ON `reviews` (`organization_id`);--> statement-breakpoint
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
CREATE INDEX `session_userId_idx` ON `session` (`userId`);--> statement-breakpoint
CREATE TABLE `site_analytics_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`date` text NOT NULL,
	`page_views` integer DEFAULT 0,
	`unique_sessions` integer DEFAULT 0,
	`avg_session_duration` integer DEFAULT 0,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`unique_visitors` integer DEFAULT 0,
	`pages_per_session` real DEFAULT 0,
	`returning_visitors` integer DEFAULT 0,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `site_analytics_daily_organization_id_idx` ON `site_analytics_daily` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_analytics_daily_site_id_date_unique` ON `site_analytics_daily` (`site_id`,`date`);--> statement-breakpoint
CREATE TABLE `site_analytics_dimension_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`date` text NOT NULL,
	`dimension` text NOT NULL,
	`value` text NOT NULL,
	`subvalue` text DEFAULT '' NOT NULL,
	`page_views` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "site_analytics_dimension_daily_dimension_check" CHECK("site_analytics_dimension_daily"."dimension" IN ('country', 'city', 'device', 'referrer'))
);
--> statement-breakpoint
CREATE INDEX `site_analytics_dimension_daily_organization_id_idx` ON `site_analytics_dimension_daily` (`organization_id`);--> statement-breakpoint
CREATE INDEX `site_analytics_dimension_daily_site_date_idx` ON `site_analytics_dimension_daily` (`site_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_analytics_dimension_daily_site_date_value_unique` ON `site_analytics_dimension_daily` (`site_id`,`date`,`dimension`,`value`,`subvalue`);--> statement-breakpoint
CREATE TABLE `site_analytics_page_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`date` text NOT NULL,
	`page_path` text NOT NULL,
	`page_views` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `site_analytics_page_daily_organization_id_idx` ON `site_analytics_page_daily` (`organization_id`);--> statement-breakpoint
CREATE INDEX `site_analytics_page_daily_site_date_idx` ON `site_analytics_page_daily` (`site_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_analytics_page_daily_site_date_path_unique` ON `site_analytics_page_daily` (`site_id`,`date`,`page_path`);--> statement-breakpoint
CREATE TABLE `site_analytics_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`session_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`started_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`landing_path` text NOT NULL,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`last_touch_source` text DEFAULT 'Direct' NOT NULL,
	`last_touch_medium` text DEFAULT '(none)' NOT NULL,
	`last_touch_campaign` text,
	`last_touch_term` text,
	`last_touch_content` text,
	`last_touch_referrer_host` text,
	`last_touch_gclid` text,
	`last_touch_gbraid` text,
	`last_touch_wbraid` text,
	`last_touch_fbclid` text,
	`last_touch_msclkid` text,
	`last_touch_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `site_analytics_sessions_organization_id_idx` ON `site_analytics_sessions` (`organization_id`);--> statement-breakpoint
CREATE INDEX `site_analytics_sessions_site_started_idx` ON `site_analytics_sessions` (`site_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `site_analytics_sessions_site_last_seen_idx` ON `site_analytics_sessions` (`site_id`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `site_analytics_sessions_site_visitor_started_idx` ON `site_analytics_sessions` (`site_id`,`visitor_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `site_analytics_sessions_site_touch_started_idx` ON `site_analytics_sessions` (`site_id`,`last_touch_source`,`last_touch_medium`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_analytics_sessions_site_session_unique` ON `site_analytics_sessions` (`site_id`,`session_id`);--> statement-breakpoint
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
CREATE INDEX `site_config_org_site_idx` ON `site_config` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE TABLE `site_consultation_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`mode` text DEFAULT 'external_url' NOT NULL,
	`cta_label` text NOT NULL,
	`external_url` text,
	`schedule_path` text NOT NULL,
	`confirmation_path` text NOT NULL,
	`tracking_enabled` integer DEFAULT 1 NOT NULL,
	`metadata_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "site_consultation_settings_mode_check" CHECK(mode IN ('external_url', 'native_disabled')),
	CONSTRAINT "site_consultation_settings_schedule_path_check" CHECK(schedule_path LIKE '/%'),
	CONSTRAINT "site_consultation_settings_confirmation_path_check" CHECK(confirmation_path LIKE '/%')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_consultation_settings_site_id_unique` ON `site_consultation_settings` (`site_id`);--> statement-breakpoint
CREATE INDEX `site_consultation_settings_organization_id_idx` ON `site_consultation_settings` (`organization_id`);--> statement-breakpoint
CREATE TABLE `site_conversion_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`event_name` text NOT NULL,
	`stage` text NOT NULL,
	`session_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`location_id` text,
	`entity_type` text,
	`entity_id` text,
	`page_type` text,
	`page_path` text,
	`cta_destination` text,
	`source` text DEFAULT 'Direct' NOT NULL,
	`medium` text DEFAULT '(none)' NOT NULL,
	`campaign` text,
	`term` text,
	`content` text,
	`referrer_host` text,
	`gclid` text,
	`gbraid` text,
	`wbraid` text,
	`fbclid` text,
	`msclkid` text,
	`attributed_at` text NOT NULL,
	`metadata_json` text,
	`ip_hash` text,
	`user_agent` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "site_conversion_events_name_check" CHECK((event_name GLOB '[a-z]' OR event_name GLOB '[a-z][a-z0-9_]*') AND length(event_name) <= 64),
	CONSTRAINT "site_conversion_events_stage_check" CHECK("site_conversion_events"."stage" IN ('schedule_navigation', 'external_booking_handoff', 'submitted', 'external_handoff'))
);
--> statement-breakpoint
CREATE INDEX `site_conversion_events_site_created_idx` ON `site_conversion_events` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `site_conversion_events_name_created_idx` ON `site_conversion_events` (`event_name`,`created_at`);--> statement-breakpoint
CREATE INDEX `site_conversion_events_session_idx` ON `site_conversion_events` (`site_id`,`session_id`);--> statement-breakpoint
CREATE INDEX `site_conversion_events_entity_idx` ON `site_conversion_events` (`site_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `site_conversion_events_source_medium_created_idx` ON `site_conversion_events` (`site_id`,`source`,`medium`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_conversion_events_entity_unique` ON `site_conversion_events` (`site_id`,`event_name`,`entity_type`,`entity_id`) WHERE "site_conversion_events"."entity_type" IS NOT NULL AND "site_conversion_events"."entity_id" IS NOT NULL AND "site_conversion_events"."event_name" IN ('contact_submit', 'reservation_submit', 'experience_booking_submit');--> statement-breakpoint
CREATE INDEX `site_conversion_events_organization_id_idx` ON `site_conversion_events` (`organization_id`);--> statement-breakpoint
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
CREATE INDEX `idx_site_domain_events_domain` ON `site_domain_events` (`domain_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_site_domain_events_site` ON `site_domain_events` (`site_id`,`created_at`);--> statement-breakpoint
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
	`ssl_validation_name_2` text,
	`ssl_validation_type_2` text,
	`ssl_validation_value_2` text,
	`validation_strategy` text DEFAULT 'http_auto' NOT NULL,
	`dcv_delegation_name` text,
	`dcv_delegation_type` text,
	`dcv_delegation_value` text,
	`dns_target` text,
	`dns_status` text DEFAULT 'pending' NOT NULL,
	`dns_last_resolved_at` text,
	`dns_resolved_target` text,
	`last_synced_at` text,
	`next_check_at` text,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`activated_at` text,
	`certificate_last_active_at` text,
	`renewal_issue_started_at` text,
	`renewal_notification_sent_at` text,
	`certificate_expires_at` text,
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
CREATE INDEX `site_domains_org_site_idx` ON `site_domains` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_site_domains_one_canonical` ON `site_domains` (`site_id`) WHERE role = 'canonical' AND status = 'active';--> statement-breakpoint
CREATE INDEX `idx_site_domains_reconcile` ON `site_domains` (`status`,`next_check_at`);--> statement-breakpoint
CREATE TABLE `site_language_licenses` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`locale` text NOT NULL,
	`stripe_subscription_id` text,
	`stripe_subscription_item_id` text,
	`status` text DEFAULT 'disabled' NOT NULL,
	`operation_id` text,
	`provider_idempotency_key` text,
	`last_provider_quantity` integer,
	`last_error_code` text,
	`activated_at` text,
	`disabled_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`,`site_id`,`locale`) REFERENCES `site_locales`(`organization_id`,`site_id`,`locale`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "site_language_licenses_status_check" CHECK("site_language_licenses"."status" IN ('enabling', 'active', 'disabling', 'disabled')),
	CONSTRAINT "site_language_licenses_non_english_check" CHECK("site_language_licenses"."locale" <> 'en')
);
--> statement-breakpoint
CREATE INDEX `site_language_licenses_organization_status_idx` ON `site_language_licenses` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `site_language_licenses_subscription_item_idx` ON `site_language_licenses` (`stripe_subscription_item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_language_licenses_org_site_locale_unique` ON `site_language_licenses` (`organization_id`,`site_id`,`locale`);--> statement-breakpoint
CREATE TABLE `site_link_items` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`link_page_id` text NOT NULL,
	`label` text NOT NULL,
	`destination` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`link_page_id`) REFERENCES `site_link_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "site_link_items_status_check" CHECK(status IN ('active', 'hidden'))
);
--> statement-breakpoint
CREATE INDEX `site_link_items_page_status_sort_idx` ON `site_link_items` (`link_page_id`,`status`,`sort_order`);--> statement-breakpoint
CREATE INDEX `site_link_items_site_idx` ON `site_link_items` (`site_id`);--> statement-breakpoint
CREATE TABLE `site_link_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`path` text DEFAULT '/links' NOT NULL,
	`title` text NOT NULL,
	`robots` text DEFAULT 'noindex,follow' NOT NULL,
	`seo_title` text,
	`seo_description` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "site_link_pages_path_check" CHECK(path LIKE '/%' AND path NOT LIKE '//%'),
	CONSTRAINT "site_link_pages_robots_check" CHECK(robots IN ('index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_link_pages_site_id_unique` ON `site_link_pages` (`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_link_pages_organization_id_site_id_path_unique` ON `site_link_pages` (`organization_id`,`site_id`,`path`);--> statement-breakpoint
CREATE TABLE `site_locales` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`locale` text NOT NULL,
	`label` text,
	`is_source` numeric DEFAULT false NOT NULL,
	`status` text DEFAULT 'disabled' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "site_locales_status_check" CHECK(status IN ('published', 'disabled') AND (is_source = 0 OR status = 'published')),
	CONSTRAINT "site_locales_english_source_check" CHECK(locale <> 'en' OR (is_source = 1 AND status = 'published'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_site_locales_one_source_per_site` ON `site_locales` (`organization_id`,`site_id`) WHERE is_source = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `site_locales_organization_id_site_id_locale_unique` ON `site_locales` (`organization_id`,`site_id`,`locale`);--> statement-breakpoint
CREATE TABLE `site_pageview_events` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`page_path` text NOT NULL,
	`page_id` text,
	`page_type` text,
	`recipe` text,
	`locale` text,
	`revision_id` text,
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
CREATE INDEX `site_pageview_events_site_created_idx` ON `site_pageview_events` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_pageview_events_session` ON `site_pageview_events` (`site_id`,`session_id`);--> statement-breakpoint
CREATE INDEX `idx_pageview_events_site_visitor` ON `site_pageview_events` (`site_id`,`visitor_id`);--> statement-breakpoint
CREATE TABLE `site_redirects` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`locale` text NOT NULL,
	`owner_type` text,
	`owner_id` text,
	`from_path` text NOT NULL,
	`to_path` text,
	`status_code` integer DEFAULT 301 NOT NULL,
	`behavior` text DEFAULT 'redirect' NOT NULL,
	`reason` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "site_redirects_from_path_check" CHECK(from_path LIKE '/%'),
	CONSTRAINT "site_redirects_behavior_check" CHECK(behavior IN ('redirect', 'gone', 'noindex')),
	CONSTRAINT "site_redirects_redirect_to_path_check" CHECK(behavior != 'redirect' OR to_path IS NOT NULL),
	CONSTRAINT "site_redirects_owner_check" CHECK((owner_type IS NULL AND owner_id IS NULL) OR (owner_type IS NOT NULL AND owner_id IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `site_redirects_organization_id_idx` ON `site_redirects` (`organization_id`);--> statement-breakpoint
CREATE INDEX `site_redirects_owner_idx` ON `site_redirects` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_redirects_site_locale_from_path_unique` ON `site_redirects` (`site_id`,`locale`,`from_path`);--> statement-breakpoint
CREATE TABLE `site_theme_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`template_slug` text NOT NULL,
	`tokens_json` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "site_theme_tokens_status_check" CHECK(status IN ('active', 'disabled'))
);
--> statement-breakpoint
CREATE INDEX `site_theme_tokens_organization_id_idx` ON `site_theme_tokens` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_theme_tokens_site_template_unique` ON `site_theme_tokens` (`site_id`,`template_slug`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `idx_site_transfer_pending` ON `site_transfer_requests` (`site_id`) WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX `idx_site_transfer_reminders` ON `site_transfer_requests` (`status`,`requires_payment`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_site_transfer_site` ON `site_transfer_requests` (`site_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_site_transfer_token` ON `site_transfer_requests` (`token`);--> statement-breakpoint
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
	`contact_email` text,
	`contact_phone` text,
	`default_currency` text DEFAULT 'THB' NOT NULL,
	`status` text DEFAULT 'active',
	`onboarding_status` text DEFAULT 'pending',
	`url_structure` text DEFAULT 'location_subdirectories' NOT NULL,
	`vertical` text DEFAULT 'restaurant' NOT NULL,
	`last_published_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_by` text,
	`seo_title` text,
	`seo_description` text,
	`canonical_url` text,
	`robots` text,
	`social_facebook_url` text,
	`social_instagram_url` text,
	`social_tiktok_url` text,
	`team_id` text,
	`feature_overrides` text,
	`analytics_data_start_at` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "sites_status_check" CHECK("sites"."status" IN ('active', 'inactive', 'suspended')),
	CONSTRAINT "sites_onboarding_status_check" CHECK("sites"."onboarding_status" IN ('pending', 'active', 'failed')),
	CONSTRAINT "sites_url_structure_check" CHECK("sites"."url_structure" IN ('location_subdirectories', 'brand_pages')),
	CONSTRAINT "sites_vertical_check" CHECK("sites"."vertical" IN ('restaurant', 'experience', 'retail', 'wellness', 'service')),
	CONSTRAINT "sites_default_currency_check" CHECK("sites"."default_currency" IN ('THB','USD','EUR','GBP','JPY','AUD','CAD','SGD','HKD','MYR','IDR','PHP','VND','INR'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sites_slug_unique` ON `sites` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `sites_subdomain_unique` ON `sites` (`subdomain`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sites_custom_domain_unique` ON `sites` (`custom_domain`) WHERE custom_domain IS NOT NULL;--> statement-breakpoint
CREATE INDEX `sites_organization_id_idx` ON `sites` (`organization_id`);--> statement-breakpoint
CREATE INDEX `sites_created_at_idx` ON `sites` (`created_at`);--> statement-breakpoint
CREATE TABLE `spent_subdomains` (
	`domain` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`successor_domain` text,
	`spent_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `spent_subdomains_site_idx` ON `spent_subdomains` (`site_id`);--> statement-breakpoint
CREATE TABLE `stripe_ga4_subscription_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`stripe_subscription_id` text,
	`action` text NOT NULL,
	`site_id` text,
	`client_id` text,
	`session_id` text,
	`session_captured_at` integer,
	`previous_price_id` text,
	`new_price_id` text,
	`effective_timing` text DEFAULT 'immediate' NOT NULL,
	`source` text DEFAULT 'browser' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`lifecycle_sent_at` text,
	`consumed_at` text,
	`consumed_event_id` text,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "stripe_ga4_subscription_intents_action_check" CHECK("stripe_ga4_subscription_intents"."action" IN ('initial_subscription', 'upgrade', 'downgrade')),
	CONSTRAINT "stripe_ga4_subscription_intents_status_check" CHECK("stripe_ga4_subscription_intents"."status" IN ('pending', 'consumed', 'expired')),
	CONSTRAINT "stripe_ga4_subscription_intents_timing_check" CHECK("stripe_ga4_subscription_intents"."effective_timing" IN ('immediate', 'period_end'))
);
--> statement-breakpoint
CREATE INDEX `stripe_ga4_subscription_intents_subscription_idx` ON `stripe_ga4_subscription_intents` (`stripe_subscription_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `stripe_ga4_subscription_intents_organization_idx` ON `stripe_ga4_subscription_intents` (`organization_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `stripe_ga4_subscription_intents_expiry_idx` ON `stripe_ga4_subscription_intents` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `stripe_invoice_payments` (
	`stripe_invoice_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`stripe_subscription_id` text NOT NULL,
	`base_plan_price_id` text,
	`status` text NOT NULL,
	`period_start` text,
	`period_end` text,
	`past_due_since` text,
	`last_event_created` integer NOT NULL,
	`last_event_id` text NOT NULL,
	`ga4_purchase_status` text DEFAULT 'pending',
	`ga4_purchase_event_id` text,
	`ga4_purchase_attempt_count` integer DEFAULT 0 NOT NULL,
	`ga4_purchase_claimed_at` text,
	`ga4_purchase_sent_at` text,
	`ga4_purchase_error` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stripe_invoice_payments_organization_idx` ON `stripe_invoice_payments` (`organization_id`,`period_end`);--> statement-breakpoint
CREATE INDEX `stripe_invoice_payments_subscription_idx` ON `stripe_invoice_payments` (`stripe_subscription_id`,`period_end`);--> statement-breakpoint
CREATE TABLE `stripe_subscription_versions` (
	`stripe_subscription_id` text PRIMARY KEY NOT NULL,
	`last_event_created` integer NOT NULL,
	`last_event_id` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stripe_webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`stripe_event_id` text NOT NULL,
	`event_type` text,
	`status` text DEFAULT 'pending',
	`payload` text,
	`error` text,
	`claimed_at` text,
	`lease_expires_at` text,
	`claim_token` text,
	`next_attempt_at` text,
	`dead_lettered_at` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stripe_webhook_events_stripe_event_id_unique` ON `stripe_webhook_events` (`stripe_event_id`);--> statement-breakpoint
CREATE INDEX `stripe_webhook_events_retry_idx` ON `stripe_webhook_events` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`plan` text NOT NULL,
	`referenceId` text NOT NULL,
	`stripeCustomerId` text,
	`stripeSubscriptionId` text,
	`status` text DEFAULT 'incomplete' NOT NULL,
	`periodStart` integer,
	`periodEnd` integer,
	`trialStart` integer,
	`trialEnd` integer,
	`limits` text,
	`cancelAtPeriodEnd` integer DEFAULT 0 NOT NULL,
	`cancelAt` integer,
	`canceledAt` integer,
	`endedAt` integer,
	`seats` integer,
	`billingInterval` text,
	`stripeScheduleId` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_stripeSubscriptionId_unique` ON `subscription` (`stripeSubscriptionId`);--> statement-breakpoint
CREATE INDEX `subscription_referenceId_idx` ON `subscription` (`referenceId`);--> statement-breakpoint
CREATE INDEX `subscription_status_idx` ON `subscription` (`status`);--> statement-breakpoint
CREATE TABLE `team` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`memberCount` integer DEFAULT 0 NOT NULL,
	`organizationId` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `team_organizationId_idx` ON `team` (`organizationId`);--> statement-breakpoint
CREATE TABLE `teamMember` (
	`id` text PRIMARY KEY NOT NULL,
	`teamId` text NOT NULL,
	`userId` text NOT NULL,
	`membershipKey` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`teamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teamMember_membershipKey_unique` ON `teamMember` (`membershipKey`);--> statement-breakpoint
CREATE INDEX `teamMember_teamId_idx` ON `teamMember` (`teamId`);--> statement-breakpoint
CREATE INDEX `teamMember_userId_idx` ON `teamMember` (`userId`);--> statement-breakpoint
CREATE TABLE `tenant_compliance` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`entity_name` text,
	`dba_name` text,
	`entity_type` text,
	`nonprofit_status` text,
	`registration_number` text,
	`service_area` text,
	`service_area_type` text,
	`disclaimer` text,
	`footer_disclaimer` text,
	`privacy_page_id` text,
	`terms_page_id` text,
	`notice_page_id` text,
	`founder_name` text,
	`founding_date` text,
	`same_as` text,
	`contact_points` text,
	`address_visibility` text DEFAULT 'hidden' NOT NULL,
	`metadata_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`privacy_page_id`) REFERENCES `tenant_pages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`terms_page_id`) REFERENCES `tenant_pages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`notice_page_id`) REFERENCES `tenant_pages`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "tenant_compliance_address_visibility_check" CHECK(address_visibility IN ('visible', 'hidden'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_compliance_site_id_unique` ON `tenant_compliance` (`site_id`);--> statement-breakpoint
CREATE TABLE `tenant_page_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`page_id` text NOT NULL,
	`locale` text NOT NULL,
	`document_id` text NOT NULL,
	`path` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`seo_title` text,
	`seo_description` text,
	`canonical_url` text,
	`robots` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `tenant_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `content_documents`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tenant_page_variants_path_check" CHECK(path LIKE '/%' AND path NOT LIKE '//%')
);
--> statement-breakpoint
CREATE INDEX `tenant_page_variants_site_path_idx` ON `tenant_page_variants` (`site_id`,`path`);--> statement-breakpoint
CREATE INDEX `tenant_page_variants_page_idx` ON `tenant_page_variants` (`page_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_page_variants_page_locale_unique` ON `tenant_page_variants` (`page_id`,`locale`);--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_page_variants_site_locale_path_unique` ON `tenant_page_variants` (`site_id`,`locale`,`path`);--> statement-breakpoint
CREATE TABLE `tenant_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text,
	`page_type` text DEFAULT 'custom' NOT NULL,
	`recipe` text,
	`summary` text,
	`seo_title` text,
	`seo_description` text,
	`canonical_url` text,
	`robots` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`source_ref` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tenant_pages_site_sort_idx` ON `tenant_pages` (`site_id`,`sort_order`);--> statement-breakpoint
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
CREATE TABLE `usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text,
	`resource` text NOT NULL,
	`source` text NOT NULL,
	`provider` text,
	`channel` text,
	`session_id` text,
	`quantity` integer NOT NULL,
	`unit` text NOT NULL,
	`metadata_json` text,
	`idempotency_key` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `usage_events_organization_resource_created_idx` ON `usage_events` (`organization_id`,`resource`,`created_at`);--> statement-breakpoint
CREATE INDEX `usage_events_site_created_idx` ON `usage_events` (`site_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `usage_events_organization_id_idempotency_key_unique` ON `usage_events` (`organization_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `usage_quota_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`resource` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit` text NOT NULL,
	`period_key` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text,
	`grant_type` text NOT NULL,
	`reason` text NOT NULL,
	`created_by` text,
	`idempotency_key` text NOT NULL,
	`applied_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `usage_quota_grants_active_idx` ON `usage_quota_grants` (`organization_id`,`resource`,`period_start`,`period_end`);--> statement-breakpoint
CREATE UNIQUE INDEX `usage_quota_grants_organization_id_idempotency_key_unique` ON `usage_quota_grants` (`organization_id`,`idempotency_key`);--> statement-breakpoint
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
	`isAnonymous` integer DEFAULT 0 NOT NULL,
	`stripeCustomerId` text,
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
CREATE INDEX `idx_work_requests_org` ON `work_requests` (`organization_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_work_requests_status` ON `work_requests` (`status`,`priority`,`created_at`);--> statement-breakpoint
CREATE TABLE `zaraz_sync_lock` (
	`id` text PRIMARY KEY NOT NULL,
	`locked_at` text
);
