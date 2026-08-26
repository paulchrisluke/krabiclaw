PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sites` (
	id TEXT PRIMARY KEY,
	organization_id TEXT NOT NULL,
	theme_id TEXT NOT NULL DEFAULT 'saya-theme-v1',
	theme TEXT NOT NULL DEFAULT 'saya',
	slug TEXT UNIQUE NOT NULL,
	subdomain TEXT UNIQUE,
	custom_domain TEXT,
	custom_domain_status TEXT DEFAULT 'none',
	primary_location_id TEXT,
	public_url TEXT,
	brand_name TEXT,
	brand_description TEXT,
	contact_email TEXT,
	contact_phone TEXT,
	source_locale TEXT NOT NULL DEFAULT 'en',
	default_currency TEXT NOT NULL DEFAULT 'THB',
	status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
	plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'growth', 'managed', 'seo_accelerator')),
	onboarding_status TEXT DEFAULT 'pending' CHECK (onboarding_status IN ('pending', 'active', 'failed')),
	url_structure TEXT NOT NULL DEFAULT 'location_subdirectories' CHECK (url_structure IN ('location_subdirectories', 'brand_pages')),
	vertical TEXT NOT NULL DEFAULT 'restaurant' CHECK (vertical IN ('restaurant', 'experience', 'retail', 'wellness', 'service')),
	settings TEXT,
	last_published_at TEXT,
	created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_by TEXT,
	`seo_title` text,
	`seo_description` text,
	`canonical_url` text,
	`robots` text,
	`feature_overrides` text,
	`team_id` text REFERENCES `team`(`id`) ON DELETE set null,
	`social_facebook_url` text,
	`social_instagram_url` text,
	`social_tiktok_url` text,
	FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
	FOREIGN KEY (theme_id) REFERENCES themes(id)
);--> statement-breakpoint
CREATE TABLE `__new_facebook_pages_connections` (
	id TEXT PRIMARY KEY,
	organization_id TEXT NOT NULL,
	site_id TEXT NOT NULL,
	connected_by_user_id TEXT,
	facebook_user_id TEXT NOT NULL,
	facebook_page_id TEXT,
	facebook_page_name TEXT,
	encrypted_user_token TEXT NOT NULL,
	encrypted_page_token TEXT,
	user_token_expires_at TEXT,
	scopes TEXT,
	status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'error')),
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
	FOREIGN KEY (site_id) REFERENCES `__new_sites`(id) ON DELETE CASCADE,
	FOREIGN KEY (connected_by_user_id) REFERENCES user(id) ON DELETE SET NULL,
	UNIQUE(organization_id, site_id)
);--> statement-breakpoint
CREATE TABLE `__new_business_locations` (
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
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`facebook_connection_id`) REFERENCES `__new_facebook_pages_connections`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE TABLE `__new_guest_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`submission_type` text NOT NULL,
	`submission_id` text NOT NULL,
	`guest_name` text NOT NULL,
	`guest_email` text,
	`guest_phone` text,
	`inbox_status` text DEFAULT 'open' NOT NULL,
	`unread_count` integer DEFAULT 0 NOT NULL,
	`last_message_at` text,
	`last_inbound_at` text,
	`last_outbound_at` text,
	`last_message_preview` text,
	`owner_last_seen_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`conversation_state` text DEFAULT 'needs_attention' NOT NULL CHECK(`conversation_state` IN ('needs_attention', 'waiting_on_guest', 'resolved')),
	`operational_status` text,
	`resolved_at` text,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `__new_business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "guest_threads_submission_type_check" CHECK(submission_type IN ('contact', 'reservation', 'experience_booking')),
	CONSTRAINT "guest_threads_inbox_status_check" CHECK(inbox_status IN ('open', 'waiting_on_owner', 'waiting_on_guest', 'closed'))
);--> statement-breakpoint
CREATE TABLE `__new_customers` (
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
	`source` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`review_request_opted_out_at` text,
	`marketing_opted_out_at` text,
	`loyalty_points_balance` integer DEFAULT 0 NOT NULL,
	`last_booking_at` text,
	`last_review_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`phone_metadata_version` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "customers_source_check" CHECK(source IN ('reservation', 'experience_booking', 'review_request', 'manual', 'stripe', 'import')),
	CONSTRAINT "customers_status_check" CHECK(status IN ('active', 'merged', 'suppressed', 'deleted'))
);--> statement-breakpoint
CREATE TABLE `__new_review_requests` (
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
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `__new_business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`customer_id`) REFERENCES `__new_customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`anonymous_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "review_requests_booking_type_check" CHECK(booking_type IN ('reservation', 'experience_booking'))
);--> statement-breakpoint
CREATE TABLE `__new_guest_thread_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`kind` text NOT NULL,
	`actor_kind` text NOT NULL,
	`actor_user_id` text,
	`channel` text,
	`body` text,
	`event_name` text,
	`payload_json` text,
	`external_id` text,
	`occurred_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sequence` integer,
	FOREIGN KEY (`thread_id`) REFERENCES `__new_guest_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "guest_thread_entries_kind_check" CHECK(kind IN ('submission', 'message', 'operation', 'delivery', 'assignment', 'resolution')),
	CONSTRAINT "guest_thread_entries_actor_kind_check" CHECK(actor_kind IN ('guest', 'member', 'system')),
	CONSTRAINT "guest_thread_entries_channel_check" CHECK(channel IS NULL OR channel IN ('web', 'email', 'whatsapp', 'system'))
);--> statement-breakpoint
CREATE TABLE `__new_site_domains` (
	id TEXT PRIMARY KEY,
	organization_id TEXT NOT NULL,
	site_id TEXT NOT NULL,
	domain TEXT UNIQUE NOT NULL,
	type TEXT NOT NULL CHECK (type IN ('subdomain', 'custom')),
	role TEXT NOT NULL DEFAULT 'secondary' CHECK (role IN ('canonical', 'secondary')),
	status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verifying', 'active', 'blocked', 'failed', 'disabled', 'deleted')),
	cloudflare_hostname_id TEXT UNIQUE,
	cloudflare_hostname_status TEXT,
	cloudflare_ssl_status TEXT,
	ownership_validation_name TEXT,
	ownership_validation_type TEXT,
	ownership_validation_value TEXT,
	ssl_validation_name TEXT,
	ssl_validation_type TEXT,
	ssl_validation_value TEXT,
	dns_target TEXT,
	dns_status TEXT NOT NULL DEFAULT 'pending' CHECK (dns_status IN ('pending', 'valid', 'invalid', 'unknown')),
	last_synced_at TEXT,
	next_check_at TEXT,
	retry_count INTEGER NOT NULL DEFAULT 0,
	activated_at TEXT,
	error_message TEXT,
	metadata TEXT,
	created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`ssl_validation_name_2` text,
	`ssl_validation_type_2` text,
	`ssl_validation_value_2` text,
	`dcv_delegation_name` text,
	`dcv_delegation_type` text,
	`dcv_delegation_value` text,
	`dns_last_resolved_at` text,
	`dns_resolved_target` text,
	`validation_strategy` text DEFAULT 'http_auto' NOT NULL,
	`certificate_last_active_at` text,
	`renewal_issue_started_at` text,
	`renewal_notification_sent_at` text,
	`certificate_expires_at` text,
	FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
	FOREIGN KEY (site_id) REFERENCES `__new_sites`(id) ON DELETE CASCADE
);--> statement-breakpoint
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
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `__new_business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `__new_customers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`review_request_id`) REFERENCES `__new_review_requests`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`entered_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "reviews_booking_type_check" CHECK(booking_type IS NULL OR booking_type IN ('reservation', 'experience_booking')),
	CONSTRAINT "reviews_rating_check" CHECK(rating BETWEEN 1 AND 5),
	CONSTRAINT "reviews_publication_authorized_check" CHECK(publication_authorized IN (0, 1)),
	CONSTRAINT "reviews_collection_method_check" CHECK(collection_method IS NULL OR collection_method IN ('in_person', 'email', 'phone', 'migration', 'other')),
	CONSTRAINT "reviews_owner_entered_provenance_check" CHECK(source != 'owner_entered' OR (organization_id IS NOT NULL AND site_id IS NOT NULL AND location_id IS NULL AND entered_by_user_id IS NOT NULL AND collection_method IS NOT NULL AND publication_authorized = 1))
);--> statement-breakpoint
CREATE TABLE `__new_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
	`google_post_id` text,
	`slug` text,
	`post_type` text NOT NULL DEFAULT 'standard',
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
	`status` text NOT NULL DEFAULT 'draft',
	`scheduled_for` text,
	`published_at` text,
	`source` text NOT NULL DEFAULT 'manual',
	`created_by` text NOT NULL,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `__new_business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT `posts_source_check` CHECK (source IN ('manual', 'template'))
);--> statement-breakpoint
CREATE TABLE `__new_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`site_id` text,
	`location_id` text,
	`scope` text DEFAULT 'organization' NOT NULL,
	`event_type` text,
	`severity` text DEFAULT 'info' NOT NULL,
	`actor_user_id` text,
	`target_user_id` text,
	`deep_link` text,
	`message` text,
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
	`related_submission_type` text,
	`related_submission_id` text,
	`whatsapp_delivery_status` text,
	`whatsapp_delivery_error` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`location_id`) REFERENCES `__new_business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`target_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "notifications_whatsapp_delivery_status_check" CHECK(whatsapp_delivery_status IS NULL OR whatsapp_delivery_status IN ('accepted', 'sent', 'delivered', 'read', 'failed')),
	CONSTRAINT "notifications_related_submission_type_check" CHECK(related_submission_type IS NULL OR related_submission_type IN ('contact', 'reservation', 'experience_booking', 'invitation'))
);--> statement-breakpoint
CREATE TABLE `__new_menus` (
	id TEXT PRIMARY KEY,
	organization_id TEXT NOT NULL,
	site_id TEXT NOT NULL,
	location_id TEXT,
	name TEXT NOT NULL,
	description TEXT,
	section_order TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	created_by TEXT,
	updated_by TEXT,
	`seo_title` text,
	`seo_description` text,
	`canonical_url` text,
	`robots` text,
	`is_visible` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
	FOREIGN KEY (site_id) REFERENCES `__new_sites`(id) ON DELETE CASCADE,
	FOREIGN KEY (location_id) REFERENCES `__new_business_locations`(id) ON DELETE CASCADE
);--> statement-breakpoint
CREATE TABLE `__new_guest_thread_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`entry_id` text,
	`channel` text NOT NULL,
	`provider` text,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`provider_message_id` text,
	`to_address` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`from_name` text,
	`subject` text,
	`text_body` text,
	`reply_to` text,
	`locale` text,
	`template_version` text,
	`source_snapshot_json` text,
	`payload_hash` text,
	`provider_idempotency_key` text,
	`processing_lease_until` text,
	FOREIGN KEY (`thread_id`) REFERENCES `__new_guest_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `__new_guest_thread_entries`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "guest_thread_deliveries_channel_check" CHECK(channel IN ('email', 'whatsapp')),
	CONSTRAINT "guest_thread_deliveries_status_check" CHECK(status IN ('queued', 'sent', 'failed'))
);--> statement-breakpoint
CREATE TABLE `__new_experiences` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`tagline` text,
	`body` text,
	`price` text,
	`price_amount` numeric,
	`compare_at_price_amount` numeric,
	`sale_starts_at` text,
	`sale_ends_at` text,
	`duration_minutes` integer,
	`max_capacity` integer,
	`time_slots` text,
	`recurring_slots` text,
	`available_note` text,
	`status` text NOT NULL DEFAULT 'active',
	`sort_order` integer NOT NULL DEFAULT 0,
	`featured` numeric NOT NULL DEFAULT false,
	`featured_sort_order` integer NOT NULL DEFAULT 0,
	`seo_title` text,
	`seo_description` text,
	`canonical_url` text,
	`robots` text,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`created_by` text,
	`highlights` text,
	`included_items` text,
	`what_to_bring` text,
	`meeting_point` text,
	`cancellation_policy` text,
	`source` text NOT NULL DEFAULT 'manual',
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `__new_business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `experiences_source_check` CHECK (source IN ('manual', 'template'))
);--> statement-breakpoint
CREATE TABLE `__new_chowbot_conversations` (
	id TEXT PRIMARY KEY,
	organization_id TEXT NOT NULL,
	site_id TEXT NOT NULL,
	user_id TEXT NOT NULL,
	title TEXT NOT NULL DEFAULT 'New Conversation',
	active_channel TEXT NOT NULL DEFAULT 'dashboard' CHECK (active_channel IN ('dashboard', 'whatsapp')),
	status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
	selected_location_id TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
	FOREIGN KEY (site_id) REFERENCES `__new_sites`(id) ON DELETE CASCADE,
	FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
	FOREIGN KEY (selected_location_id) REFERENCES `__new_business_locations`(id) ON DELETE SET NULL
);--> statement-breakpoint
CREATE TABLE `__new_blog_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`site_id` text,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`excerpt` text,
	`category` text,
	`tags_json` text,
	`nav_section` text,
	`nav_title` text,
	`nav_order` integer,
	`nav_section_order` integer,
	`hide_from_nav` integer NOT NULL DEFAULT 0,
	`featured_order` integer,
	`status` text NOT NULL DEFAULT 'draft',
	`visibility` text NOT NULL DEFAULT 'public',
	`author_id` text,
	`published_at` text,
	`first_published_at` text,
	`scheduled_for` text,
	`slug_manually_overridden` integer NOT NULL DEFAULT 0,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`seo_title` text,
	`seo_description` text,
	`seo_keywords` text,
	`canonical_url` text,
	`robots` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT `blog_posts_scope_check` CHECK ((organization_id IS NULL AND site_id IS NULL) OR (organization_id IS NOT NULL AND site_id IS NOT NULL)),
	CONSTRAINT `blog_posts_status_check` CHECK (status IN ('draft', 'published', 'scheduled', 'archived')),
	CONSTRAINT `blog_posts_visibility_check` CHECK (visibility IN ('public', 'unlisted')),
	CONSTRAINT `blog_posts_category_check` CHECK (site_id IS NOT NULL OR category IS NOT NULL)
);--> statement-breakpoint
CREATE TABLE `__new_work_requests` (
	id TEXT PRIMARY KEY,
	organization_id TEXT NOT NULL,
	site_id TEXT,
	type TEXT NOT NULL CHECK (type IN (
    'content_update', 'menu_update', 'translation', 'seo', 'google_business',
    'seasonal', 'photo_update', 'social_media', 'technical', 'other'
  )),
	title TEXT NOT NULL,
	description TEXT,
	status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled')),
	priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
	source TEXT NOT NULL DEFAULT 'dashboard' CHECK (source IN ('dashboard', 'whatsapp', 'chowbot', 'admin')),
	notes TEXT,
	assigned_to TEXT,
	completed_at TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
	FOREIGN KEY (site_id) REFERENCES `__new_sites`(id) ON DELETE SET NULL,
	FOREIGN KEY (assigned_to) REFERENCES user(id) ON DELETE SET NULL
);--> statement-breakpoint
CREATE TABLE `__new_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text,
	`resource` text NOT NULL,
	`source` text NOT NULL,
	`provider` text,
	`channel` text,
	`quantity` integer NOT NULL,
	`unit` text NOT NULL,
	`metadata_json` text,
	`idempotency_key` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`session_id` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE TABLE `__new_tenant_redirects` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`locale` text NOT NULL,
	`owner_variant_id` text,
	`from_path` text NOT NULL,
	`to_path` text,
	`status_code` integer DEFAULT 301 NOT NULL,
	`behavior` text DEFAULT 'redirect' NOT NULL,
	`reason` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON DELETE cascade,
	CONSTRAINT `tenant_redirects_from_path_check` CHECK(from_path LIKE '/%'),
	CONSTRAINT `tenant_redirects_behavior_check` CHECK(behavior IN ('redirect', 'gone', 'noindex')),
	CONSTRAINT `tenant_redirects_redirect_to_path_check` CHECK(behavior != 'redirect' OR to_path IS NOT NULL)
);--> statement-breakpoint
CREATE TABLE `__new_tenant_pages` (
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
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE TABLE `__new_tenant_page_variants` (
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
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `__new_tenant_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `content_documents`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `tenant_page_variants_path_check` CHECK(path LIKE '/%' AND path NOT LIKE '//%')
);--> statement-breakpoint
CREATE TABLE `__new_tenant_compliance` (
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
	`document_asset_ids` text,
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
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`privacy_page_id`) REFERENCES `__new_tenant_pages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`terms_page_id`) REFERENCES `__new_tenant_pages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`notice_page_id`) REFERENCES `__new_tenant_pages`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT `tenant_compliance_address_visibility_check` CHECK(address_visibility IN ('visible', 'hidden'))
);--> statement-breakpoint
CREATE TABLE `__new_stripe_ga4_subscription_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`) ON DELETE CASCADE,
	`user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
	`stripe_subscription_id` text,
	`action` text NOT NULL,
	`site_id` text REFERENCES `__new_sites`(`id`) ON DELETE SET NULL,
	`client_id` text,
	`session_id` text,
	`session_captured_at` integer,
	`previous_price_id` text,
	`new_price_id` text,
	`effective_timing` text NOT NULL DEFAULT 'immediate',
	`source` text NOT NULL DEFAULT 'browser',
	`status` text NOT NULL DEFAULT 'pending',
	`lifecycle_sent_at` text,
	`consumed_at` text,
	`consumed_event_id` text,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	CONSTRAINT `stripe_ga4_subscription_intents_action_check`
    CHECK (`action` IN ('initial_subscription', 'upgrade', 'downgrade')),
	CONSTRAINT `stripe_ga4_subscription_intents_status_check`
    CHECK (`status` IN ('pending', 'consumed', 'expired')),
	CONSTRAINT `stripe_ga4_subscription_intents_timing_check`
    CHECK (`effective_timing` IN ('immediate', 'period_end'))
);--> statement-breakpoint
CREATE TABLE `__new_site_transfer_requests` (
	id TEXT PRIMARY KEY,
	site_id TEXT NOT NULL,
	from_organization_id TEXT NOT NULL,
	to_email TEXT NOT NULL,
	token TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'cancelled')),
	initiated_by_user_id TEXT NOT NULL,
	accepted_by_user_id TEXT,
	claiming_user_id TEXT,
	claiming_organization_id TEXT,
	message TEXT,
	invited_plan TEXT,
	invited_coupon TEXT,
	invited_domain TEXT,
	requires_payment INTEGER NOT NULL DEFAULT 0,
	stripe_checkout_session_id TEXT,
	payment_completed_at TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	completed_at TEXT,
	last_reminder_at TEXT,
	reminder_count INTEGER NOT NULL DEFAULT 0,
	custom_domains_snapshot TEXT,
	custom_domains_removed_at TEXT,
	invited_interval TEXT NOT NULL DEFAULT 'month',
	FOREIGN KEY (site_id) REFERENCES `__new_sites`(id) ON DELETE CASCADE,
	FOREIGN KEY (initiated_by_user_id) REFERENCES user(id) ON DELETE RESTRICT,
	FOREIGN KEY (accepted_by_user_id) REFERENCES user(id) ON DELETE SET NULL,
	FOREIGN KEY (claiming_user_id) REFERENCES user(id) ON DELETE SET NULL
);--> statement-breakpoint
CREATE TABLE `__new_site_theme_tokens` (
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
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "site_theme_tokens_status_check" CHECK(status IN ('active', 'disabled'))
);--> statement-breakpoint
CREATE TABLE `__new_site_pageview_events` (
	id TEXT PRIMARY KEY,
	site_id TEXT NOT NULL,
	location_id TEXT,
	page_path TEXT NOT NULL,
	referrer TEXT,
	user_agent TEXT,
	ip_hash TEXT,
	session_id TEXT,
	duration_seconds INTEGER,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	visitor_id TEXT,
	country TEXT,
	region TEXT,
	city TEXT,
	`page_id` text,
	`page_type` text,
	`recipe` text,
	`locale` text,
	`revision_id` text,
	FOREIGN KEY (site_id) REFERENCES `__new_sites`(id) ON DELETE CASCADE,
	FOREIGN KEY (location_id) REFERENCES `__new_business_locations`(id) ON DELETE SET NULL
);--> statement-breakpoint
CREATE TABLE `__new_site_locales` (
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
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "site_locales_status_check" CHECK(status IN ('published', 'disabled') AND (is_source = 0 OR status = 'published'))
);--> statement-breakpoint
CREATE TABLE `__new_site_link_pages` (
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
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `site_link_pages_path_check` CHECK(path LIKE '/%' AND path NOT LIKE '//%'),
	CONSTRAINT `site_link_pages_robots_check` CHECK(robots IN ('index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow'))
);--> statement-breakpoint
CREATE TABLE `__new_site_link_items` (
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
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`link_page_id`) REFERENCES `__new_site_link_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `site_link_items_status_check` CHECK(status IN ('active', 'hidden'))
);--> statement-breakpoint
CREATE TABLE `__new_site_events` (
	id TEXT PRIMARY KEY,
	organization_id TEXT NOT NULL,
	site_id TEXT NOT NULL,
	location_id TEXT,
	actor_id TEXT,
	event_type TEXT NOT NULL,
	entity_type TEXT,
	entity_id TEXT,
	metadata TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
	FOREIGN KEY (site_id) REFERENCES `__new_sites`(id) ON DELETE CASCADE,
	FOREIGN KEY (location_id) REFERENCES `__new_business_locations`(id) ON DELETE SET NULL,
	FOREIGN KEY (actor_id) REFERENCES user(id) ON DELETE SET NULL
);--> statement-breakpoint
CREATE TABLE `__new_site_entitlements` (
	id TEXT PRIMARY KEY,
	site_id TEXT NOT NULL,
	organization_id TEXT NOT NULL,
	key TEXT NOT NULL,
	value TEXT,
	source TEXT NOT NULL DEFAULT 'system',
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (site_id) REFERENCES `__new_sites`(id) ON DELETE CASCADE,
	FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
	UNIQUE(site_id, key)
);--> statement-breakpoint
CREATE TABLE `__new_site_domain_events` (
	id TEXT PRIMARY KEY,
	organization_id TEXT NOT NULL,
	site_id TEXT NOT NULL,
	domain_id TEXT,
	event_type TEXT NOT NULL,
	actor_type TEXT NOT NULL DEFAULT 'system' CHECK (actor_type IN ('owner', 'admin', 'system', 'cloudflare')),
	actor_id TEXT,
	message TEXT,
	before_state TEXT,
	after_state TEXT,
	metadata TEXT,
	created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
	FOREIGN KEY (site_id) REFERENCES `__new_sites`(id) ON DELETE CASCADE,
	FOREIGN KEY (domain_id) REFERENCES `__new_site_domains`(id) ON DELETE SET NULL
);--> statement-breakpoint
CREATE TABLE `__new_site_conversion_events` (
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
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "site_conversion_events_name_check" CHECK((event_name GLOB '[a-z]' OR event_name GLOB '[a-z][a-z0-9_]*') AND length(event_name) <= 64)
);--> statement-breakpoint
CREATE TABLE `__new_site_consultation_settings` (
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
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "site_consultation_settings_mode_check" CHECK(mode IN ('external_url', 'native_disabled')),
	CONSTRAINT "site_consultation_settings_schedule_path_check" CHECK(schedule_path LIKE '/%'),
	CONSTRAINT "site_consultation_settings_confirmation_path_check" CHECK(confirmation_path LIKE '/%')
);--> statement-breakpoint
CREATE TABLE `__new_site_config` (
	organization_id TEXT NOT NULL,
	site_id TEXT NOT NULL,
	key TEXT NOT NULL,
	value TEXT,
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	PRIMARY KEY (organization_id, site_id, key),
	FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
	FOREIGN KEY (site_id) REFERENCES `__new_sites`(id) ON DELETE CASCADE
);--> statement-breakpoint
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
	`payment_status` text DEFAULT 'unknown' NOT NULL,
	`paid_through` text,
	`last_paid_invoice_id` text,
	`last_payment_event_created` integer,
	`last_payment_event_id` text,
	`past_due_since` text,
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `site_billing_site_id_unique` UNIQUE(`site_id`),
	CONSTRAINT `site_billing_stripe_subscription_id_unique` UNIQUE(`stripe_subscription_id`),
	CONSTRAINT `site_billing_stripe_subscription_item_id_unique` UNIQUE(`stripe_subscription_item_id`)
);--> statement-breakpoint
CREATE TABLE `__new_site_analytics_daily` (
	id TEXT PRIMARY KEY NOT NULL,
	site_id TEXT NOT NULL,
	date TEXT NOT NULL,
	page_views INTEGER DEFAULT 0,
	unique_sessions INTEGER DEFAULT 0,
	avg_session_duration INTEGER DEFAULT 0,
	top_pages TEXT,
	created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	unique_visitors INTEGER DEFAULT 0,
	pages_per_session REAL DEFAULT 0,
	returning_visitors INTEGER DEFAULT 0,
	CONSTRAINT site_analytics_daily_site_id_date_unique UNIQUE (site_id, date),
	FOREIGN KEY (site_id) REFERENCES `__new_sites`(id) ON DELETE CASCADE
);--> statement-breakpoint
CREATE TABLE `__new_reservation_submissions` (
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
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `__new_customers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`location_id`) REFERENCES `__new_business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_id`) REFERENCES `__new_reviews`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "reservation_submissions_completion_source_check" CHECK(completion_source IS NULL OR completion_source IN ('manual', 'auto'))
);--> statement-breakpoint
CREATE TABLE `__new_reservation_slot_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
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
	FOREIGN KEY (`location_id`) REFERENCES `__new_business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reservation_slot_overrides_status_check" CHECK(status IN ('closed', 'open'))
);--> statement-breakpoint
CREATE TABLE `__new_public_resource_cache_invalidations` (
	id TEXT PRIMARY KEY NOT NULL,
	site_id TEXT NOT NULL REFERENCES `__new_sites`(id) ON DELETE CASCADE,
	reason TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending',
	attempt_count INTEGER NOT NULL DEFAULT 0,
	claimed_at TEXT,
	processed_at TEXT,
	last_error TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);--> statement-breakpoint
CREATE TABLE `__new_post_channel_jobs` (
	id TEXT PRIMARY KEY,
	post_id TEXT NOT NULL,
	organization_id TEXT NOT NULL,
	channel TEXT NOT NULL CHECK (channel IN ('site', 'gmb', 'instagram', 'facebook')),
	status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'failed', 'skipped')),
	provider_post_id TEXT,
	error TEXT,
	published_at TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (post_id) REFERENCES `__new_posts`(id) ON DELETE CASCADE,
	FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE
);--> statement-breakpoint
CREATE TABLE `__new_onboarding_drafts` (
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
	FOREIGN KEY (`committed_site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "onboarding_drafts_status_check" CHECK(status IN ('active', 'committing', 'committed', 'failed'))
);--> statement-breakpoint
CREATE TABLE `__new_offerings` (
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
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `__new_business_locations`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE TABLE `__new_notification_reads` (
	`notification_id` text NOT NULL,
	`user_id` text NOT NULL,
	`read_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`notification_id`, `user_id`),
	FOREIGN KEY (`notification_id`) REFERENCES `__new_notifications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE TABLE `__new_notification_events` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_type` text NOT NULL,
	`organization_id` text,
	`site_id` text,
	`submission_type` text NOT NULL,
	`submission_id` text NOT NULL,
	`event_type` text NOT NULL,
	`channels` text,
	`recipients` text,
	`payload` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE TABLE `__new_notification_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`notification_id` text NOT NULL,
	`channel` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider_message_id` text,
	`error` text,
	`sent_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`notification_id`) REFERENCES `__new_notifications`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE TABLE `__new_menu_items` (
	`id` text PRIMARY KEY NOT NULL,
	`menu_id` text NOT NULL,
	`section` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL DEFAULT '',
	`description` text,
	`price_amount` numeric,
	`compare_at_price_amount` numeric,
	`sale_starts_at` text,
	`sale_ends_at` text,
	`available` numeric NOT NULL DEFAULT 1,
	`featured` numeric NOT NULL DEFAULT false,
	`featured_sort_order` integer NOT NULL DEFAULT 0,
	`sort_order` integer NOT NULL DEFAULT 0,
	`allergens` text,
	`ingredients` text,
	`dietary_notes` text,
	`preparation` text,
	`serving_note` text,
	`source` text NOT NULL DEFAULT 'manual',
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`created_by` text,
	`updated_by` text,
	`seo_title` text,
	`seo_description` text,
	`canonical_url` text,
	`robots` text,
	FOREIGN KEY (`menu_id`) REFERENCES `__new_menus`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `menu_items_source_check` CHECK (source IN ('manual', 'template'))
);--> statement-breakpoint
CREATE TABLE `__new_media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`kind` text NOT NULL CHECK (`kind` IN ('image', 'video', 'file')),
	`provider` text NOT NULL CHECK (`provider` IN ('cloudflare_images', 'cloudflare_r2', 'google_business', 'external_url', 'chowbot')),
	`source` text NOT NULL CHECK (`source` IN ('uploaded', 'google_sync', 'generated', 'external', 'template_stock')),
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
	`status` text DEFAULT 'active' NOT NULL CHECK (`status` IN ('pending', 'active', 'deleted', 'failed')),
	`created_by_user_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "media_assets_category_check" CHECK(category IS NULL OR category IN ('exterior', 'interior', 'food', 'menu', 'team', 'other', 'logo', 'blog'))
);--> statement-breakpoint
CREATE TABLE `__new_mcp_workspace_preferences` (
	user_id TEXT PRIMARY KEY,
	organization_id TEXT,
	site_id TEXT,
	location_id TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
	FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE SET NULL,
	FOREIGN KEY (site_id) REFERENCES `__new_sites`(id) ON DELETE SET NULL,
	FOREIGN KEY (location_id) REFERENCES `__new_business_locations`(id) ON DELETE SET NULL
);--> statement-breakpoint
CREATE TABLE `__new_mcp_tool_call_events` (
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
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`location_id`) REFERENCES `__new_business_locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE TABLE `__new_location_qa` (
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
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `__new_business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "location_qa_scope_check" CHECK(location_id IS NULL OR page_path IS NULL),
	CONSTRAINT "location_qa_page_path_check" CHECK(page_path IS NULL OR page_path LIKE '/%'),
	CONSTRAINT "location_qa_source_check" CHECK(source IN ('manual','import','template')),
	CONSTRAINT "location_qa_status_check" CHECK(status IN ('published','hidden'))
);--> statement-breakpoint
CREATE TABLE `__new_guest_thread_sequence_counters` (
	`thread_id` text PRIMARY KEY NOT NULL,
	`next_sequence` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `__new_guest_threads`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE TABLE `__new_guest_thread_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`delivery_id` text,
	`event_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text,
	`locked_at` text,
	`last_error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `__new_guest_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`delivery_id`) REFERENCES `__new_guest_thread_deliveries`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "guest_thread_outbox_status_check" CHECK(status IN ('pending', 'publishing', 'published', 'failed', 'dead'))
);--> statement-breakpoint
CREATE TABLE `__new_guest_thread_member_state` (
	`thread_id` text NOT NULL,
	`member_id` text NOT NULL,
	`last_read_entry_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`last_read_sequence` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`thread_id`, `member_id`),
	FOREIGN KEY (`thread_id`) REFERENCES `__new_guest_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`last_read_entry_id`) REFERENCES `__new_guest_thread_entries`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE TABLE `__new_guest_thread_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`action` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`actor_kind` text NOT NULL,
	`actor_user_id` text,
	`actor_member_id` text,
	`request_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`result_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`thread_id`) REFERENCES `__new_guest_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`actor_member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "guest_thread_commands_actor_kind_check" CHECK(actor_kind IN ('member', 'guest', 'system')),
	CONSTRAINT "guest_thread_commands_status_check" CHECK(status IN ('pending', 'completed', 'failed'))
);--> statement-breakpoint
CREATE TABLE `__new_google_place_snapshots` (
	id TEXT PRIMARY KEY,
	site_id TEXT NOT NULL,
	location_id TEXT,
	place_id TEXT NOT NULL,
	source_url TEXT,
	snapshot_json TEXT NOT NULL,
	fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (site_id) REFERENCES `__new_sites`(id) ON DELETE CASCADE,
	FOREIGN KEY (location_id) REFERENCES `__new_business_locations`(id) ON DELETE SET NULL
);--> statement-breakpoint
CREATE TABLE `__new_google_analytics_connections` (
	id TEXT PRIMARY KEY,
	organization_id TEXT NOT NULL,
	site_id TEXT NOT NULL,
	connected_by_user_id TEXT,
	provider_account_email TEXT NOT NULL,
	encrypted_access_token TEXT NOT NULL,
	encrypted_refresh_token TEXT NOT NULL,
	scopes TEXT NOT NULL,
	ga4_property_id TEXT,
	ga4_property_name TEXT,
	ga4_measurement_id TEXT,
	search_console_site_url TEXT,
	status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'error')),
	expires_at TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
	FOREIGN KEY (site_id) REFERENCES `__new_sites`(id) ON DELETE CASCADE,
	FOREIGN KEY (connected_by_user_id) REFERENCES user(id) ON DELETE SET NULL,
	UNIQUE(organization_id, site_id)
);--> statement-breakpoint
CREATE TABLE `__new_experience_slot_overrides` (
	id TEXT PRIMARY KEY,
	experience_id TEXT NOT NULL,
	organization_id TEXT NOT NULL,
	site_id TEXT NOT NULL,
	override_date TEXT NOT NULL,
	time_slot TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('closed', 'open')),
	capacity_override INTEGER,
	note TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	created_by TEXT,
	FOREIGN KEY (experience_id) REFERENCES `__new_experiences`(id) ON DELETE CASCADE,
	FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
	FOREIGN KEY (site_id) REFERENCES `__new_sites`(id) ON DELETE CASCADE
);--> statement-breakpoint
CREATE TABLE `__new_experience_bookings` (
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
	FOREIGN KEY (`experience_id`) REFERENCES `__new_experiences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `__new_customers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`location_id`) REFERENCES `__new_business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_id`) REFERENCES `__new_reviews`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "experience_bookings_completion_source_check" CHECK(completion_source IS NULL OR completion_source IN ('manual', 'auto'))
);--> statement-breakpoint
CREATE TABLE `__new_domain_reconciliation_jobs` (
	id TEXT PRIMARY KEY,
	domain_id TEXT NOT NULL UNIQUE,
	status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
	run_after TEXT NOT NULL,
	attempts INTEGER NOT NULL DEFAULT 0,
	last_error TEXT,
	created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (domain_id) REFERENCES `__new_site_domains`(id) ON DELETE CASCADE
);--> statement-breakpoint
CREATE TABLE `__new_dashboard_preferences` (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	organization_id TEXT NOT NULL,
	selected_location_id TEXT,
	created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
	FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
	FOREIGN KEY (selected_location_id) REFERENCES `__new_business_locations`(id) ON DELETE SET NULL,
	UNIQUE(user_id, organization_id)
);--> statement-breakpoint
CREATE TABLE `__new_customer_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`email_at_claim` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`token_hash` text,
	`token_expires_at` integer,
	`verified_at` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `__new_customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "customer_claims_status_check" CHECK(status IN ('pending', 'verified', 'expired', 'rejected'))
);--> statement-breakpoint
CREATE TABLE `__new_contact_submissions` (
	id TEXT PRIMARY KEY,
	organization_id TEXT NOT NULL,
	site_id TEXT NOT NULL,
	name TEXT NOT NULL,
	email TEXT NOT NULL,
	message TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'replied')),
	ip_hash TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`subject` text,
	`experience_id` text REFERENCES `__new_experiences`(id) ON DELETE set null,
	`consent_at` text,
	`location_id` text REFERENCES `__new_business_locations`(id) ON DELETE set null,
	FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
	FOREIGN KEY (site_id) REFERENCES `__new_sites`(id) ON DELETE CASCADE
);--> statement-breakpoint
CREATE TABLE `__new_client_import_artifacts` (
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
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "client_import_artifacts_status_check" CHECK(status IN ('generated', 'approved', 'applied', 'superseded'))
);--> statement-breakpoint
CREATE TABLE `__new_chowbot_messages` (
	id TEXT PRIMARY KEY,
	conversation_id TEXT NOT NULL,
	organization_id TEXT NOT NULL,
	site_id TEXT NOT NULL,
	user_id TEXT,
	role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
	channel TEXT NOT NULL CHECK (channel IN ('dashboard', 'whatsapp')),
	content TEXT,
	media TEXT,
	meta_message_id TEXT UNIQUE,
	tool_calls TEXT,
	status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'read')),
	error TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	CHECK (content IS NOT NULL OR media IS NOT NULL OR tool_calls IS NOT NULL),
	FOREIGN KEY (conversation_id) REFERENCES `__new_chowbot_conversations`(id) ON DELETE CASCADE,
	FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
	FOREIGN KEY (site_id) REFERENCES `__new_sites`(id) ON DELETE CASCADE,
	FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE SET NULL
);--> statement-breakpoint
CREATE TABLE `__new_chowbot_channel_state` (
	user_id TEXT NOT NULL,
	channel TEXT NOT NULL CHECK (channel IN ('dashboard', 'whatsapp')),
	selected_site_id TEXT,
	active_conversation_id TEXT,
	pending_media TEXT,
	pending_confirmation TEXT,
	last_inbound_id TEXT,
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	PRIMARY KEY (user_id, channel),
	FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
	FOREIGN KEY (selected_site_id) REFERENCES `__new_sites`(id) ON DELETE SET NULL,
	FOREIGN KEY (active_conversation_id) REFERENCES `__new_chowbot_conversations`(id) ON DELETE SET NULL
);--> statement-breakpoint
CREATE TABLE `__new_canary_runs` (
	id TEXT PRIMARY KEY,
	run_type TEXT NOT NULL CHECK (run_type IN ('auth', 'notifications', 'rollback')),
	environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('production', 'staging', 'preview', 'local')),
	status TEXT NOT NULL CHECK (status IN ('pass', 'fail')),
	organization_id TEXT,
	site_id TEXT,
	details_json TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE SET NULL,
	FOREIGN KEY (site_id) REFERENCES `__new_sites`(id) ON DELETE SET NULL
);--> statement-breakpoint
CREATE TABLE `__new_booking_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`policy_type` text NOT NULL,
	`scope_type` text NOT NULL,
	`location_id` text,
	`experience_id` text,
	`booking_window_days` integer,
	`advance_notice_minutes` integer,
	`free_cancellation_until_minutes` integer,
	`late_arrival_grace_minutes` integer,
	`host_confirmation_sla_minutes` integer,
	`reschedule_allowed` numeric,
	`reschedule_cutoff_minutes` integer,
	`deposit_required` numeric,
	`deposit_trigger_party_size` integer,
	`special_requests_allowed` numeric,
	`weather_policy` text,
	`minimum_guest_age` integer,
	`accessibility_contact_required` numeric,
	`additional_notes_html` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `__new_business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`experience_id`) REFERENCES `__new_experiences`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "booking_policies_policy_type_check" CHECK(policy_type IN ('reservation', 'experience')),
	CONSTRAINT "booking_policies_scope_type_check" CHECK(scope_type IN ('site', 'location', 'experience')),
	CONSTRAINT "booking_policies_reservation_location_scope_check" CHECK(policy_type != 'reservation' OR (scope_type = 'location' AND location_id IS NOT NULL AND experience_id IS NULL))
);--> statement-breakpoint
CREATE TABLE `__new_blog_post_redirects` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`site_id` text,
	`old_slug` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `__new_blog_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `__new_sites`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE TABLE `__new_ai_usage_log` (
	id TEXT PRIMARY KEY,
	organization_id TEXT NOT NULL,
	site_id TEXT,
	action TEXT NOT NULL,
	model TEXT NOT NULL,
	input_tokens INTEGER NOT NULL DEFAULT 0,
	output_tokens INTEGER NOT NULL DEFAULT 0,
	credits_charged INTEGER NOT NULL DEFAULT 0,
	cf_gateway_log_id TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
	FOREIGN KEY (site_id) REFERENCES `__new_sites`(id) ON DELETE SET NULL
);--> statement-breakpoint
INSERT INTO `__new_sites` (`id`, `organization_id`, `theme_id`, `theme`, `slug`, `subdomain`, `custom_domain`, `custom_domain_status`, `primary_location_id`, `public_url`, `brand_name`, `brand_description`, `contact_email`, `contact_phone`, `source_locale`, `default_currency`, `status`, `plan`, `onboarding_status`, `url_structure`, `vertical`, `settings`, `last_published_at`, `created_at`, `updated_at`, `updated_by`, `seo_title`, `seo_description`, `canonical_url`, `robots`, `feature_overrides`, `team_id`, `social_facebook_url`, `social_instagram_url`, `social_tiktok_url`) SELECT `id`, `organization_id`, `theme_id`, `theme`, `slug`, `subdomain`, `custom_domain`, `custom_domain_status`, `primary_location_id`, `public_url`, `brand_name`, `brand_description`, `contact_email`, `contact_phone`, `source_locale`, `default_currency`, `status`, `plan`, `onboarding_status`, `url_structure`, `vertical`, `settings`, `last_published_at`, `created_at`, `updated_at`, `updated_by`, `seo_title`, `seo_description`, `canonical_url`, `robots`, `feature_overrides`, `team_id`, `social_facebook_url`, `social_instagram_url`, `social_tiktok_url` FROM `sites`;--> statement-breakpoint
INSERT INTO `__new_facebook_pages_connections` (`id`, `organization_id`, `site_id`, `connected_by_user_id`, `facebook_user_id`, `facebook_page_id`, `facebook_page_name`, `encrypted_user_token`, `encrypted_page_token`, `user_token_expires_at`, `scopes`, `status`, `created_at`, `updated_at`) SELECT `id`, `organization_id`, `site_id`, `connected_by_user_id`, `facebook_user_id`, `facebook_page_id`, `facebook_page_name`, `encrypted_user_token`, `encrypted_page_token`, `user_token_expires_at`, `scopes`, `status`, `created_at`, `updated_at` FROM `facebook_pages_connections`;--> statement-breakpoint
INSERT INTO `__new_business_locations` (`id`, `organization_id`, `site_id`, `slug`, `title`, `address`, `city`, `neighborhood`, `phone`, `website_url`, `maps_url`, `latitude`, `longitude`, `opening_hours`, `categories`, `rating`, `review_count`, `is_primary`, `status`, `last_synced_at`, `description`, `short_description`, `description_provenance`, `special_hours`, `price_level`, `attributes`, `email`, `facebook_url`, `facebook_page_id`, `facebook_connection_id`, `instagram_url`, `tiktok_url`, `grab_url`, `uber_eats_url`, `foodpanda_url`, `google_place_id`, `google_review_url`, `created_at`, `updated_at`, `notification_phone`, `timezone`, `max_capacity`, `seo_title`, `seo_description`, `canonical_url`, `robots`, `team_id`, `feature_overrides`) SELECT `id`, `organization_id`, `site_id`, `slug`, `title`, `address`, `city`, `neighborhood`, `phone`, `website_url`, `maps_url`, `latitude`, `longitude`, `opening_hours`, `categories`, `rating`, `review_count`, `is_primary`, `status`, `last_synced_at`, `description`, `short_description`, `description_provenance`, `special_hours`, `price_level`, `attributes`, `email`, `facebook_url`, `facebook_page_id`, `facebook_connection_id`, `instagram_url`, `tiktok_url`, `grab_url`, `uber_eats_url`, `foodpanda_url`, `google_place_id`, `google_review_url`, `created_at`, `updated_at`, `notification_phone`, `timezone`, `max_capacity`, `seo_title`, `seo_description`, `canonical_url`, `robots`, `team_id`, `feature_overrides` FROM `business_locations`;--> statement-breakpoint
INSERT INTO `__new_guest_threads` (`id`, `organization_id`, `site_id`, `location_id`, `submission_type`, `submission_id`, `guest_name`, `guest_email`, `guest_phone`, `inbox_status`, `unread_count`, `last_message_at`, `last_inbound_at`, `last_outbound_at`, `last_message_preview`, `owner_last_seen_at`, `created_at`, `updated_at`, `conversation_state`, `operational_status`, `resolved_at`, `version`) SELECT `id`, `organization_id`, `site_id`, `location_id`, `submission_type`, `submission_id`, `guest_name`, `guest_email`, `guest_phone`, `inbox_status`, `unread_count`, `last_message_at`, `last_inbound_at`, `last_outbound_at`, `last_message_preview`, `owner_last_seen_at`, `created_at`, `updated_at`, `conversation_state`, `operational_status`, `resolved_at`, `version` FROM `guest_threads`;--> statement-breakpoint
INSERT INTO `__new_customers` (`id`, `organization_id`, `site_id`, `user_id`, `stripe_customer_id`, `name`, `email`, `email_normalized`, `email_hash`, `phone`, `phone_normalized`, `source`, `status`, `review_request_opted_out_at`, `marketing_opted_out_at`, `loyalty_points_balance`, `last_booking_at`, `last_review_at`, `created_at`, `updated_at`, `phone_metadata_version`) SELECT `id`, `organization_id`, `site_id`, `user_id`, `stripe_customer_id`, `name`, `email`, `email_normalized`, `email_hash`, `phone`, `phone_normalized`, `source`, `status`, `review_request_opted_out_at`, `marketing_opted_out_at`, `loyalty_points_balance`, `last_booking_at`, `last_review_at`, `created_at`, `updated_at`, `phone_metadata_version` FROM `customers`;--> statement-breakpoint
INSERT INTO `__new_review_requests` (`id`, `organization_id`, `site_id`, `location_id`, `customer_id`, `booking_type`, `booking_id`, `token_hash`, `expires_at`, `first_sent_at`, `reminder_sent_at`, `submitted_at`, `clicked_at`, `revoked_at`, `send_count`, `last_error`, `anonymous_user_id`, `user_id`, `created_at`, `updated_at`) SELECT `id`, `organization_id`, `site_id`, `location_id`, `customer_id`, `booking_type`, `booking_id`, `token_hash`, `expires_at`, `first_sent_at`, `reminder_sent_at`, `submitted_at`, `clicked_at`, `revoked_at`, `send_count`, `last_error`, `anonymous_user_id`, `user_id`, `created_at`, `updated_at` FROM `review_requests`;--> statement-breakpoint
INSERT INTO `__new_guest_thread_entries` (`id`, `thread_id`, `organization_id`, `site_id`, `kind`, `actor_kind`, `actor_user_id`, `channel`, `body`, `event_name`, `payload_json`, `external_id`, `occurred_at`, `created_at`, `sequence`) SELECT `id`, `thread_id`, `organization_id`, `site_id`, `kind`, `actor_kind`, `actor_user_id`, `channel`, `body`, `event_name`, `payload_json`, `external_id`, `occurred_at`, `created_at`, `sequence` FROM `guest_thread_entries`;--> statement-breakpoint
INSERT INTO `__new_site_domains` (`id`, `organization_id`, `site_id`, `domain`, `type`, `role`, `status`, `cloudflare_hostname_id`, `cloudflare_hostname_status`, `cloudflare_ssl_status`, `ownership_validation_name`, `ownership_validation_type`, `ownership_validation_value`, `ssl_validation_name`, `ssl_validation_type`, `ssl_validation_value`, `dns_target`, `dns_status`, `last_synced_at`, `next_check_at`, `retry_count`, `activated_at`, `error_message`, `metadata`, `created_at`, `updated_at`, `ssl_validation_name_2`, `ssl_validation_type_2`, `ssl_validation_value_2`, `dcv_delegation_name`, `dcv_delegation_type`, `dcv_delegation_value`, `dns_last_resolved_at`, `dns_resolved_target`, `validation_strategy`, `certificate_last_active_at`, `renewal_issue_started_at`, `renewal_notification_sent_at`, `certificate_expires_at`) SELECT `id`, `organization_id`, `site_id`, `domain`, `type`, `role`, `status`, `cloudflare_hostname_id`, `cloudflare_hostname_status`, `cloudflare_ssl_status`, `ownership_validation_name`, `ownership_validation_type`, `ownership_validation_value`, `ssl_validation_name`, `ssl_validation_type`, `ssl_validation_value`, `dns_target`, `dns_status`, `last_synced_at`, `next_check_at`, `retry_count`, `activated_at`, `error_message`, `metadata`, `created_at`, `updated_at`, `ssl_validation_name_2`, `ssl_validation_type_2`, `ssl_validation_value_2`, `dcv_delegation_name`, `dcv_delegation_type`, `dcv_delegation_value`, `dns_last_resolved_at`, `dns_resolved_target`, `validation_strategy`, `certificate_last_active_at`, `renewal_issue_started_at`, `renewal_notification_sent_at`, `certificate_expires_at` FROM `site_domains`;--> statement-breakpoint
INSERT INTO `__new_reviews` (`id`, `organization_id`, `site_id`, `location_id`, `customer_id`, `booking_id`, `booking_type`, `review_request_id`, `user_id`, `menu_item_slug`, `author_name`, `reviewer_photo_url`, `rating`, `title`, `content`, `google_review_id`, `owner_reply`, `owner_reply_at`, `photo_urls`, `helpful_count`, `status`, `source`, `entered_by_user_id`, `collection_method`, `original_review_date`, `original_reference`, `publication_authorized`, `ip_hash`, `user_agent`, `created_at`, `updated_at`) SELECT `id`, `organization_id`, `site_id`, `location_id`, `customer_id`, `booking_id`, `booking_type`, `review_request_id`, `user_id`, `menu_item_slug`, `author_name`, `reviewer_photo_url`, `rating`, `title`, `content`, `google_review_id`, `owner_reply`, `owner_reply_at`, `photo_urls`, `helpful_count`, `status`, `source`, `entered_by_user_id`, `collection_method`, `original_review_date`, `original_reference`, `publication_authorized`, `ip_hash`, `user_agent`, `created_at`, `updated_at` FROM `reviews`;--> statement-breakpoint
INSERT INTO `__new_posts` (`id`, `organization_id`, `site_id`, `location_id`, `google_post_id`, `slug`, `post_type`, `title`, `body`, `seo_title`, `seo_description`, `cta_type`, `cta_url`, `event_title`, `event_start`, `event_end`, `offer_coupon`, `offer_terms`, `status`, `scheduled_for`, `published_at`, `source`, `created_by`, `created_at`, `updated_at`) SELECT `id`, `organization_id`, `site_id`, `location_id`, `google_post_id`, `slug`, `post_type`, `title`, `body`, `seo_title`, `seo_description`, `cta_type`, `cta_url`, `event_title`, `event_start`, `event_end`, `offer_coupon`, `offer_terms`, `status`, `scheduled_for`, `published_at`, `source`, `created_by`, `created_at`, `updated_at` FROM `posts`;--> statement-breakpoint
INSERT INTO `__new_notifications` (`id`, `organization_id`, `site_id`, `location_id`, `scope`, `event_type`, `severity`, `actor_user_id`, `target_user_id`, `deep_link`, `message`, `channel`, `template`, `recipient`, `title`, `payload`, `status`, `provider_message_id`, `error`, `read_at`, `sent_at`, `created_at`, `related_submission_type`, `related_submission_id`, `whatsapp_delivery_status`, `whatsapp_delivery_error`) SELECT `id`, `organization_id`, `site_id`, `location_id`, `scope`, `event_type`, `severity`, `actor_user_id`, `target_user_id`, `deep_link`, `message`, `channel`, `template`, `recipient`, `title`, `payload`, `status`, `provider_message_id`, `error`, `read_at`, `sent_at`, `created_at`, `related_submission_type`, `related_submission_id`, `whatsapp_delivery_status`, `whatsapp_delivery_error` FROM `notifications`;--> statement-breakpoint
INSERT INTO `__new_menus` (`id`, `organization_id`, `site_id`, `location_id`, `name`, `description`, `section_order`, `created_at`, `updated_at`, `created_by`, `updated_by`, `seo_title`, `seo_description`, `canonical_url`, `robots`, `is_visible`) SELECT `id`, `organization_id`, `site_id`, `location_id`, `name`, `description`, `section_order`, `created_at`, `updated_at`, `created_by`, `updated_by`, `seo_title`, `seo_description`, `canonical_url`, `robots`, `is_visible` FROM `menus`;--> statement-breakpoint
INSERT INTO `__new_guest_thread_deliveries` (`id`, `thread_id`, `entry_id`, `channel`, `provider`, `idempotency_key`, `status`, `attempt_count`, `last_error`, `provider_message_id`, `to_address`, `created_at`, `updated_at`, `from_name`, `subject`, `text_body`, `reply_to`, `locale`, `template_version`, `source_snapshot_json`, `payload_hash`, `provider_idempotency_key`, `processing_lease_until`) SELECT `id`, `thread_id`, `entry_id`, `channel`, `provider`, `idempotency_key`, `status`, `attempt_count`, `last_error`, `provider_message_id`, `to_address`, `created_at`, `updated_at`, `from_name`, `subject`, `text_body`, `reply_to`, `locale`, `template_version`, `source_snapshot_json`, `payload_hash`, `provider_idempotency_key`, `processing_lease_until` FROM `guest_thread_deliveries`;--> statement-breakpoint
INSERT INTO `__new_experiences` (`id`, `organization_id`, `site_id`, `location_id`, `title`, `slug`, `tagline`, `body`, `price`, `price_amount`, `compare_at_price_amount`, `sale_starts_at`, `sale_ends_at`, `duration_minutes`, `max_capacity`, `time_slots`, `recurring_slots`, `available_note`, `status`, `sort_order`, `featured`, `featured_sort_order`, `seo_title`, `seo_description`, `canonical_url`, `robots`, `created_at`, `updated_at`, `created_by`, `highlights`, `included_items`, `what_to_bring`, `meeting_point`, `cancellation_policy`, `source`) SELECT `id`, `organization_id`, `site_id`, `location_id`, `title`, `slug`, `tagline`, `body`, `price`, `price_amount`, `compare_at_price_amount`, `sale_starts_at`, `sale_ends_at`, `duration_minutes`, `max_capacity`, `time_slots`, `recurring_slots`, `available_note`, `status`, `sort_order`, `featured`, `featured_sort_order`, `seo_title`, `seo_description`, `canonical_url`, `robots`, `created_at`, `updated_at`, `created_by`, `highlights`, `included_items`, `what_to_bring`, `meeting_point`, `cancellation_policy`, `source` FROM `experiences`;--> statement-breakpoint
INSERT INTO `__new_chowbot_conversations` (`id`, `organization_id`, `site_id`, `user_id`, `title`, `active_channel`, `status`, `selected_location_id`, `created_at`, `updated_at`) SELECT `id`, `organization_id`, `site_id`, `user_id`, `title`, `active_channel`, `status`, `selected_location_id`, `created_at`, `updated_at` FROM `chowbot_conversations`;--> statement-breakpoint
INSERT INTO `__new_blog_posts` (`id`, `organization_id`, `site_id`, `title`, `slug`, `excerpt`, `category`, `tags_json`, `nav_section`, `nav_title`, `nav_order`, `nav_section_order`, `hide_from_nav`, `featured_order`, `status`, `visibility`, `author_id`, `published_at`, `first_published_at`, `scheduled_for`, `slug_manually_overridden`, `created_at`, `updated_at`, `seo_title`, `seo_description`, `seo_keywords`, `canonical_url`, `robots`) SELECT `id`, `organization_id`, `site_id`, `title`, `slug`, `excerpt`, `category`, `tags_json`, `nav_section`, `nav_title`, `nav_order`, `nav_section_order`, `hide_from_nav`, `featured_order`, `status`, `visibility`, `author_id`, `published_at`, `first_published_at`, `scheduled_for`, `slug_manually_overridden`, `created_at`, `updated_at`, `seo_title`, `seo_description`, `seo_keywords`, `canonical_url`, `robots` FROM `blog_posts`;--> statement-breakpoint
INSERT INTO `__new_work_requests` (`id`, `organization_id`, `site_id`, `type`, `title`, `description`, `status`, `priority`, `source`, `notes`, `assigned_to`, `completed_at`, `created_at`, `updated_at`) SELECT `id`, `organization_id`, `site_id`, `type`, `title`, `description`, `status`, `priority`, `source`, `notes`, `assigned_to`, `completed_at`, `created_at`, `updated_at` FROM `work_requests`;--> statement-breakpoint
INSERT INTO `__new_usage_events` (`id`, `organization_id`, `site_id`, `resource`, `source`, `provider`, `channel`, `quantity`, `unit`, `metadata_json`, `idempotency_key`, `created_at`, `session_id`) SELECT `id`, `organization_id`, `site_id`, `resource`, `source`, `provider`, `channel`, `quantity`, `unit`, `metadata_json`, `idempotency_key`, `created_at`, `session_id` FROM `usage_events`;--> statement-breakpoint
INSERT INTO `__new_tenant_redirects` (`id`, `organization_id`, `site_id`, `locale`, `owner_variant_id`, `from_path`, `to_path`, `status_code`, `behavior`, `reason`, `source`, `created_at`, `updated_at`) SELECT `id`, `organization_id`, `site_id`, `locale`, `owner_variant_id`, `from_path`, `to_path`, `status_code`, `behavior`, `reason`, `source`, `created_at`, `updated_at` FROM `tenant_redirects`;--> statement-breakpoint
INSERT INTO `__new_tenant_pages` (`id`, `organization_id`, `site_id`, `title`, `slug`, `page_type`, `recipe`, `summary`, `seo_title`, `seo_description`, `canonical_url`, `robots`, `sort_order`, `source`, `source_ref`, `created_at`, `updated_at`, `updated_by`) SELECT `id`, `organization_id`, `site_id`, `title`, `slug`, `page_type`, `recipe`, `summary`, `seo_title`, `seo_description`, `canonical_url`, `robots`, `sort_order`, `source`, `source_ref`, `created_at`, `updated_at`, `updated_by` FROM `tenant_pages`;--> statement-breakpoint
INSERT INTO `__new_tenant_page_variants` (`id`, `organization_id`, `site_id`, `page_id`, `locale`, `document_id`, `path`, `title`, `summary`, `seo_title`, `seo_description`, `canonical_url`, `robots`, `created_at`, `updated_at`, `updated_by`) SELECT `id`, `organization_id`, `site_id`, `page_id`, `locale`, `document_id`, `path`, `title`, `summary`, `seo_title`, `seo_description`, `canonical_url`, `robots`, `created_at`, `updated_at`, `updated_by` FROM `tenant_page_variants`;--> statement-breakpoint
INSERT INTO `__new_tenant_compliance` (`id`, `organization_id`, `site_id`, `entity_name`, `dba_name`, `entity_type`, `nonprofit_status`, `registration_number`, `service_area`, `service_area_type`, `disclaimer`, `footer_disclaimer`, `privacy_page_id`, `terms_page_id`, `notice_page_id`, `document_asset_ids`, `founder_name`, `founding_date`, `same_as`, `contact_points`, `address_visibility`, `metadata_json`, `created_at`, `updated_at`, `updated_by`) SELECT `id`, `organization_id`, `site_id`, `entity_name`, `dba_name`, `entity_type`, `nonprofit_status`, `registration_number`, `service_area`, `service_area_type`, `disclaimer`, `footer_disclaimer`, `privacy_page_id`, `terms_page_id`, `notice_page_id`, `document_asset_ids`, `founder_name`, `founding_date`, `same_as`, `contact_points`, `address_visibility`, `metadata_json`, `created_at`, `updated_at`, `updated_by` FROM `tenant_compliance`;--> statement-breakpoint
INSERT INTO `__new_stripe_ga4_subscription_intents` (`id`, `organization_id`, `user_id`, `stripe_subscription_id`, `action`, `site_id`, `client_id`, `session_id`, `session_captured_at`, `previous_price_id`, `new_price_id`, `effective_timing`, `source`, `status`, `lifecycle_sent_at`, `consumed_at`, `consumed_event_id`, `expires_at`, `created_at`, `updated_at`) SELECT `id`, `organization_id`, `user_id`, `stripe_subscription_id`, `action`, `site_id`, `client_id`, `session_id`, `session_captured_at`, `previous_price_id`, `new_price_id`, `effective_timing`, `source`, `status`, `lifecycle_sent_at`, `consumed_at`, `consumed_event_id`, `expires_at`, `created_at`, `updated_at` FROM `stripe_ga4_subscription_intents`;--> statement-breakpoint
INSERT INTO `__new_site_transfer_requests` (`id`, `site_id`, `from_organization_id`, `to_email`, `token`, `status`, `initiated_by_user_id`, `accepted_by_user_id`, `claiming_user_id`, `claiming_organization_id`, `message`, `invited_plan`, `invited_coupon`, `invited_domain`, `requires_payment`, `stripe_checkout_session_id`, `payment_completed_at`, `created_at`, `completed_at`, `last_reminder_at`, `reminder_count`, `custom_domains_snapshot`, `custom_domains_removed_at`, `invited_interval`) SELECT `id`, `site_id`, `from_organization_id`, `to_email`, `token`, `status`, `initiated_by_user_id`, `accepted_by_user_id`, `claiming_user_id`, `claiming_organization_id`, `message`, `invited_plan`, `invited_coupon`, `invited_domain`, `requires_payment`, `stripe_checkout_session_id`, `payment_completed_at`, `created_at`, `completed_at`, `last_reminder_at`, `reminder_count`, `custom_domains_snapshot`, `custom_domains_removed_at`, `invited_interval` FROM `site_transfer_requests`;--> statement-breakpoint
INSERT INTO `__new_site_theme_tokens` (`id`, `organization_id`, `site_id`, `template_slug`, `tokens_json`, `status`, `created_at`, `updated_at`, `updated_by`) SELECT `id`, `organization_id`, `site_id`, `template_slug`, `tokens_json`, `status`, `created_at`, `updated_at`, `updated_by` FROM `site_theme_tokens`;--> statement-breakpoint
INSERT INTO `__new_site_pageview_events` (`id`, `site_id`, `location_id`, `page_path`, `referrer`, `user_agent`, `ip_hash`, `session_id`, `duration_seconds`, `created_at`, `visitor_id`, `country`, `region`, `city`, `page_id`, `page_type`, `recipe`, `locale`, `revision_id`) SELECT `id`, `site_id`, `location_id`, `page_path`, `referrer`, `user_agent`, `ip_hash`, `session_id`, `duration_seconds`, `created_at`, `visitor_id`, `country`, `region`, `city`, `page_id`, `page_type`, `recipe`, `locale`, `revision_id` FROM `site_pageview_events`;--> statement-breakpoint
INSERT INTO `__new_site_locales` (`id`, `organization_id`, `site_id`, `locale`, `label`, `is_source`, `status`, `created_at`, `updated_at`) SELECT `id`, `organization_id`, `site_id`, `locale`, `label`, `is_source`, `status`, `created_at`, `updated_at` FROM `site_locales`;--> statement-breakpoint
INSERT INTO `__new_site_link_pages` (`id`, `organization_id`, `site_id`, `path`, `title`, `robots`, `seo_title`, `seo_description`, `created_at`, `updated_at`, `updated_by`) SELECT `id`, `organization_id`, `site_id`, `path`, `title`, `robots`, `seo_title`, `seo_description`, `created_at`, `updated_at`, `updated_by` FROM `site_link_pages`;--> statement-breakpoint
INSERT INTO `__new_site_link_items` (`id`, `organization_id`, `site_id`, `link_page_id`, `label`, `destination`, `sort_order`, `status`, `created_at`, `updated_at`, `updated_by`) SELECT `id`, `organization_id`, `site_id`, `link_page_id`, `label`, `destination`, `sort_order`, `status`, `created_at`, `updated_at`, `updated_by` FROM `site_link_items`;--> statement-breakpoint
INSERT INTO `__new_site_events` (`id`, `organization_id`, `site_id`, `location_id`, `actor_id`, `event_type`, `entity_type`, `entity_id`, `metadata`, `created_at`) SELECT `id`, `organization_id`, `site_id`, `location_id`, `actor_id`, `event_type`, `entity_type`, `entity_id`, `metadata`, `created_at` FROM `site_events`;--> statement-breakpoint
INSERT INTO `__new_site_entitlements` (`id`, `site_id`, `organization_id`, `key`, `value`, `source`, `created_at`, `updated_at`) SELECT `id`, `site_id`, `organization_id`, `key`, `value`, `source`, `created_at`, `updated_at` FROM `site_entitlements`;--> statement-breakpoint
INSERT INTO `__new_site_domain_events` (`id`, `organization_id`, `site_id`, `domain_id`, `event_type`, `actor_type`, `actor_id`, `message`, `before_state`, `after_state`, `metadata`, `created_at`) SELECT `id`, `organization_id`, `site_id`, `domain_id`, `event_type`, `actor_type`, `actor_id`, `message`, `before_state`, `after_state`, `metadata`, `created_at` FROM `site_domain_events`;--> statement-breakpoint
INSERT INTO `__new_site_conversion_events` (`id`, `organization_id`, `site_id`, `event_name`, `page_type`, `page_path`, `page_location`, `cta_destination`, `tenant`, `metadata_json`, `ip_hash`, `user_agent`, `created_at`) SELECT `id`, `organization_id`, `site_id`, `event_name`, `page_type`, `page_path`, `page_location`, `cta_destination`, `tenant`, `metadata_json`, `ip_hash`, `user_agent`, `created_at` FROM `site_conversion_events`;--> statement-breakpoint
INSERT INTO `__new_site_consultation_settings` (`id`, `organization_id`, `site_id`, `mode`, `cta_label`, `external_url`, `schedule_path`, `confirmation_path`, `tracking_enabled`, `metadata_json`, `created_at`, `updated_at`, `updated_by`) SELECT `id`, `organization_id`, `site_id`, `mode`, `cta_label`, `external_url`, `schedule_path`, `confirmation_path`, `tracking_enabled`, `metadata_json`, `created_at`, `updated_at`, `updated_by` FROM `site_consultation_settings`;--> statement-breakpoint
INSERT INTO `__new_site_config` (`organization_id`, `site_id`, `key`, `value`, `updated_at`) SELECT `organization_id`, `site_id`, `key`, `value`, `updated_at` FROM `site_config`;--> statement-breakpoint
INSERT INTO `__new_site_billing` (`id`, `site_id`, `organization_id`, `stripe_subscription_id`, `stripe_subscription_item_id`, `plan`, `status`, `current_period_end`, `cancel_at_period_end`, `updated_at`, `stripe_customer_id`, `payment_method`, `payment_status`, `paid_through`, `last_paid_invoice_id`, `last_payment_event_created`, `last_payment_event_id`, `past_due_since`) SELECT `id`, `site_id`, `organization_id`, `stripe_subscription_id`, `stripe_subscription_item_id`, `plan`, `status`, `current_period_end`, `cancel_at_period_end`, `updated_at`, `stripe_customer_id`, `payment_method`, `payment_status`, `paid_through`, `last_paid_invoice_id`, `last_payment_event_created`, `last_payment_event_id`, `past_due_since` FROM `site_billing`;--> statement-breakpoint
INSERT INTO `__new_site_analytics_daily` (`id`, `site_id`, `date`, `page_views`, `unique_sessions`, `avg_session_duration`, `top_pages`, `created_at`, `updated_at`, `unique_visitors`, `pages_per_session`, `returning_visitors`) SELECT `id`, `site_id`, `date`, `page_views`, `unique_sessions`, `avg_session_duration`, `top_pages`, `created_at`, `updated_at`, `unique_visitors`, `pages_per_session`, `returning_visitors` FROM `site_analytics_daily`;--> statement-breakpoint
INSERT INTO `__new_reservation_submissions` (`id`, `organization_id`, `site_id`, `customer_id`, `location_id`, `name`, `email`, `phone`, `date`, `time`, `guests`, `requests`, `status`, `ip_hash`, `cancellation_token_hash`, `cancellation_token_expires_at`, `cancellation_token_used_at`, `completed_at`, `completion_source`, `review_request_sent_at`, `review_reminder_sent_at`, `review_submitted_at`, `review_id`, `created_at`, `updated_at`) SELECT `id`, `organization_id`, `site_id`, `customer_id`, `location_id`, `name`, `email`, `phone`, `date`, `time`, `guests`, `requests`, `status`, `ip_hash`, `cancellation_token_hash`, `cancellation_token_expires_at`, `cancellation_token_used_at`, `completed_at`, `completion_source`, `review_request_sent_at`, `review_reminder_sent_at`, `review_submitted_at`, `review_id`, `created_at`, `updated_at` FROM `reservation_submissions`;--> statement-breakpoint
INSERT INTO `__new_reservation_slot_overrides` (`id`, `location_id`, `organization_id`, `site_id`, `override_date`, `time_slot`, `status`, `capacity_override`, `note`, `created_at`, `updated_at`, `created_by`) SELECT `id`, `location_id`, `organization_id`, `site_id`, `override_date`, `time_slot`, `status`, `capacity_override`, `note`, `created_at`, `updated_at`, `created_by` FROM `reservation_slot_overrides`;--> statement-breakpoint
INSERT INTO `__new_public_resource_cache_invalidations` (`id`, `site_id`, `reason`, `status`, `attempt_count`, `claimed_at`, `processed_at`, `last_error`, `created_at`) SELECT `id`, `site_id`, `reason`, `status`, `attempt_count`, `claimed_at`, `processed_at`, `last_error`, `created_at` FROM `public_resource_cache_invalidations`;--> statement-breakpoint
INSERT INTO `__new_post_channel_jobs` (`id`, `post_id`, `organization_id`, `channel`, `status`, `provider_post_id`, `error`, `published_at`, `created_at`) SELECT `id`, `post_id`, `organization_id`, `channel`, `status`, `provider_post_id`, `error`, `published_at`, `created_at` FROM `post_channel_jobs`;--> statement-breakpoint
INSERT INTO `__new_onboarding_drafts` (`id`, `user_id`, `organization_id`, `name`, `vertical`, `subdomain_candidate`, `source_type`, `status`, `payload_json`, `committed_site_id`, `committed_at`, `created_at`, `updated_at`) SELECT `id`, `user_id`, `organization_id`, `name`, `vertical`, `subdomain_candidate`, `source_type`, `status`, `payload_json`, `committed_site_id`, `committed_at`, `created_at`, `updated_at` FROM `onboarding_drafts`;--> statement-breakpoint
INSERT INTO `__new_offerings` (`id`, `organization_id`, `site_id`, `location_id`, `name`, `slug`, `label`, `summary`, `short_description`, `body`, `features`, `faqs`, `cta_label`, `cta_url`, `schema_type`, `seo_title`, `seo_description`, `canonical_path`, `sort_order`, `featured`, `source`, `source_ref`, `created_at`, `updated_at`, `updated_by`) SELECT `id`, `organization_id`, `site_id`, `location_id`, `name`, `slug`, `label`, `summary`, `short_description`, `body`, `features`, `faqs`, `cta_label`, `cta_url`, `schema_type`, `seo_title`, `seo_description`, `canonical_path`, `sort_order`, `featured`, `source`, `source_ref`, `created_at`, `updated_at`, `updated_by` FROM `offerings`;--> statement-breakpoint
INSERT INTO `__new_notification_reads` (`notification_id`, `user_id`, `read_at`) SELECT `notification_id`, `user_id`, `read_at` FROM `notification_reads`;--> statement-breakpoint
INSERT INTO `__new_notification_events` (`id`, `scope_type`, `organization_id`, `site_id`, `submission_type`, `submission_id`, `event_type`, `channels`, `recipients`, `payload`, `status`, `error`, `created_at`) SELECT `id`, `scope_type`, `organization_id`, `site_id`, `submission_type`, `submission_id`, `event_type`, `channels`, `recipients`, `payload`, `status`, `error`, `created_at` FROM `notification_events`;--> statement-breakpoint
INSERT INTO `__new_notification_deliveries` (`id`, `notification_id`, `channel`, `status`, `provider_message_id`, `error`, `sent_at`, `created_at`) SELECT `id`, `notification_id`, `channel`, `status`, `provider_message_id`, `error`, `sent_at`, `created_at` FROM `notification_deliveries`;--> statement-breakpoint
INSERT INTO `__new_menu_items` (`id`, `menu_id`, `section`, `name`, `slug`, `description`, `price_amount`, `compare_at_price_amount`, `sale_starts_at`, `sale_ends_at`, `available`, `featured`, `featured_sort_order`, `sort_order`, `allergens`, `ingredients`, `dietary_notes`, `preparation`, `serving_note`, `source`, `created_at`, `updated_at`, `created_by`, `updated_by`, `seo_title`, `seo_description`, `canonical_url`, `robots`) SELECT `id`, `menu_id`, `section`, `name`, `slug`, `description`, `price_amount`, `compare_at_price_amount`, `sale_starts_at`, `sale_ends_at`, `available`, `featured`, `featured_sort_order`, `sort_order`, `allergens`, `ingredients`, `dietary_notes`, `preparation`, `serving_note`, `source`, `created_at`, `updated_at`, `created_by`, `updated_by`, `seo_title`, `seo_description`, `canonical_url`, `robots` FROM `menu_items`;--> statement-breakpoint
INSERT INTO `__new_media_assets` (`id`, `organization_id`, `site_id`, `kind`, `provider`, `source`, `cloudflare_image_id`, `r2_key`, `google_media_name`, `public_url`, `thumbnail_url`, `mime_type`, `file_name`, `file_size`, `width`, `height`, `duration`, `alt_text`, `category`, `status`, `created_by_user_id`, `created_at`, `updated_at`) SELECT `id`, `organization_id`, `site_id`, `kind`, `provider`, `source`, `cloudflare_image_id`, `r2_key`, `google_media_name`, `public_url`, `thumbnail_url`, `mime_type`, `file_name`, `file_size`, `width`, `height`, `duration`, `alt_text`, `category`, `status`, `created_by_user_id`, `created_at`, `updated_at` FROM `media_assets`;--> statement-breakpoint
INSERT INTO `__new_mcp_workspace_preferences` (`user_id`, `organization_id`, `site_id`, `location_id`, `created_at`, `updated_at`) SELECT `user_id`, `organization_id`, `site_id`, `location_id`, `created_at`, `updated_at` FROM `mcp_workspace_preferences`;--> statement-breakpoint
INSERT INTO `__new_mcp_tool_call_events` (`id`, `organization_id`, `site_id`, `location_id`, `user_id`, `mcp_surface`, `request_id`, `method`, `tool_name`, `tool_domain`, `is_mutating`, `arguments_summary_json`, `result_summary_json`, `status`, `error_code`, `error_message`, `duration_ms`, `created_at`, `http_status`, `jsonrpc_error_code`, `jsonrpc_error_message`, `protocol_version`, `session_id_hash`, `oauth_client_id_hash`, `user_agent`, `cf_ray_id`, `catalog_fingerprint`, `unknown_tool_name`) SELECT `id`, `organization_id`, `site_id`, `location_id`, `user_id`, `mcp_surface`, `request_id`, `method`, `tool_name`, `tool_domain`, `is_mutating`, `arguments_summary_json`, `result_summary_json`, `status`, `error_code`, `error_message`, `duration_ms`, `created_at`, `http_status`, `jsonrpc_error_code`, `jsonrpc_error_message`, `protocol_version`, `session_id_hash`, `oauth_client_id_hash`, `user_agent`, `cf_ray_id`, `catalog_fingerprint`, `unknown_tool_name` FROM `mcp_tool_call_events`;--> statement-breakpoint
INSERT INTO `__new_location_qa` (`id`, `organization_id`, `site_id`, `location_id`, `page_path`, `question`, `question_author`, `question_date`, `answer`, `answer_author`, `answer_date`, `is_owner_answer`, `upvote_count`, `source`, `status`, `sort_order`, `created_at`, `updated_at`) SELECT `id`, `organization_id`, `site_id`, `location_id`, `page_path`, `question`, `question_author`, `question_date`, `answer`, `answer_author`, `answer_date`, `is_owner_answer`, `upvote_count`, `source`, `status`, `sort_order`, `created_at`, `updated_at` FROM `location_qa`;--> statement-breakpoint
INSERT INTO `__new_guest_thread_sequence_counters` (`thread_id`, `next_sequence`, `updated_at`) SELECT `thread_id`, `next_sequence`, `updated_at` FROM `guest_thread_sequence_counters`;--> statement-breakpoint
INSERT INTO `__new_guest_thread_outbox` (`id`, `thread_id`, `delivery_id`, `event_type`, `status`, `attempt_count`, `next_attempt_at`, `locked_at`, `last_error`, `created_at`, `updated_at`) SELECT `id`, `thread_id`, `delivery_id`, `event_type`, `status`, `attempt_count`, `next_attempt_at`, `locked_at`, `last_error`, `created_at`, `updated_at` FROM `guest_thread_outbox`;--> statement-breakpoint
INSERT INTO `__new_guest_thread_member_state` (`thread_id`, `member_id`, `last_read_entry_id`, `created_at`, `updated_at`, `last_read_sequence`) SELECT `thread_id`, `member_id`, `last_read_entry_id`, `created_at`, `updated_at`, `last_read_sequence` FROM `guest_thread_member_state`;--> statement-breakpoint
INSERT INTO `__new_guest_thread_commands` (`id`, `thread_id`, `organization_id`, `site_id`, `action`, `idempotency_key`, `actor_kind`, `actor_user_id`, `actor_member_id`, `request_hash`, `status`, `result_json`, `created_at`, `completed_at`) SELECT `id`, `thread_id`, `organization_id`, `site_id`, `action`, `idempotency_key`, `actor_kind`, `actor_user_id`, `actor_member_id`, `request_hash`, `status`, `result_json`, `created_at`, `completed_at` FROM `guest_thread_commands`;--> statement-breakpoint
INSERT INTO `__new_google_place_snapshots` (`id`, `site_id`, `location_id`, `place_id`, `source_url`, `snapshot_json`, `fetched_at`) SELECT `id`, `site_id`, `location_id`, `place_id`, `source_url`, `snapshot_json`, `fetched_at` FROM `google_place_snapshots`;--> statement-breakpoint
INSERT INTO `__new_google_analytics_connections` (`id`, `organization_id`, `site_id`, `connected_by_user_id`, `provider_account_email`, `encrypted_access_token`, `encrypted_refresh_token`, `scopes`, `ga4_property_id`, `ga4_property_name`, `ga4_measurement_id`, `search_console_site_url`, `status`, `expires_at`, `created_at`, `updated_at`) SELECT `id`, `organization_id`, `site_id`, `connected_by_user_id`, `provider_account_email`, `encrypted_access_token`, `encrypted_refresh_token`, `scopes`, `ga4_property_id`, `ga4_property_name`, `ga4_measurement_id`, `search_console_site_url`, `status`, `expires_at`, `created_at`, `updated_at` FROM `google_analytics_connections`;--> statement-breakpoint
INSERT INTO `__new_experience_slot_overrides` (`id`, `experience_id`, `organization_id`, `site_id`, `override_date`, `time_slot`, `status`, `capacity_override`, `note`, `created_at`, `updated_at`, `created_by`) SELECT `id`, `experience_id`, `organization_id`, `site_id`, `override_date`, `time_slot`, `status`, `capacity_override`, `note`, `created_at`, `updated_at`, `created_by` FROM `experience_slot_overrides`;--> statement-breakpoint
INSERT INTO `__new_experience_bookings` (`id`, `experience_id`, `organization_id`, `site_id`, `customer_id`, `location_id`, `guest_name`, `guest_email`, `guest_phone`, `party_size`, `booking_date`, `time_slot`, `status`, `notes`, `ip_hash`, `cancellation_token_hash`, `cancellation_token_expires_at`, `cancellation_token_used_at`, `completed_at`, `completion_source`, `review_request_sent_at`, `review_reminder_sent_at`, `review_submitted_at`, `review_id`, `created_at`, `updated_at`) SELECT `id`, `experience_id`, `organization_id`, `site_id`, `customer_id`, `location_id`, `guest_name`, `guest_email`, `guest_phone`, `party_size`, `booking_date`, `time_slot`, `status`, `notes`, `ip_hash`, `cancellation_token_hash`, `cancellation_token_expires_at`, `cancellation_token_used_at`, `completed_at`, `completion_source`, `review_request_sent_at`, `review_reminder_sent_at`, `review_submitted_at`, `review_id`, `created_at`, `updated_at` FROM `experience_bookings`;--> statement-breakpoint
INSERT INTO `__new_domain_reconciliation_jobs` (`id`, `domain_id`, `status`, `run_after`, `attempts`, `last_error`, `created_at`, `updated_at`) SELECT `id`, `domain_id`, `status`, `run_after`, `attempts`, `last_error`, `created_at`, `updated_at` FROM `domain_reconciliation_jobs`;--> statement-breakpoint
INSERT INTO `__new_dashboard_preferences` (`id`, `user_id`, `organization_id`, `selected_location_id`, `created_at`, `updated_at`) SELECT `id`, `user_id`, `organization_id`, `selected_location_id`, `created_at`, `updated_at` FROM `dashboard_preferences`;--> statement-breakpoint
INSERT INTO `__new_customer_claims` (`id`, `customer_id`, `user_id`, `organization_id`, `site_id`, `email_at_claim`, `status`, `token_hash`, `token_expires_at`, `verified_at`, `created_at`, `updated_at`) SELECT `id`, `customer_id`, `user_id`, `organization_id`, `site_id`, `email_at_claim`, `status`, `token_hash`, `token_expires_at`, `verified_at`, `created_at`, `updated_at` FROM `customer_claims`;--> statement-breakpoint
INSERT INTO `__new_contact_submissions` (`id`, `organization_id`, `site_id`, `name`, `email`, `message`, `status`, `ip_hash`, `created_at`, `subject`, `experience_id`, `consent_at`, `location_id`) SELECT `id`, `organization_id`, `site_id`, `name`, `email`, `message`, `status`, `ip_hash`, `created_at`, `subject`, `experience_id`, `consent_at`, `location_id` FROM `contact_submissions`;--> statement-breakpoint
INSERT INTO `__new_client_import_artifacts` (`id`, `organization_id`, `site_id`, `slug`, `artifact_type`, `path`, `hash`, `status`, `summary_json`, `created_at`, `updated_at`) SELECT `id`, `organization_id`, `site_id`, `slug`, `artifact_type`, `path`, `hash`, `status`, `summary_json`, `created_at`, `updated_at` FROM `client_import_artifacts`;--> statement-breakpoint
INSERT INTO `__new_chowbot_messages` (`id`, `conversation_id`, `organization_id`, `site_id`, `user_id`, `role`, `channel`, `content`, `media`, `meta_message_id`, `tool_calls`, `status`, `error`, `created_at`) SELECT `id`, `conversation_id`, `organization_id`, `site_id`, `user_id`, `role`, `channel`, `content`, `media`, `meta_message_id`, `tool_calls`, `status`, `error`, `created_at` FROM `chowbot_messages`;--> statement-breakpoint
INSERT INTO `__new_chowbot_channel_state` (`user_id`, `channel`, `selected_site_id`, `active_conversation_id`, `pending_media`, `pending_confirmation`, `last_inbound_id`, `updated_at`) SELECT `user_id`, `channel`, `selected_site_id`, `active_conversation_id`, `pending_media`, `pending_confirmation`, `last_inbound_id`, `updated_at` FROM `chowbot_channel_state`;--> statement-breakpoint
INSERT INTO `__new_canary_runs` (`id`, `run_type`, `environment`, `status`, `organization_id`, `site_id`, `details_json`, `created_at`) SELECT `id`, `run_type`, `environment`, `status`, `organization_id`, `site_id`, `details_json`, `created_at` FROM `canary_runs`;--> statement-breakpoint
INSERT INTO `__new_booking_policies` (`id`, `organization_id`, `site_id`, `policy_type`, `scope_type`, `location_id`, `experience_id`, `booking_window_days`, `advance_notice_minutes`, `free_cancellation_until_minutes`, `late_arrival_grace_minutes`, `host_confirmation_sla_minutes`, `reschedule_allowed`, `reschedule_cutoff_minutes`, `deposit_required`, `deposit_trigger_party_size`, `special_requests_allowed`, `weather_policy`, `minimum_guest_age`, `accessibility_contact_required`, `additional_notes_html`, `created_at`, `updated_at`) SELECT `id`, `organization_id`, `site_id`, `policy_type`, `scope_type`, `location_id`, `experience_id`, `booking_window_days`, `advance_notice_minutes`, `free_cancellation_until_minutes`, `late_arrival_grace_minutes`, `host_confirmation_sla_minutes`, `reschedule_allowed`, `reschedule_cutoff_minutes`, `deposit_required`, `deposit_trigger_party_size`, `special_requests_allowed`, `weather_policy`, `minimum_guest_age`, `accessibility_contact_required`, `additional_notes_html`, `created_at`, `updated_at` FROM `booking_policies`;--> statement-breakpoint
INSERT INTO `__new_blog_post_redirects` (`id`, `post_id`, `site_id`, `old_slug`, `created_at`) SELECT `id`, `post_id`, `site_id`, `old_slug`, `created_at` FROM `blog_post_redirects`;--> statement-breakpoint
INSERT INTO `__new_ai_usage_log` (`id`, `organization_id`, `site_id`, `action`, `model`, `input_tokens`, `output_tokens`, `credits_charged`, `cf_gateway_log_id`, `created_at`) SELECT `id`, `organization_id`, `site_id`, `action`, `model`, `input_tokens`, `output_tokens`, `credits_charged`, `cf_gateway_log_id`, `created_at` FROM `ai_usage_log`;--> statement-breakpoint
DROP TABLE `ai_usage_log`;--> statement-breakpoint
DROP TABLE `blog_post_redirects`;--> statement-breakpoint
DROP TABLE `booking_policies`;--> statement-breakpoint
DROP TABLE `canary_runs`;--> statement-breakpoint
DROP TABLE `chowbot_channel_state`;--> statement-breakpoint
DROP TABLE `chowbot_messages`;--> statement-breakpoint
DROP TABLE `client_import_artifacts`;--> statement-breakpoint
DROP TABLE `contact_submissions`;--> statement-breakpoint
DROP TABLE `customer_claims`;--> statement-breakpoint
DROP TABLE `dashboard_preferences`;--> statement-breakpoint
DROP TABLE `domain_reconciliation_jobs`;--> statement-breakpoint
DROP TABLE `experience_bookings`;--> statement-breakpoint
DROP TABLE `experience_slot_overrides`;--> statement-breakpoint
DROP TABLE `google_analytics_connections`;--> statement-breakpoint
DROP TABLE `google_place_snapshots`;--> statement-breakpoint
DROP TABLE `guest_thread_commands`;--> statement-breakpoint
DROP TABLE `guest_thread_member_state`;--> statement-breakpoint
DROP TABLE `guest_thread_outbox`;--> statement-breakpoint
DROP TABLE `guest_thread_sequence_counters`;--> statement-breakpoint
DROP TABLE `location_qa`;--> statement-breakpoint
DROP TABLE `mcp_tool_call_events`;--> statement-breakpoint
DROP TABLE `mcp_workspace_preferences`;--> statement-breakpoint
DROP TABLE `media_assets`;--> statement-breakpoint
DROP TABLE `menu_items`;--> statement-breakpoint
DROP TABLE `notification_deliveries`;--> statement-breakpoint
DROP TABLE `notification_events`;--> statement-breakpoint
DROP TABLE `notification_reads`;--> statement-breakpoint
DROP TABLE `offerings`;--> statement-breakpoint
DROP TABLE `onboarding_drafts`;--> statement-breakpoint
DROP TABLE `post_channel_jobs`;--> statement-breakpoint
DROP TABLE `public_resource_cache_invalidations`;--> statement-breakpoint
DROP TABLE `reservation_slot_overrides`;--> statement-breakpoint
DROP TABLE `reservation_submissions`;--> statement-breakpoint
DROP TABLE `site_analytics_daily`;--> statement-breakpoint
DROP TABLE `site_billing`;--> statement-breakpoint
DROP TABLE `site_config`;--> statement-breakpoint
DROP TABLE `site_consultation_settings`;--> statement-breakpoint
DROP TABLE `site_conversion_events`;--> statement-breakpoint
DROP TABLE `site_domain_events`;--> statement-breakpoint
DROP TABLE `site_entitlements`;--> statement-breakpoint
DROP TABLE `site_events`;--> statement-breakpoint
DROP TABLE `site_link_items`;--> statement-breakpoint
DROP TABLE `site_link_pages`;--> statement-breakpoint
DROP TABLE `site_locales`;--> statement-breakpoint
DROP TABLE `site_pageview_events`;--> statement-breakpoint
DROP TABLE `site_theme_tokens`;--> statement-breakpoint
DROP TABLE `site_transfer_requests`;--> statement-breakpoint
DROP TABLE `stripe_ga4_subscription_intents`;--> statement-breakpoint
DROP TABLE `tenant_compliance`;--> statement-breakpoint
DROP TABLE `tenant_page_variants`;--> statement-breakpoint
DROP TABLE `tenant_pages`;--> statement-breakpoint
DROP TABLE `tenant_redirects`;--> statement-breakpoint
DROP TABLE `usage_events`;--> statement-breakpoint
DROP TABLE `work_requests`;--> statement-breakpoint
DROP TABLE `blog_posts`;--> statement-breakpoint
DROP TABLE `chowbot_conversations`;--> statement-breakpoint
DROP TABLE `experiences`;--> statement-breakpoint
DROP TABLE `guest_thread_deliveries`;--> statement-breakpoint
DROP TABLE `menus`;--> statement-breakpoint
DROP TABLE `notifications`;--> statement-breakpoint
DROP TABLE `posts`;--> statement-breakpoint
DROP TABLE `reviews`;--> statement-breakpoint
DROP TABLE `site_domains`;--> statement-breakpoint
DROP TABLE `guest_thread_entries`;--> statement-breakpoint
DROP TABLE `review_requests`;--> statement-breakpoint
DROP TABLE `customers`;--> statement-breakpoint
DROP TABLE `guest_threads`;--> statement-breakpoint
DROP TABLE `business_locations`;--> statement-breakpoint
DROP TABLE `facebook_pages_connections`;--> statement-breakpoint
DROP TABLE `sites`;--> statement-breakpoint
ALTER TABLE `__new_sites` RENAME TO `sites`;--> statement-breakpoint
ALTER TABLE `__new_facebook_pages_connections` RENAME TO `facebook_pages_connections`;--> statement-breakpoint
ALTER TABLE `__new_business_locations` RENAME TO `business_locations`;--> statement-breakpoint
ALTER TABLE `__new_guest_threads` RENAME TO `guest_threads`;--> statement-breakpoint
ALTER TABLE `__new_customers` RENAME TO `customers`;--> statement-breakpoint
ALTER TABLE `__new_review_requests` RENAME TO `review_requests`;--> statement-breakpoint
ALTER TABLE `__new_guest_thread_entries` RENAME TO `guest_thread_entries`;--> statement-breakpoint
ALTER TABLE `__new_site_domains` RENAME TO `site_domains`;--> statement-breakpoint
ALTER TABLE `__new_reviews` RENAME TO `reviews`;--> statement-breakpoint
ALTER TABLE `__new_posts` RENAME TO `posts`;--> statement-breakpoint
ALTER TABLE `__new_notifications` RENAME TO `notifications`;--> statement-breakpoint
ALTER TABLE `__new_menus` RENAME TO `menus`;--> statement-breakpoint
ALTER TABLE `__new_guest_thread_deliveries` RENAME TO `guest_thread_deliveries`;--> statement-breakpoint
ALTER TABLE `__new_experiences` RENAME TO `experiences`;--> statement-breakpoint
ALTER TABLE `__new_chowbot_conversations` RENAME TO `chowbot_conversations`;--> statement-breakpoint
ALTER TABLE `__new_blog_posts` RENAME TO `blog_posts`;--> statement-breakpoint
ALTER TABLE `__new_work_requests` RENAME TO `work_requests`;--> statement-breakpoint
ALTER TABLE `__new_usage_events` RENAME TO `usage_events`;--> statement-breakpoint
ALTER TABLE `__new_tenant_redirects` RENAME TO `tenant_redirects`;--> statement-breakpoint
ALTER TABLE `__new_tenant_pages` RENAME TO `tenant_pages`;--> statement-breakpoint
ALTER TABLE `__new_tenant_page_variants` RENAME TO `tenant_page_variants`;--> statement-breakpoint
ALTER TABLE `__new_tenant_compliance` RENAME TO `tenant_compliance`;--> statement-breakpoint
ALTER TABLE `__new_stripe_ga4_subscription_intents` RENAME TO `stripe_ga4_subscription_intents`;--> statement-breakpoint
ALTER TABLE `__new_site_transfer_requests` RENAME TO `site_transfer_requests`;--> statement-breakpoint
ALTER TABLE `__new_site_theme_tokens` RENAME TO `site_theme_tokens`;--> statement-breakpoint
ALTER TABLE `__new_site_pageview_events` RENAME TO `site_pageview_events`;--> statement-breakpoint
ALTER TABLE `__new_site_locales` RENAME TO `site_locales`;--> statement-breakpoint
ALTER TABLE `__new_site_link_pages` RENAME TO `site_link_pages`;--> statement-breakpoint
ALTER TABLE `__new_site_link_items` RENAME TO `site_link_items`;--> statement-breakpoint
ALTER TABLE `__new_site_events` RENAME TO `site_events`;--> statement-breakpoint
ALTER TABLE `__new_site_entitlements` RENAME TO `site_entitlements`;--> statement-breakpoint
ALTER TABLE `__new_site_domain_events` RENAME TO `site_domain_events`;--> statement-breakpoint
ALTER TABLE `__new_site_conversion_events` RENAME TO `site_conversion_events`;--> statement-breakpoint
ALTER TABLE `__new_site_consultation_settings` RENAME TO `site_consultation_settings`;--> statement-breakpoint
ALTER TABLE `__new_site_config` RENAME TO `site_config`;--> statement-breakpoint
ALTER TABLE `__new_site_billing` RENAME TO `site_billing`;--> statement-breakpoint
ALTER TABLE `__new_site_analytics_daily` RENAME TO `site_analytics_daily`;--> statement-breakpoint
ALTER TABLE `__new_reservation_submissions` RENAME TO `reservation_submissions`;--> statement-breakpoint
ALTER TABLE `__new_reservation_slot_overrides` RENAME TO `reservation_slot_overrides`;--> statement-breakpoint
ALTER TABLE `__new_public_resource_cache_invalidations` RENAME TO `public_resource_cache_invalidations`;--> statement-breakpoint
ALTER TABLE `__new_post_channel_jobs` RENAME TO `post_channel_jobs`;--> statement-breakpoint
ALTER TABLE `__new_onboarding_drafts` RENAME TO `onboarding_drafts`;--> statement-breakpoint
ALTER TABLE `__new_offerings` RENAME TO `offerings`;--> statement-breakpoint
ALTER TABLE `__new_notification_reads` RENAME TO `notification_reads`;--> statement-breakpoint
ALTER TABLE `__new_notification_events` RENAME TO `notification_events`;--> statement-breakpoint
ALTER TABLE `__new_notification_deliveries` RENAME TO `notification_deliveries`;--> statement-breakpoint
ALTER TABLE `__new_menu_items` RENAME TO `menu_items`;--> statement-breakpoint
ALTER TABLE `__new_media_assets` RENAME TO `media_assets`;--> statement-breakpoint
ALTER TABLE `__new_mcp_workspace_preferences` RENAME TO `mcp_workspace_preferences`;--> statement-breakpoint
ALTER TABLE `__new_mcp_tool_call_events` RENAME TO `mcp_tool_call_events`;--> statement-breakpoint
ALTER TABLE `__new_location_qa` RENAME TO `location_qa`;--> statement-breakpoint
ALTER TABLE `__new_guest_thread_sequence_counters` RENAME TO `guest_thread_sequence_counters`;--> statement-breakpoint
ALTER TABLE `__new_guest_thread_outbox` RENAME TO `guest_thread_outbox`;--> statement-breakpoint
ALTER TABLE `__new_guest_thread_member_state` RENAME TO `guest_thread_member_state`;--> statement-breakpoint
ALTER TABLE `__new_guest_thread_commands` RENAME TO `guest_thread_commands`;--> statement-breakpoint
ALTER TABLE `__new_google_place_snapshots` RENAME TO `google_place_snapshots`;--> statement-breakpoint
ALTER TABLE `__new_google_analytics_connections` RENAME TO `google_analytics_connections`;--> statement-breakpoint
ALTER TABLE `__new_experience_slot_overrides` RENAME TO `experience_slot_overrides`;--> statement-breakpoint
ALTER TABLE `__new_experience_bookings` RENAME TO `experience_bookings`;--> statement-breakpoint
ALTER TABLE `__new_domain_reconciliation_jobs` RENAME TO `domain_reconciliation_jobs`;--> statement-breakpoint
ALTER TABLE `__new_dashboard_preferences` RENAME TO `dashboard_preferences`;--> statement-breakpoint
ALTER TABLE `__new_customer_claims` RENAME TO `customer_claims`;--> statement-breakpoint
ALTER TABLE `__new_contact_submissions` RENAME TO `contact_submissions`;--> statement-breakpoint
ALTER TABLE `__new_client_import_artifacts` RENAME TO `client_import_artifacts`;--> statement-breakpoint
ALTER TABLE `__new_chowbot_messages` RENAME TO `chowbot_messages`;--> statement-breakpoint
ALTER TABLE `__new_chowbot_channel_state` RENAME TO `chowbot_channel_state`;--> statement-breakpoint
ALTER TABLE `__new_canary_runs` RENAME TO `canary_runs`;--> statement-breakpoint
ALTER TABLE `__new_booking_policies` RENAME TO `booking_policies`;--> statement-breakpoint
ALTER TABLE `__new_blog_post_redirects` RENAME TO `blog_post_redirects`;--> statement-breakpoint
ALTER TABLE `__new_ai_usage_log` RENAME TO `ai_usage_log`;--> statement-breakpoint
CREATE INDEX `ai_usage_log_organization_id_idx` ON `ai_usage_log` (`organization_id`);--> statement-breakpoint
CREATE INDEX idx_ai_usage_log_org ON ai_usage_log(organization_id, created_at DESC);--> statement-breakpoint
CREATE UNIQUE INDEX `blog_post_redirects_platform_slug_idx` ON `blog_post_redirects` (`old_slug`) WHERE site_id IS NULL;--> statement-breakpoint
CREATE INDEX `blog_post_redirects_post_idx` ON `blog_post_redirects` (`post_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `blog_post_redirects_site_slug_idx` ON `blog_post_redirects` (`site_id`,`old_slug`) WHERE site_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `blog_posts_org_site_idx` ON `blog_posts` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `blog_posts_platform_slug_idx` ON `blog_posts` (`slug`) WHERE site_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `blog_posts_site_slug_idx` ON `blog_posts` (`site_id`,`slug`) WHERE site_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `booking_policies_experience_location_unique` ON `booking_policies` (`location_id`) WHERE policy_type = 'experience' AND scope_type = 'location' AND location_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `booking_policies_experience_scope_unique` ON `booking_policies` (`experience_id`) WHERE policy_type = 'experience' AND scope_type = 'experience' AND experience_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `booking_policies_experience_site_unique` ON `booking_policies` (`site_id`) WHERE policy_type = 'experience' AND scope_type = 'site';--> statement-breakpoint
CREATE INDEX `booking_policies_organization_id_idx` ON `booking_policies` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_policies_reservation_location_unique` ON `booking_policies` (`location_id`) WHERE policy_type = 'reservation' AND scope_type = 'location' AND location_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `booking_policies_site_type_idx` ON `booking_policies` (`site_id`,`policy_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `business_locations_organization_id_site_id_slug_unique` ON `business_locations` (`organization_id`,`site_id`,`slug`);--> statement-breakpoint
CREATE INDEX idx_canary_runs_status_created
  ON canary_runs(status, created_at DESC);--> statement-breakpoint
CREATE INDEX idx_canary_runs_type_created
  ON canary_runs(run_type, created_at DESC);--> statement-breakpoint
CREATE INDEX `chowbot_channel_state_user_id_idx` ON `chowbot_channel_state` (`user_id`);--> statement-breakpoint
CREATE INDEX `chowbot_conversations_org_site_idx` ON `chowbot_conversations` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX `chowbot_conversations_user_id_idx` ON `chowbot_conversations` (`user_id`);--> statement-breakpoint
CREATE INDEX idx_chowbot_conversations_site
  ON chowbot_conversations(site_id, user_id, status, updated_at DESC);--> statement-breakpoint
CREATE INDEX `chowbot_messages_conversation_id_idx` ON `chowbot_messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `chowbot_messages_org_site_idx` ON `chowbot_messages` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX idx_chowbot_messages_conversation
  ON chowbot_messages(conversation_id, created_at ASC);--> statement-breakpoint
CREATE UNIQUE INDEX `client_import_artifacts_slug_type_path_unique` ON `client_import_artifacts` (`slug`,`artifact_type`,`path`);--> statement-breakpoint
CREATE INDEX `contact_submissions_location_idx` ON `contact_submissions` (`location_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `contact_submissions_org_site_idx` ON `contact_submissions` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX idx_contact_submissions_site ON contact_submissions(site_id, created_at DESC);--> statement-breakpoint
CREATE INDEX `idx_customer_claims_customer_id` ON `customer_claims` (`customer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_customer_claims_customer_user_unique` ON `customer_claims` (`customer_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_customer_claims_token_hash` ON `customer_claims` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_customer_claims_user_id` ON `customer_claims` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_customers_org_site_email_hash` ON `customers` (`organization_id`,`site_id`,`email_hash`);--> statement-breakpoint
CREATE INDEX `idx_customers_organization_id` ON `customers` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_customers_site_email_normalized_unique` ON `customers` (`site_id`,`email_normalized`) WHERE email_normalized IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_customers_site_id` ON `customers` (`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_customers_stripe_customer_id_unique` ON `customers` (`stripe_customer_id`) WHERE stripe_customer_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_customers_user_id` ON `customers` (`user_id`);--> statement-breakpoint
CREATE INDEX idx_domain_reconciliation_jobs_due
  ON domain_reconciliation_jobs(status, run_after);--> statement-breakpoint
CREATE INDEX `experience_bookings_organization_id_idx` ON `experience_bookings` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_experience_bookings_customer_id` ON `experience_bookings` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_experience_bookings_review_reminder_due` ON `experience_bookings` (`site_id`,`review_request_sent_at`,`review_reminder_sent_at`,`review_submitted_at`);--> statement-breakpoint
CREATE INDEX `idx_experience_bookings_review_request_due` ON `experience_bookings` (`site_id`,`status`,`completed_at`,`review_request_sent_at`);--> statement-breakpoint
CREATE INDEX `experience_slot_overrides_org_site_idx` ON `experience_slot_overrides` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX idx_experience_slot_overrides_date
  ON experience_slot_overrides(experience_id, override_date);--> statement-breakpoint
CREATE UNIQUE INDEX idx_experience_slot_overrides_unique
  ON experience_slot_overrides(experience_id, override_date, time_slot);--> statement-breakpoint
CREATE UNIQUE INDEX `experiences_org_site_id_unique` ON `experiences` (`organization_id`,`site_id`,`id`);--> statement-breakpoint
CREATE INDEX `experiences_org_site_idx` ON `experiences` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX idx_google_place_snapshots_place_id
  ON google_place_snapshots(place_id);--> statement-breakpoint
CREATE INDEX idx_google_place_snapshots_site
  ON google_place_snapshots(site_id);--> statement-breakpoint
CREATE INDEX `guest_thread_commands_site_created_idx` ON `guest_thread_commands` (`site_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `guest_thread_commands_thread_idempotency_unique` ON `guest_thread_commands` (`thread_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `guest_thread_deliveries_idempotency_key_unique` ON `guest_thread_deliveries` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `guest_thread_deliveries_status_updated_idx` ON `guest_thread_deliveries` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `guest_thread_deliveries_thread_status_idx` ON `guest_thread_deliveries` (`thread_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `guest_thread_entries_external_id_unique` ON `guest_thread_entries` (`external_id`) WHERE external_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `guest_thread_entries_organization_id_idx` ON `guest_thread_entries` (`organization_id`);--> statement-breakpoint
CREATE INDEX `guest_thread_entries_site_kind_occurred_idx` ON `guest_thread_entries` (`site_id`,`kind`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `guest_thread_entries_thread_occurred_idx` ON `guest_thread_entries` (`thread_id`,`occurred_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `guest_thread_entries_thread_sequence_unique` ON `guest_thread_entries` (`thread_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `guest_thread_member_state_member_updated_idx` ON `guest_thread_member_state` (`member_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `guest_thread_outbox_status_next_idx` ON `guest_thread_outbox` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `guest_thread_outbox_thread_idx` ON `guest_thread_outbox` (`thread_id`);--> statement-breakpoint
CREATE INDEX `guest_threads_conversation_state_idx` ON `guest_threads` (`site_id`,`conversation_state`,`updated_at`);--> statement-breakpoint
CREATE INDEX `guest_threads_inbox_status_idx` ON `guest_threads` (`site_id`,`inbox_status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `guest_threads_location_updated_idx` ON `guest_threads` (`location_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `guest_threads_organization_id_idx` ON `guest_threads` (`organization_id`);--> statement-breakpoint
CREATE INDEX `guest_threads_site_updated_idx` ON `guest_threads` (`site_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `guest_threads_site_version_idx` ON `guest_threads` (`site_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `guest_threads_submission_unique` ON `guest_threads` (`submission_type`,`submission_id`);--> statement-breakpoint
CREATE INDEX `idx_location_qa_location` ON `location_qa` (`location_id`,`status`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_location_qa_page` ON `location_qa` (`site_id`,`page_path`,`status`,`sort_order`) WHERE location_id IS NULL AND page_path IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_location_qa_site` ON `location_qa` (`site_id`,`status`,`sort_order`) WHERE location_id IS NULL;--> statement-breakpoint
CREATE INDEX `location_qa_organization_id_idx` ON `location_qa` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_mcp_tool_call_events_created_at` ON `mcp_tool_call_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_mcp_tool_call_events_method_created` ON `mcp_tool_call_events` (`method`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_mcp_tool_call_events_org` ON `mcp_tool_call_events` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_mcp_tool_call_events_session` ON `mcp_tool_call_events` (`session_id_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_mcp_tool_call_events_site` ON `mcp_tool_call_events` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_mcp_tool_call_events_tool_status` ON `mcp_tool_call_events` (`tool_name`,`status`);--> statement-breakpoint
CREATE INDEX `idx_mcp_tool_call_events_unknown` ON `mcp_tool_call_events` (`unknown_tool_name`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_media_assets_site` ON `media_assets` (`site_id`, `status`, `created_at` DESC);--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_org_site_id_unique` ON `media_assets` (`organization_id`,`site_id`,`id`);--> statement-breakpoint
CREATE INDEX `menu_items_menu_id_idx` ON `menu_items` (`menu_id`);--> statement-breakpoint
CREATE INDEX `menus_organization_id_site_id_idx` ON `menus` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_channel_status_idx` ON `notification_deliveries` (`channel`,`status`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_notification_idx` ON `notification_deliveries` (`notification_id`);--> statement-breakpoint
CREATE INDEX `notification_events_event_created_idx` ON `notification_events` (`event_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `notification_events_org_site_idx` ON `notification_events` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX `notification_events_scope_created_idx` ON `notification_events` (`scope_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `notification_events_submission_idx` ON `notification_events` (`submission_type`,`submission_id`);--> statement-breakpoint
CREATE INDEX `notification_reads_user_read_at_idx` ON `notification_reads` (`user_id`,`read_at`);--> statement-breakpoint
CREATE INDEX `notifications_organization_created_at_idx` ON `notifications` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_scope_created_at_idx` ON `notifications` (`scope`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_site_created_at_idx` ON `notifications` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_target_user_created_at_idx` ON `notifications` (`target_user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `offerings_organization_id_site_id_slug_unique` ON `offerings` (`organization_id`,`site_id`,`slug`);--> statement-breakpoint
CREATE INDEX `offerings_site_sort_idx` ON `offerings` (`site_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_onboarding_drafts_active_user_unique` ON `onboarding_drafts` (`user_id`) WHERE status = 'active';--> statement-breakpoint
CREATE INDEX `onboarding_drafts_user_id_idx` ON `onboarding_drafts` (`user_id`);--> statement-breakpoint
CREATE INDEX idx_post_channel_jobs_post ON post_channel_jobs(post_id);--> statement-breakpoint
CREATE UNIQUE INDEX `post_channel_jobs_post_channel_unique` ON `post_channel_jobs` (`post_id`,`channel`);--> statement-breakpoint
CREATE INDEX `post_channel_jobs_post_id_idx` ON `post_channel_jobs` (`post_id`);--> statement-breakpoint
CREATE INDEX `posts_org_site_idx` ON `posts` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `posts_site_slug_idx` ON `posts` (`site_id`,`slug`);--> statement-breakpoint
CREATE INDEX public_resource_cache_invalidations_site_idx
  ON public_resource_cache_invalidations(site_id, status);--> statement-breakpoint
CREATE INDEX public_resource_cache_invalidations_status_idx
  ON public_resource_cache_invalidations(status, created_at);--> statement-breakpoint
CREATE INDEX `idx_reservation_slot_overrides_date` ON `reservation_slot_overrides` (`location_id`,`override_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reservation_slot_overrides_unique` ON `reservation_slot_overrides` (`location_id`,`override_date`,`time_slot`);--> statement-breakpoint
CREATE INDEX `reservation_slot_overrides_org_site_idx` ON `reservation_slot_overrides` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX `idx_reservation_submissions_customer_id` ON `reservation_submissions` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_reservation_submissions_review_reminder_due` ON `reservation_submissions` (`site_id`,`review_request_sent_at`,`review_reminder_sent_at`,`review_submitted_at`);--> statement-breakpoint
CREATE INDEX `idx_reservation_submissions_review_request_due` ON `reservation_submissions` (`site_id`,`status`,`completed_at`,`review_request_sent_at`);--> statement-breakpoint
CREATE INDEX `reservation_submissions_organization_id_idx` ON `reservation_submissions` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_review_requests_active_booking_unique` ON `review_requests` (`site_id`,`booking_type`,`booking_id`) WHERE revoked_at IS NULL AND submitted_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_review_requests_send_due` ON `review_requests` (`site_id`,`first_sent_at`,`reminder_sent_at`,`submitted_at`,`expires_at`);--> statement-breakpoint
CREATE INDEX `review_requests_organization_id_idx` ON `review_requests` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_requests_token_hash_unique` ON `review_requests` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_reviews_customer_id` ON `reviews` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_reviews_location_status` ON `reviews` (`location_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_reviews_request_id` ON `reviews` (`review_request_id`);--> statement-breakpoint
CREATE INDEX `idx_reviews_site_status` ON `reviews` (`site_id`,`status`,`created_at`) WHERE location_id IS NULL;--> statement-breakpoint
CREATE INDEX `reviews_organization_id_idx` ON `reviews` (`organization_id`);--> statement-breakpoint
CREATE INDEX idx_site_analytics_daily_site_id_date
  ON site_analytics_daily(site_id, date DESC);--> statement-breakpoint
CREATE INDEX `idx_site_billing_org` ON `site_billing` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_site_billing_subscription` ON `site_billing` (`stripe_subscription_id`) WHERE `stripe_subscription_id` IS NOT NULL;--> statement-breakpoint
CREATE INDEX `site_config_org_site_idx` ON `site_config` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX `site_consultation_settings_organization_id_idx` ON `site_consultation_settings` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_consultation_settings_site_id_unique` ON `site_consultation_settings` (`site_id`);--> statement-breakpoint
CREATE INDEX `site_conversion_events_name_created_idx` ON `site_conversion_events` (`event_name`,`created_at`);--> statement-breakpoint
CREATE INDEX `site_conversion_events_organization_id_idx` ON `site_conversion_events` (`organization_id`);--> statement-breakpoint
CREATE INDEX `site_conversion_events_site_created_idx` ON `site_conversion_events` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX idx_site_domain_events_domain
  ON site_domain_events(domain_id, created_at DESC);--> statement-breakpoint
CREATE INDEX idx_site_domain_events_site
  ON site_domain_events(site_id, created_at DESC);--> statement-breakpoint
CREATE INDEX `site_domain_events_domain_id_idx` ON `site_domain_events` (`domain_id`);--> statement-breakpoint
CREATE UNIQUE INDEX idx_site_domains_one_canonical
  ON site_domains(site_id)
  WHERE role = 'canonical' AND status = 'active';--> statement-breakpoint
CREATE INDEX idx_site_domains_reconcile
  ON site_domains(status, next_check_at);--> statement-breakpoint
CREATE INDEX `site_domains_org_site_idx` ON `site_domains` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX idx_site_entitlements_org ON site_entitlements(organization_id);--> statement-breakpoint
CREATE INDEX `site_entitlements_organization_id_idx` ON `site_entitlements` (`organization_id`);--> statement-breakpoint
CREATE INDEX idx_site_events_location
  ON site_events(location_id, created_at DESC)
  WHERE location_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX idx_site_events_site
  ON site_events(site_id, created_at DESC);--> statement-breakpoint
CREATE INDEX `site_events_org_site_idx` ON `site_events` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX `site_link_items_page_status_sort_idx` ON `site_link_items` (`link_page_id`,`status`,`sort_order`);--> statement-breakpoint
CREATE INDEX `site_link_items_site_idx` ON `site_link_items` (`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_link_pages_organization_id_site_id_path_unique` ON `site_link_pages` (`organization_id`,`site_id`,`path`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_link_pages_site_id_unique` ON `site_link_pages` (`site_id`);--> statement-breakpoint
CREATE INDEX `site_link_pages_site_idx` ON `site_link_pages` (`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_site_locales_one_source_per_site` ON `site_locales` (`organization_id`,`site_id`) WHERE is_source = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `site_locales_organization_id_site_id_locale_unique` ON `site_locales` (`organization_id`,`site_id`,`locale`);--> statement-breakpoint
CREATE INDEX idx_pageview_events_session
  ON site_pageview_events(site_id, session_id);--> statement-breakpoint
CREATE INDEX idx_pageview_events_site_date
  ON site_pageview_events(site_id, created_at DESC);--> statement-breakpoint
CREATE INDEX idx_pageview_events_site_visitor
  ON site_pageview_events(site_id, visitor_id);--> statement-breakpoint
CREATE INDEX `site_pageview_events_site_created_idx` ON `site_pageview_events` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `site_theme_tokens_organization_id_idx` ON `site_theme_tokens` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_theme_tokens_site_template_unique` ON `site_theme_tokens` (`site_id`,`template_slug`);--> statement-breakpoint
CREATE UNIQUE INDEX idx_site_transfer_pending
  ON site_transfer_requests(site_id) WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX idx_site_transfer_reminders
  ON site_transfer_requests(status, requires_payment, created_at);--> statement-breakpoint
CREATE INDEX idx_site_transfer_site
  ON site_transfer_requests(site_id, status);--> statement-breakpoint
CREATE UNIQUE INDEX idx_site_transfer_token
  ON site_transfer_requests(token);--> statement-breakpoint
CREATE INDEX `site_transfer_requests_site_id_idx` ON `site_transfer_requests` (`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX idx_sites_custom_domain_unique
  ON sites(custom_domain)
  WHERE custom_domain IS NOT NULL;--> statement-breakpoint
CREATE INDEX `sites_created_at_idx` ON `sites` (`created_at`);--> statement-breakpoint
CREATE INDEX `sites_organization_id_idx` ON `sites` (`organization_id`);--> statement-breakpoint
CREATE INDEX `stripe_ga4_subscription_intents_expiry_idx`
  ON `stripe_ga4_subscription_intents` (`status`, `expires_at`);--> statement-breakpoint
CREATE INDEX `stripe_ga4_subscription_intents_organization_idx`
  ON `stripe_ga4_subscription_intents` (`organization_id`, `status`, `created_at`);--> statement-breakpoint
CREATE INDEX `stripe_ga4_subscription_intents_subscription_idx`
  ON `stripe_ga4_subscription_intents` (`stripe_subscription_id`, `status`, `created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_compliance_site_id_unique` ON `tenant_compliance` (`site_id`);--> statement-breakpoint
CREATE INDEX `tenant_page_variants_page_idx` ON `tenant_page_variants` (`page_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_page_variants_page_locale_unique` ON `tenant_page_variants` (`page_id`,`locale`);--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_page_variants_site_locale_path_unique` ON `tenant_page_variants` (`site_id`,`locale`,`path`);--> statement-breakpoint
CREATE INDEX `tenant_page_variants_site_path_idx` ON `tenant_page_variants` (`site_id`,`path`);--> statement-breakpoint
CREATE INDEX `tenant_pages_site_sort_idx` ON `tenant_pages` (`site_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `tenant_redirects_organization_id_idx` ON `tenant_redirects` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_redirects_site_locale_from_path_unique` ON `tenant_redirects` (`site_id`,`locale`,`from_path`);--> statement-breakpoint
CREATE INDEX `tenant_redirects_site_locale_path_idx` ON `tenant_redirects` (`site_id`,`locale`,`from_path`);--> statement-breakpoint
CREATE UNIQUE INDEX `usage_events_organization_id_idempotency_key_unique` ON `usage_events` (`organization_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `usage_events_organization_resource_created_idx` ON `usage_events` (`organization_id`,`resource`,`created_at`);--> statement-breakpoint
CREATE INDEX `usage_events_site_created_idx` ON `usage_events` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX idx_work_requests_org
  ON work_requests(organization_id, status, created_at DESC);--> statement-breakpoint
CREATE INDEX idx_work_requests_status
  ON work_requests(status, priority, created_at DESC);--> statement-breakpoint
CREATE INDEX `work_requests_organization_id_idx` ON `work_requests` (`organization_id`);--> statement-breakpoint
CREATE TRIGGER `blog_posts_publication_status_insert`
BEFORE INSERT ON `blog_posts`
WHEN NEW.`status` NOT IN ('published', 'scheduled')
BEGIN SELECT RAISE(ABORT, 'blog_posts.status must be published or scheduled'); END;--> statement-breakpoint
CREATE TRIGGER `blog_posts_publication_status_update`
BEFORE UPDATE OF `status` ON `blog_posts`
WHEN NEW.`status` NOT IN ('published', 'scheduled')
BEGIN SELECT RAISE(ABORT, 'blog_posts.status must be published or scheduled'); END;--> statement-breakpoint
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
END;--> statement-breakpoint
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
END;--> statement-breakpoint
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
END;--> statement-breakpoint
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
END;--> statement-breakpoint
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
END;--> statement-breakpoint
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
END;--> statement-breakpoint
CREATE TRIGGER `media_assets_category_insert_guard`
BEFORE INSERT ON `media_assets`
WHEN NEW.`category` IS NOT NULL
  AND NEW.`category` NOT IN ('exterior', 'interior', 'food', 'menu', 'team', 'other', 'logo', 'blog')
BEGIN
  SELECT RAISE(ABORT, 'media_assets category is invalid');
END;--> statement-breakpoint
CREATE TRIGGER `media_assets_category_update_guard`
BEFORE UPDATE OF `category` ON `media_assets`
WHEN NEW.`category` IS NOT NULL
  AND NEW.`category` NOT IN ('exterior', 'interior', 'food', 'menu', 'team', 'other', 'logo', 'blog')
BEGIN
  SELECT RAISE(ABORT, 'media_assets category is invalid');
END;--> statement-breakpoint
CREATE TRIGGER media_assets_video_thumbnail_insert
BEFORE INSERT ON media_assets
WHEN NEW.kind = 'video' AND (NEW.thumbnail_url IS NULL OR length(trim(NEW.thumbnail_url)) = 0)
BEGIN
  SELECT RAISE(ABORT, 'video assets require thumbnail_url');
END;--> statement-breakpoint
CREATE TRIGGER media_assets_video_thumbnail_update
BEFORE UPDATE OF kind, thumbnail_url ON media_assets
WHEN NEW.kind = 'video' AND (NEW.thumbnail_url IS NULL OR length(trim(NEW.thumbnail_url)) = 0)
BEGIN
  SELECT RAISE(ABORT, 'video assets require thumbnail_url');
END;--> statement-breakpoint
CREATE TRIGGER `posts_publication_status_insert`
BEFORE INSERT ON `posts`
WHEN NEW.`status` NOT IN ('published', 'scheduled')
BEGIN SELECT RAISE(ABORT, 'posts.status must be published or scheduled'); END;--> statement-breakpoint
CREATE TRIGGER `posts_publication_status_update`
BEFORE UPDATE OF `status` ON `posts`
WHEN NEW.`status` NOT IN ('published', 'scheduled')
BEGIN SELECT RAISE(ABORT, 'posts.status must be published or scheduled'); END;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_platform_docs` (
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
);--> statement-breakpoint
INSERT INTO `__new_platform_docs` (`id`, `title`, `slug`, `excerpt`, `category`, `nav_section`, `nav_title`, `nav_order`, `nav_section_order`, `nav_group`, `nav_group_order`, `hide_from_nav`, `featured_order`, `author_id`, `seo_description`, `seo_keywords`, `sort_order`, `difficulty_level`, `created_at`, `updated_at`, `canonical_url`, `robots`) SELECT `id`, `title`, `slug`, `excerpt`, `category`, `nav_section`, `nav_title`, `nav_order`, `nav_section_order`, `nav_group`, `nav_group_order`, `hide_from_nav`, `featured_order`, `author_id`, `seo_description`, `seo_keywords`, `sort_order`, `difficulty_level`, `created_at`, `updated_at`, `canonical_url`, `robots` FROM `platform_docs`;--> statement-breakpoint
DROP TABLE `platform_docs`;--> statement-breakpoint
ALTER TABLE `__new_platform_docs` RENAME TO `platform_docs`;--> statement-breakpoint
CREATE UNIQUE INDEX `platform_docs_slug_unique` ON `platform_docs` (`slug`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;
CREATE TABLE `__new_chowbot_messages` (
	id TEXT PRIMARY KEY,
	conversation_id TEXT NOT NULL,
	organization_id TEXT NOT NULL,
	site_id TEXT NOT NULL,
	user_id TEXT,
	role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
	channel TEXT NOT NULL CHECK (channel IN ('dashboard', 'whatsapp')),
	content TEXT,
	meta_message_id TEXT UNIQUE,
	tool_calls TEXT,
	status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'read')),
	error TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	CHECK (content IS NOT NULL OR tool_calls IS NOT NULL),
	FOREIGN KEY (conversation_id) REFERENCES chowbot_conversations(id) ON DELETE CASCADE,
	FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
	FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
	FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE SET NULL
);
INSERT INTO `__new_chowbot_messages` (`id`, `conversation_id`, `organization_id`, `site_id`, `user_id`, `role`, `channel`, `content`, `meta_message_id`, `tool_calls`, `status`, `error`, `created_at`) SELECT `id`, `conversation_id`, `organization_id`, `site_id`, `user_id`, `role`, `channel`, `content`, `meta_message_id`, `tool_calls`, `status`, `error`, `created_at` FROM `chowbot_messages`;
DROP TABLE `chowbot_messages`;
ALTER TABLE `__new_chowbot_messages` RENAME TO `chowbot_messages`;
PRAGMA foreign_keys=ON;
CREATE INDEX idx_chowbot_messages_conversation ON chowbot_messages(conversation_id, created_at ASC);
CREATE INDEX `chowbot_messages_conversation_id_idx` ON `chowbot_messages` (`conversation_id`);
CREATE INDEX `chowbot_messages_org_site_idx` ON `chowbot_messages` (`organization_id`,`site_id`);
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

ALTER TABLE `chowbot_channel_state` ADD `pending_message_id` text REFERENCES chowbot_messages(id);--> statement-breakpoint
ALTER TABLE `chowbot_channel_state` DROP COLUMN `pending_media`;--> statement-breakpoint
ALTER TABLE `reviews` DROP COLUMN `reviewer_photo_url`;--> statement-breakpoint
ALTER TABLE `reviews` DROP COLUMN `photo_urls`;--> statement-breakpoint
ALTER TABLE `tenant_compliance` DROP COLUMN `document_asset_ids`;--> statement-breakpoint

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
	CONSTRAINT "media_placements_owner_type_check" CHECK(owner_type IN ('site','business_location','menu_item','post','blog_post','experience','offering','content_block','platform_doc','review','review_request','tenant_compliance','chowbot_message')),
	CONSTRAINT "media_placements_slot_check" CHECK((owner_type = 'site' AND (slot IN ('logo','logo_dark','favicon'))) OR (owner_type = 'business_location' AND (slot IN ('hero','gallery'))) OR (owner_type = 'menu_item' AND (slot = 'gallery')) OR (owner_type = 'post' AND (slot IN ('cover','gallery'))) OR (owner_type = 'blog_post' AND (slot = 'featured')) OR (owner_type = 'experience' AND (slot = 'gallery')) OR (owner_type = 'offering' AND (slot IN ('thumbnail','hero','gallery') OR slot GLOB 'features.[0-9]*.image')) OR (owner_type = 'content_block' AND (slot IN ('media','gallery','background','featured','decoration') OR slot GLOB 'items.[0-9]*.image' OR slot GLOB 'images.[0-9]*' OR slot GLOB 'features.[0-9]*.icon' OR slot GLOB 'people.[0-9]*.image')) OR (owner_type = 'platform_doc' AND (slot = 'featured')) OR (owner_type = 'review' AND (slot IN ('portrait','gallery'))) OR (owner_type = 'review_request' AND (slot = 'gallery')) OR (owner_type = 'tenant_compliance' AND (slot = 'document')) OR (owner_type = 'chowbot_message' AND (slot = 'attachment'))),
	CONSTRAINT "media_placements_status_check" CHECK(status IN ('pending', 'active', 'rejected'))
);--> statement-breakpoint
INSERT INTO `media_placements` (`id`, `organization_id`, `site_id`, `owner_type`, `owner_id`, `slot`, `asset_id`, `sort_order`)
SELECT lower(hex(randomblob(16))), `organization_id`, `site_id`, `owner_type`, `owner_id`, `slot`, `asset_id`, `sort_order`
  FROM `__media_placement_backfill`;--> statement-breakpoint
CREATE INDEX `media_placements_owner_idx` ON `media_placements` (`site_id`,`owner_type`,`owner_id`,`slot`,`sort_order`);--> statement-breakpoint
CREATE INDEX `media_placements_asset_idx` ON `media_placements` (`organization_id`,`site_id`,`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_placements_owner_slot_asset_unique` ON `media_placements` (`owner_type`,`owner_id`,`slot`,`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_placements_owner_slot_order_unique` ON `media_placements` (`owner_type`,`owner_id`,`slot`,`sort_order`);--> statement-breakpoint
DROP TABLE `__media_placement_backfill`;
