CREATE TABLE `review_media` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text,
	`review_request_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`media_asset_id` text NOT NULL,
	`kind` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_request_id`) REFERENCES `review_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "review_media_kind_check" CHECK(kind IN ('image', 'video')),
	CONSTRAINT "review_media_status_check" CHECK(status IN ('pending', 'approved', 'rejected', 'deleted'))
);
--> statement-breakpoint
CREATE INDEX `idx_review_media_review_request_id` ON `review_media` (`review_request_id`);--> statement-breakpoint
CREATE INDEX `idx_review_media_review_id` ON `review_media` (`review_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_media_media_asset_id_unique` ON `review_media` (`media_asset_id`);--> statement-breakpoint
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
CREATE INDEX `idx_review_requests_token_hash` ON `review_requests` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_review_requests_send_due` ON `review_requests` (`site_id`,`first_sent_at`,`reminder_sent_at`,`submitted_at`,`expires_at`);--> statement-breakpoint
ALTER TABLE `business_locations` ADD `google_review_url` text;--> statement-breakpoint
INSERT INTO `site_entitlements` (`id`, `site_id`, `organization_id`, `key`, `value`, `source`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(16))), s.id, s.organization_id, 'review_requests',
       CASE WHEN COALESCE(sb.plan, s.plan, 'free') IN ('growth', 'managed', 'seo_accelerator') THEN 'true' ELSE 'false' END,
       'system', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `sites` s
LEFT JOIN `site_billing` sb ON sb.site_id = s.id
ON CONFLICT(`site_id`, `key`) DO UPDATE SET
  `value` = excluded.`value`,
  `updated_at` = excluded.`updated_at`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	FOREIGN KEY (`experience_id`) REFERENCES `experiences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "experience_bookings_completion_source_check" CHECK(completion_source IS NULL OR completion_source IN ('manual', 'auto'))
);
--> statement-breakpoint
INSERT INTO `__new_experience_bookings`("id", "experience_id", "organization_id", "site_id", "customer_id", "location_id", "guest_name", "guest_email", "guest_phone", "party_size", "booking_date", "time_slot", "status", "notes", "ip_hash", "cancellation_token_hash", "cancellation_token_expires_at", "cancellation_token_used_at", "completed_at", "completion_source", "review_request_sent_at", "review_reminder_sent_at", "review_submitted_at", "review_id", "created_at", "updated_at") SELECT "id", "experience_id", "organization_id", "site_id", "customer_id", "location_id", "guest_name", "guest_email", "guest_phone", "party_size", "booking_date", "time_slot", "status", "notes", "ip_hash", "cancellation_token_hash", "cancellation_token_expires_at", "cancellation_token_used_at", NULL, NULL, NULL, NULL, NULL, NULL, "created_at", "updated_at" FROM `experience_bookings`;--> statement-breakpoint
DROP TABLE `experience_bookings`;--> statement-breakpoint
ALTER TABLE `__new_experience_bookings` RENAME TO `experience_bookings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_experience_bookings_review_request_due` ON `experience_bookings` (`site_id`,`status`,`completed_at`,`review_request_sent_at`);--> statement-breakpoint
CREATE INDEX `idx_experience_bookings_review_reminder_due` ON `experience_bookings` (`site_id`,`review_request_sent_at`,`review_reminder_sent_at`,`review_submitted_at`);--> statement-breakpoint
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
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "reservation_submissions_completion_source_check" CHECK(completion_source IS NULL OR completion_source IN ('manual', 'auto'))
);
--> statement-breakpoint
INSERT INTO `__new_reservation_submissions`("id", "organization_id", "site_id", "customer_id", "location_id", "name", "email", "phone", "date", "time", "guests", "requests", "status", "ip_hash", "cancellation_token_hash", "cancellation_token_expires_at", "cancellation_token_used_at", "completed_at", "completion_source", "review_request_sent_at", "review_reminder_sent_at", "review_submitted_at", "review_id", "created_at", "updated_at") SELECT "id", "organization_id", "site_id", "customer_id", "location_id", "name", "email", "phone", "date", "time", "guests", "requests", "status", "ip_hash", "cancellation_token_hash", "cancellation_token_expires_at", "cancellation_token_used_at", NULL, NULL, NULL, NULL, NULL, NULL, "created_at", COALESCE("created_at", strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) FROM `reservation_submissions`;--> statement-breakpoint
DROP TABLE `reservation_submissions`;--> statement-breakpoint
ALTER TABLE `__new_reservation_submissions` RENAME TO `reservation_submissions`;--> statement-breakpoint
CREATE INDEX `idx_reservation_submissions_review_request_due` ON `reservation_submissions` (`site_id`,`status`,`completed_at`,`review_request_sent_at`);--> statement-breakpoint
CREATE INDEX `idx_reservation_submissions_review_reminder_due` ON `reservation_submissions` (`site_id`,`review_request_sent_at`,`review_reminder_sent_at`,`review_submitted_at`);--> statement-breakpoint
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
	CONSTRAINT "reviews_booking_type_check" CHECK(booking_type IS NULL OR booking_type IN ('reservation', 'experience_booking'))
);
--> statement-breakpoint
INSERT INTO `__new_reviews`("id", "organization_id", "site_id", "location_id", "customer_id", "booking_id", "booking_type", "review_request_id", "user_id", "menu_item_slug", "author_name", "reviewer_photo_url", "rating", "title", "content", "google_review_id", "owner_reply", "owner_reply_at", "photo_urls", "helpful_count", "status", "source", "ip_hash", "user_agent", "created_at", "updated_at") SELECT "id", "organization_id", "site_id", "location_id", NULL, NULL, NULL, NULL, NULL, "menu_item_slug", "author_name", "reviewer_photo_url", "rating", "title", "content", "google_review_id", "owner_reply", "owner_reply_at", "photo_urls", "helpful_count", "status", "source", "ip_hash", "user_agent", "created_at", "updated_at" FROM `reviews`;--> statement-breakpoint
DROP TABLE `reviews`;--> statement-breakpoint
ALTER TABLE `__new_reviews` RENAME TO `reviews`;--> statement-breakpoint
CREATE INDEX `idx_reviews_request_id` ON `reviews` (`review_request_id`);--> statement-breakpoint
CREATE INDEX `idx_reviews_customer_id` ON `reviews` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_reviews_location_status` ON `reviews` (`location_id`,`status`,`created_at`);
