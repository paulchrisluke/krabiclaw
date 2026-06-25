PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_business_locations` (
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
INSERT INTO `__new_business_locations`("id", "organization_id", "site_id", "slug", "google_location_id", "google_connection_id", "title", "address", "city", "neighborhood", "phone", "website_url", "maps_url", "latitude", "longitude", "opening_hours", "categories", "rating", "review_count", "is_primary", "status", "last_synced_at", "description", "short_description", "description_provenance", "special_hours", "price_level", "attributes", "email", "facebook_url", "facebook_page_id", "facebook_connection_id", "instagram_url", "tiktok_url", "grab_url", "uber_eats_url", "foodpanda_url", "google_place_id", "hero_image_asset_id", "hero_video_asset_id", "created_at", "updated_at", "notification_phone", "timezone") SELECT "id", "organization_id", "site_id", "slug", "google_location_id", "google_connection_id", "title", "address", "city", "neighborhood", "phone", "website_url", "maps_url", "latitude", "longitude", "opening_hours", "categories", "rating", "review_count", "is_primary", "status", "last_synced_at", "description", "short_description", "description_provenance", "special_hours", "price_level", "attributes", "email", "facebook_url", "facebook_page_id", "facebook_connection_id", "instagram_url", "tiktok_url", "grab_url", "uber_eats_url", "foodpanda_url", "google_place_id", "hero_image_asset_id", "hero_video_asset_id", "created_at", "updated_at", "notification_phone", "timezone" FROM `business_locations`;--> statement-breakpoint
DROP TABLE `business_locations`;--> statement-breakpoint
ALTER TABLE `__new_business_locations` RENAME TO `business_locations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `business_locations_organization_id_site_id_slug_unique` ON `business_locations` (`organization_id`,`site_id`,`slug`);--> statement-breakpoint
CREATE TABLE `__new_experiences` (
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
INSERT INTO `__new_experiences`("id", "organization_id", "site_id", "location_id", "title", "slug", "tagline", "body", "image_asset_id", "video_asset_id", "images", "price", "price_amount", "duration_minutes", "max_capacity", "time_slots", "recurring_slots", "available_note", "status", "sort_order", "featured", "featured_sort_order", "seo_title", "seo_description", "created_at", "updated_at", "created_by", "highlights", "included_items", "what_to_bring", "meeting_point", "cancellation_policy") SELECT "id", "organization_id", "site_id", "location_id", "title", "slug", "tagline", "body", "image_asset_id", "video_asset_id", "images", "price", "price_amount", "duration_minutes", "max_capacity", "time_slots", "recurring_slots", "available_note", "status", "sort_order", "featured", "featured_sort_order", "seo_title", "seo_description", "created_at", "updated_at", "created_by", "highlights", "included_items", "what_to_bring", "meeting_point", "cancellation_policy" FROM `experiences`;--> statement-breakpoint
DROP TABLE `experiences`;--> statement-breakpoint
ALTER TABLE `__new_experiences` RENAME TO `experiences`;--> statement-breakpoint
CREATE TABLE `__new_menu_items` (
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
INSERT INTO `__new_menu_items`("id", "menu_id", "section", "name", "slug", "description", "price_amount", "image_asset_id", "available", "featured", "featured_sort_order", "sort_order", "allergens", "ingredients", "dietary_notes", "preparation", "serving_note", "created_at", "updated_at", "created_by", "updated_by") SELECT "id", "menu_id", "section", "name", "slug", "description", "price_amount", "image_asset_id", "available", "featured", "featured_sort_order", "sort_order", "allergens", "ingredients", "dietary_notes", "preparation", "serving_note", "created_at", "updated_at", "created_by", "updated_by" FROM `menu_items`;--> statement-breakpoint
DROP TABLE `menu_items`;--> statement-breakpoint
ALTER TABLE `__new_menu_items` RENAME TO `menu_items`;--> statement-breakpoint
CREATE TABLE `__new_organization_billing` (
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
INSERT INTO `__new_organization_billing`("id", "organization_id", "stripe_customer_id", "stripe_subscription_id", "stripe_subscription_item_id", "status", "plan", "current_period_end", "cancel_at_period_end", "auto_topup_enabled", "auto_topup_bundle", "auto_topup_threshold", "updated_at") SELECT "id", "organization_id", "stripe_customer_id", "stripe_subscription_id", "stripe_subscription_item_id", "status", "plan", "current_period_end", "cancel_at_period_end", "auto_topup_enabled", "auto_topup_bundle", "auto_topup_threshold", "updated_at" FROM `organization_billing`;--> statement-breakpoint
DROP TABLE `organization_billing`;--> statement-breakpoint
ALTER TABLE `__new_organization_billing` RENAME TO `organization_billing`;--> statement-breakpoint
CREATE UNIQUE INDEX `organization_billing_stripe_customer_id_unique` ON `organization_billing` (`stripe_customer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_billing_stripe_subscription_id_unique` ON `organization_billing` (`stripe_subscription_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_billing_stripe_subscription_item_id_unique` ON `organization_billing` (`stripe_subscription_item_id`);--> statement-breakpoint
CREATE TABLE `__new_site_billing` (
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
INSERT INTO `__new_site_billing`("id", "site_id", "organization_id", "stripe_subscription_id", "stripe_subscription_item_id", "plan", "status", "current_period_end", "cancel_at_period_end", "updated_at", "stripe_customer_id", "payment_method", "local_rate", "local_currency", "last_reminder_sent_at") SELECT "id", "site_id", "organization_id", "stripe_subscription_id", "stripe_subscription_item_id", "plan", "status", "current_period_end", "cancel_at_period_end", "updated_at", "stripe_customer_id", "payment_method", "local_rate", "local_currency", "last_reminder_sent_at" FROM `site_billing`;--> statement-breakpoint
DROP TABLE `site_billing`;--> statement-breakpoint
ALTER TABLE `__new_site_billing` RENAME TO `site_billing`;--> statement-breakpoint
CREATE UNIQUE INDEX `site_billing_site_id_unique` ON `site_billing` (`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_billing_stripe_subscription_id_unique` ON `site_billing` (`stripe_subscription_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_billing_stripe_subscription_item_id_unique` ON `site_billing` (`stripe_subscription_item_id`);--> statement-breakpoint
CREATE TABLE `__new_site_locales` (
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
INSERT INTO `__new_site_locales`("id", "organization_id", "site_id", "locale", "label", "is_source", "status", "fallback_enabled", "created_at", "updated_at") SELECT "id", "organization_id", "site_id", "locale", "label", "is_source", "status", "fallback_enabled", "created_at", "updated_at" FROM `site_locales`;--> statement-breakpoint
DROP TABLE `site_locales`;--> statement-breakpoint
ALTER TABLE `__new_site_locales` RENAME TO `site_locales`;--> statement-breakpoint
CREATE UNIQUE INDEX `site_locales_organization_id_site_id_locale_unique` ON `site_locales` (`organization_id`,`site_id`,`locale`);--> statement-breakpoint
CREATE TABLE `__new_site_config` (
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
INSERT INTO `__new_site_config`("organization_id", "site_id", "key", "value", "updated_at") SELECT "organization_id", "site_id", "key", "value", "updated_at" FROM `site_config`;--> statement-breakpoint
DROP TABLE `site_config`;--> statement-breakpoint
ALTER TABLE `__new_site_config` RENAME TO `site_config`;--> statement-breakpoint
CREATE UNIQUE INDEX `business_location_translations_organization_id_site_id_location_id_locale_unique` ON `business_location_translations` (`organization_id`,`site_id`,`location_id`,`locale`);--> statement-breakpoint
CREATE UNIQUE INDEX `chowbot_messages_meta_message_id_unique` ON `chowbot_messages` (`meta_message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `dashboard_preferences_user_id_organization_id_unique` ON `dashboard_preferences` (`user_id`,`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `domain_reconciliation_jobs_domain_id_unique` ON `domain_reconciliation_jobs` (`domain_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `facebook_pages_connections_organization_id_site_id_unique` ON `facebook_pages_connections` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `google_analytics_connections_organization_id_site_id_unique` ON `google_analytics_connections` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_google_business_connections_site_level_unique` ON `google_business_connections` (`organization_id`,`site_id`) WHERE location_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `google_business_connections_organization_id_site_id_location_id_unique` ON `google_business_connections` (`organization_id`,`site_id`,`location_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `menu_item_translations_organization_id_site_id_menu_item_id_locale_unique` ON `menu_item_translations` (`organization_id`,`site_id`,`menu_item_id`,`locale`);--> statement-breakpoint
CREATE UNIQUE INDEX `menu_translations_organization_id_site_id_menu_id_locale_unique` ON `menu_translations` (`organization_id`,`site_id`,`menu_id`,`locale`);--> statement-breakpoint
CREATE UNIQUE INDEX `oauthAccessToken_token_unique` ON `oauthAccessToken` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `oauthClient_clientId_unique` ON `oauthClient` (`clientId`);--> statement-breakpoint
CREATE UNIQUE INDEX `oauthConsent_clientId_userId_unique` ON `oauthConsent` (`clientId`,`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `oauthRefreshToken_token_unique` ON `oauthRefreshToken` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_unique` ON `organization` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_entitlements_organization_id_key_unique` ON `organization_entitlements` (`organization_id`,`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `platform_analytics_metric_date_unique` ON `platform_analytics` (`metric`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `platform_blog_posts_slug_unique` ON `platform_blog_posts` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `platform_content_page_unique` ON `platform_content` (`page`);--> statement-breakpoint
CREATE UNIQUE INDEX `platform_docs_slug_unique` ON `platform_docs` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `post_translations_organization_id_site_id_post_id_locale_unique` ON `post_translations` (`organization_id`,`site_id`,`post_id`,`locale`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_analytics_daily_site_id_date_unique` ON `site_analytics_daily` (`site_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_site_content_site_level_unique` ON `site_content` (`organization_id`,`site_id`,`page`,`field`) WHERE location_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `site_content_organization_id_site_id_location_id_page_field_unique` ON `site_content` (`organization_id`,`site_id`,`location_id`,`page`,`field`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_site_content_translations_site_level_unique` ON `site_content_translations` (`organization_id`,`site_id`,`locale`,`page`,`field`) WHERE location_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `site_content_translations_organization_id_site_id_location_id_locale_page_field_unique` ON `site_content_translations` (`organization_id`,`site_id`,`location_id`,`locale`,`page`,`field`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_domains_domain_unique` ON `site_domains` (`domain`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_domains_cloudflare_hostname_id_unique` ON `site_domains` (`cloudflare_hostname_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_entitlements_site_id_key_unique` ON `site_entitlements` (`site_id`,`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `sites_slug_unique` ON `sites` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `sites_subdomain_unique` ON `sites` (`subdomain`);--> statement-breakpoint
CREATE UNIQUE INDEX `stripe_webhook_events_stripe_event_id_unique` ON `stripe_webhook_events` (`stripe_event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `themes_slug_unique` ON `themes` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_phoneNumber_unique` ON `user` (`phoneNumber`);
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
