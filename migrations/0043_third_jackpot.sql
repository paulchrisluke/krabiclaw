CREATE TABLE `client_import_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`site_id` text,
	`slug` text NOT NULL,
	`artifact_type` text NOT NULL,
	`path` text NOT NULL,
	`hash` text,
	`status` text DEFAULT 'generated' NOT NULL,
	`summary_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "client_import_artifacts_status_check" CHECK(status IN ('generated', 'approved', 'applied', 'superseded'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_import_artifacts_slug_type_path_unique` ON `client_import_artifacts` (`slug`,`artifact_type`,`path`);--> statement-breakpoint
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
	`thumbnail_asset_id` text,
	`hero_image_asset_id` text,
	`media_asset_ids` text,
	`schema_type` text,
	`seo_title` text,
	`seo_description` text,
	`canonical_path` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`featured` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`source_ref` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`thumbnail_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`hero_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "offerings_status_check" CHECK(status IN ('draft', 'published', 'archived'))
);
--> statement-breakpoint
CREATE INDEX `offerings_site_status_sort_idx` ON `offerings` (`site_id`,`status`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `offerings_organization_id_site_id_slug_unique` ON `offerings` (`organization_id`,`site_id`,`slug`);--> statement-breakpoint
CREATE TABLE `site_consultation_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`mode` text DEFAULT 'external_url' NOT NULL,
	`cta_label` text DEFAULT 'Book a consultation' NOT NULL,
	`external_url` text,
	`schedule_path` text DEFAULT '/schedule' NOT NULL,
	`confirmation_path` text DEFAULT '/contact/confirmed' NOT NULL,
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
	`page_type` text,
	`page_path` text,
	`page_location` text,
	`cta_destination` text,
	`tenant` text,
	`metadata_json` text,
	`ip_hash` text,
	`user_agent` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "site_conversion_events_name_check" CHECK((event_name GLOB '[a-z]' OR event_name GLOB '[a-z][a-z0-9_]*') AND length(event_name) <= 64)
);
--> statement-breakpoint
CREATE INDEX `site_conversion_events_site_created_idx` ON `site_conversion_events` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `site_conversion_events_name_created_idx` ON `site_conversion_events` (`event_name`,`created_at`);--> statement-breakpoint
CREATE INDEX `site_conversion_events_organization_id_idx` ON `site_conversion_events` (`organization_id`);--> statement-breakpoint
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
	`disclaimer` text,
	`footer_disclaimer` text,
	`privacy_page_id` text,
	`terms_page_id` text,
	`notice_page_id` text,
	`document_asset_ids` text,
	`metadata_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`privacy_page_id`) REFERENCES `tenant_pages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`terms_page_id`) REFERENCES `tenant_pages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`notice_page_id`) REFERENCES `tenant_pages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_compliance_site_id_unique` ON `tenant_compliance` (`site_id`);--> statement-breakpoint
CREATE TABLE `tenant_navigation_items` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`area` text DEFAULT 'header' NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`item_type` text DEFAULT 'internal' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`metadata_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tenant_navigation_items_area_check" CHECK(area IN ('header', 'footer', 'legal', 'social')),
	CONSTRAINT "tenant_navigation_items_status_check" CHECK(status IN ('active', 'hidden'))
);
--> statement-breakpoint
CREATE INDEX `tenant_navigation_items_site_area_sort_idx` ON `tenant_navigation_items` (`site_id`,`area`,`sort_order`);--> statement-breakpoint
CREATE INDEX `tenant_navigation_items_organization_id_idx` ON `tenant_navigation_items` (`organization_id`);--> statement-breakpoint
CREATE TABLE `tenant_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`path` text NOT NULL,
	`title` text NOT NULL,
	`slug` text,
	`page_type` text DEFAULT 'static' NOT NULL,
	`summary` text,
	`body` text,
	`components_json` text,
	`cta_label` text,
	`cta_url` text,
	`seo_title` text,
	`seo_description` text,
	`canonical_url` text,
	`robots` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`source_ref` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tenant_pages_path_check" CHECK(path LIKE '/%'),
	CONSTRAINT "tenant_pages_status_check" CHECK(status IN ('draft', 'published', 'archived'))
);
--> statement-breakpoint
CREATE INDEX `tenant_pages_site_status_sort_idx` ON `tenant_pages` (`site_id`,`status`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_pages_organization_id_site_id_path_unique` ON `tenant_pages` (`organization_id`,`site_id`,`path`);--> statement-breakpoint
CREATE TABLE `tenant_redirects` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
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
	CONSTRAINT "tenant_redirects_from_path_check" CHECK(from_path LIKE '/%'),
	CONSTRAINT "tenant_redirects_behavior_check" CHECK(behavior IN ('redirect', 'gone', 'noindex')),
	CONSTRAINT "tenant_redirects_redirect_to_path_check" CHECK(behavior != 'redirect' OR to_path IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `tenant_redirects_organization_id_idx` ON `tenant_redirects` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_redirects_site_from_path_unique` ON `tenant_redirects` (`site_id`,`from_path`);--> statement-breakpoint
DROP INDEX `idx_customers_stripe_customer_id`;--> statement-breakpoint
DROP INDEX `idx_review_requests_token_hash`;--> statement-breakpoint
CREATE INDEX `review_requests_organization_id_idx` ON `review_requests` (`organization_id`);--> statement-breakpoint
-- blog_posts_scope_org_site_insert/_update (migrations/0012_illegal_network.sql) validate
-- NEW.site_id against `sites` on every INSERT/UPDATE. This migration recreates `sites` itself
-- further down (__new_sites pattern, required to add the two new indexes below alongside
-- 0001_initial.sql's original check constraints) - PRAGMA foreign_keys=OFF only suppresses FK
-- constraint enforcement, not trigger firing, so the trigger stayed live across the DROP
-- TABLE/RENAME sequence and failed with "no such table: main.sites" the moment D1 evaluated it.
-- Dropped here and recreated identically at the end of this migration, after every table
-- recreation in this file has completed, so it's never live during the DDL sequence at all.
DROP TRIGGER `blog_posts_scope_org_site_insert`;--> statement-breakpoint
DROP TRIGGER `blog_posts_scope_org_site_update`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_location_qa` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`page_path` text,
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
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "location_qa_scope_check" CHECK(location_id IS NULL OR page_path IS NULL),
	CONSTRAINT "location_qa_page_path_check" CHECK(page_path IS NULL OR page_path LIKE '/%'),
	CONSTRAINT "location_qa_source_check" CHECK(source IN ('gmb','google_maps','manual','llm_generated','manual_override','template','import')),
	CONSTRAINT "location_qa_status_check" CHECK(status IN ('published','hidden'))
);
--> statement-breakpoint
INSERT INTO `__new_location_qa`("id", "organization_id", "site_id", "location_id", "page_path", "google_question_id", "question", "question_author", "question_date", "answer", "answer_author", "answer_date", "is_owner_answer", "upvote_count", "source", "status", "sort_order", "created_at", "updated_at") SELECT "id", "organization_id", "site_id", "location_id", "page_path", "google_question_id", "question", "question_author", "question_date", "answer", "answer_author", "answer_date", "is_owner_answer", "upvote_count", "source", "status", "sort_order", "created_at", "updated_at" FROM `location_qa`;--> statement-breakpoint
DROP TABLE `location_qa`;--> statement-breakpoint
ALTER TABLE `__new_location_qa` RENAME TO `location_qa`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_location_qa_google_id` ON `location_qa` (`google_question_id`) WHERE google_question_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_location_qa_location` ON `location_qa` (`location_id`,`status`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_location_qa_site` ON `location_qa` (`site_id`,`status`,`sort_order`) WHERE location_id IS NULL;--> statement-breakpoint
CREATE INDEX `idx_location_qa_page` ON `location_qa` (`site_id`,`page_path`,`status`,`sort_order`) WHERE location_id IS NULL AND page_path IS NOT NULL;--> statement-breakpoint
CREATE INDEX `location_qa_organization_id_idx` ON `location_qa` (`organization_id`);--> statement-breakpoint
ALTER TABLE `blog_posts` ADD `tags_json` text;--> statement-breakpoint
CREATE INDEX `blog_posts_org_site_idx` ON `blog_posts` (`organization_id`,`site_id`);--> statement-breakpoint
ALTER TABLE `contact_submissions` ADD `consent_at` text;--> statement-breakpoint
CREATE INDEX `contact_submissions_org_site_idx` ON `contact_submissions` (`organization_id`,`site_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`site_id` text,
	`location_id` text,
	`customer_id` text,
	`booking_id` text,
	`booking_type` text,
	`review_request_id` text,
	`user_id` text,
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
	CONSTRAINT "reviews_booking_type_check" CHECK(booking_type IS NULL OR booking_type IN ('reservation', 'experience_booking')),
	CONSTRAINT "reviews_rating_check" CHECK(rating BETWEEN 1 AND 5),
	CONSTRAINT "reviews_publication_authorized_check" CHECK(publication_authorized IN (0, 1)),
	CONSTRAINT "reviews_collection_method_check" CHECK(collection_method IS NULL OR collection_method IN ('in_person', 'email', 'phone', 'migration', 'other')),
	CONSTRAINT "reviews_owner_entered_provenance_check" CHECK(source != 'owner_entered' OR (organization_id IS NOT NULL AND site_id IS NOT NULL AND location_id IS NULL AND entered_by_user_id IS NOT NULL AND collection_method IS NOT NULL AND publication_authorized = 1))
);
--> statement-breakpoint
INSERT INTO `__new_reviews`("id", "organization_id", "site_id", "location_id", "customer_id", "booking_id", "booking_type", "review_request_id", "user_id", "menu_item_slug", "author_name", "reviewer_photo_url", "rating", "title", "content", "google_review_id", "owner_reply", "owner_reply_at", "photo_urls", "helpful_count", "status", "source", "entered_by_user_id", "collection_method", "original_review_date", "original_reference", "publication_authorized", "ip_hash", "user_agent", "created_at", "updated_at") SELECT "id", "organization_id", "site_id", "location_id", "customer_id", "booking_id", "booking_type", "review_request_id", "user_id", "menu_item_slug", "author_name", "reviewer_photo_url", "rating", "title", "content", "google_review_id", "owner_reply", "owner_reply_at", "photo_urls", "helpful_count", "status", "source", "entered_by_user_id", "collection_method", "original_review_date", "original_reference", "publication_authorized", "ip_hash", "user_agent", "created_at", "updated_at" FROM `reviews`;--> statement-breakpoint
DROP TABLE `reviews`;--> statement-breakpoint
ALTER TABLE `__new_reviews` RENAME TO `reviews`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_reviews_request_id` ON `reviews` (`review_request_id`);--> statement-breakpoint
CREATE INDEX `idx_reviews_customer_id` ON `reviews` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_reviews_location_status` ON `reviews` (`location_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_reviews_site_status` ON `reviews` (`site_id`,`status`,`created_at`) WHERE location_id IS NULL;--> statement-breakpoint
CREATE INDEX `reviews_organization_id_idx` ON `reviews` (`organization_id`);--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`userId`);--> statement-breakpoint
CREATE INDEX `ai_usage_log_organization_id_idx` ON `ai_usage_log` (`organization_id`);--> statement-breakpoint
CREATE INDEX `booking_policies_organization_id_idx` ON `booking_policies` (`organization_id`);--> statement-breakpoint
CREATE INDEX `chowbot_channel_state_user_id_idx` ON `chowbot_channel_state` (`user_id`);--> statement-breakpoint
CREATE INDEX `chowbot_conversations_org_site_idx` ON `chowbot_conversations` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX `chowbot_conversations_user_id_idx` ON `chowbot_conversations` (`user_id`);--> statement-breakpoint
CREATE INDEX `chowbot_messages_conversation_id_idx` ON `chowbot_messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `chowbot_messages_org_site_idx` ON `chowbot_messages` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX `experience_bookings_organization_id_idx` ON `experience_bookings` (`organization_id`);--> statement-breakpoint
CREATE INDEX `experience_slot_overrides_org_site_idx` ON `experience_slot_overrides` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX `experiences_org_site_idx` ON `experiences` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX `guest_threads_organization_id_idx` ON `guest_threads` (`organization_id`);--> statement-breakpoint
CREATE INDEX `invitation_organizationId_idx` ON `invitation` (`organizationId`);--> statement-breakpoint
CREATE INDEX `member_userId_organizationId_idx` ON `member` (`userId`,`organizationId`);--> statement-breakpoint
CREATE INDEX `member_organizationId_idx` ON `member` (`organizationId`);--> statement-breakpoint
CREATE INDEX `menu_item_translations_menu_item_id_idx` ON `menu_item_translations` (`menu_item_id`);--> statement-breakpoint
CREATE INDEX `menu_items_menu_id_idx` ON `menu_items` (`menu_id`);--> statement-breakpoint
CREATE INDEX `menu_translations_menu_id_idx` ON `menu_translations` (`menu_id`);--> statement-breakpoint
CREATE INDEX `menus_organization_id_site_id_idx` ON `menus` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX `notification_events_org_site_idx` ON `notification_events` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX `onboarding_drafts_user_id_idx` ON `onboarding_drafts` (`user_id`);--> statement-breakpoint
CREATE INDEX `post_channel_jobs_post_id_idx` ON `post_channel_jobs` (`post_id`);--> statement-breakpoint
CREATE INDEX `post_media_org_site_idx` ON `post_media` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX `post_translations_post_id_idx` ON `post_translations` (`post_id`);--> statement-breakpoint
CREATE INDEX `posts_org_site_idx` ON `posts` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX `reservation_slot_overrides_org_site_idx` ON `reservation_slot_overrides` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX `reservation_submissions_organization_id_idx` ON `reservation_submissions` (`organization_id`);--> statement-breakpoint
CREATE INDEX `service_addon_purchases_organization_id_idx` ON `service_addon_purchases` (`organization_id`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`userId`);--> statement-breakpoint
CREATE INDEX `site_config_org_site_idx` ON `site_config` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX `site_domain_events_domain_id_idx` ON `site_domain_events` (`domain_id`);--> statement-breakpoint
CREATE INDEX `site_domains_org_site_idx` ON `site_domains` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX `site_entitlements_organization_id_idx` ON `site_entitlements` (`organization_id`);--> statement-breakpoint
CREATE INDEX `site_events_org_site_idx` ON `site_events` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX `site_pageview_events_site_created_idx` ON `site_pageview_events` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `site_transfer_requests_site_id_idx` ON `site_transfer_requests` (`site_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sites` (
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
	`seo_title` text,
	`seo_description` text,
	`canonical_url` text,
	`robots` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`logo_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`og_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "sites_status_check" CHECK("__new_sites"."status" IN ('active', 'inactive', 'suspended')),
	CONSTRAINT "sites_plan_check" CHECK("__new_sites"."plan" IN ('free', 'growth', 'managed', 'seo_accelerator')),
	CONSTRAINT "sites_onboarding_status_check" CHECK("__new_sites"."onboarding_status" IN ('pending', 'active', 'failed')),
	CONSTRAINT "sites_url_structure_check" CHECK("__new_sites"."url_structure" IN ('location_subdirectories', 'brand_pages')),
	CONSTRAINT "sites_vertical_check" CHECK("__new_sites"."vertical" IN ('restaurant', 'experience', 'retail', 'wellness', 'service')),
	CONSTRAINT "sites_content_source_check" CHECK("__new_sites"."content_source" IN ('google_maps', 'client_supplied', 'generated')),
	CONSTRAINT "sites_media_source_check" CHECK("__new_sites"."media_source" IN ('client_photos', 'stock', 'mixed'))
);
--> statement-breakpoint
INSERT INTO `__new_sites`("id", "organization_id", "theme_id", "theme", "slug", "subdomain", "custom_domain", "custom_domain_status", "primary_location_id", "public_url", "brand_name", "brand_description", "logo_url", "logo_asset_id", "contact_email", "contact_phone", "source_locale", "default_currency", "status", "plan", "onboarding_status", "url_structure", "vertical", "content_source", "media_source", "settings", "last_published_at", "created_at", "updated_at", "updated_by", "og_image_asset_id", "seo_title", "seo_description", "canonical_url", "robots") SELECT "id", "organization_id", "theme_id", "theme", "slug", "subdomain", "custom_domain", "custom_domain_status", "primary_location_id", "public_url", "brand_name", "brand_description", "logo_url", "logo_asset_id", "contact_email", "contact_phone", "source_locale", "default_currency", "status", "plan", "onboarding_status", "url_structure", "vertical", "content_source", "media_source", "settings", "last_published_at", "created_at", "updated_at", "updated_by", "og_image_asset_id", "seo_title", "seo_description", "canonical_url", "robots" FROM `sites`;--> statement-breakpoint
DROP TABLE `sites`;--> statement-breakpoint
ALTER TABLE `__new_sites` RENAME TO `sites`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `sites_slug_unique` ON `sites` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `sites_subdomain_unique` ON `sites` (`subdomain`);--> statement-breakpoint
CREATE INDEX `sites_organization_id_idx` ON `sites` (`organization_id`);--> statement-breakpoint
CREATE INDEX `sites_created_at_idx` ON `sites` (`created_at`);--> statement-breakpoint
CREATE INDEX `submission_messages_org_site_idx` ON `submission_messages` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX `translation_job_items_job_id_idx` ON `translation_job_items` (`job_id`);--> statement-breakpoint
CREATE INDEX `translation_job_items_org_site_idx` ON `translation_job_items` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX `translation_jobs_org_site_idx` ON `translation_jobs` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX `work_requests_organization_id_idx` ON `work_requests` (`organization_id`);--> statement-breakpoint
CREATE TRIGGER `blog_posts_scope_org_site_insert`
BEFORE INSERT ON `blog_posts`
WHEN NEW.organization_id IS NOT NULL
  AND NEW.site_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sites
    WHERE id = NEW.site_id AND organization_id = NEW.organization_id
  )
BEGIN
  SELECT RAISE(ABORT, 'blog_posts site_id must belong to organization_id');
END;
--> statement-breakpoint
CREATE TRIGGER `blog_posts_scope_org_site_update`
BEFORE UPDATE OF `organization_id`, `site_id` ON `blog_posts`
WHEN NEW.organization_id IS NOT NULL
  AND NEW.site_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sites
    WHERE id = NEW.site_id AND organization_id = NEW.organization_id
  )
BEGIN
  SELECT RAISE(ABORT, 'blog_posts site_id must belong to organization_id');
END;