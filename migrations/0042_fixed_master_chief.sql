PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_location_qa` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text,
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
	CONSTRAINT "location_qa_source_check" CHECK(source IN ('gmb','google_maps','manual','llm_generated','manual_override','template','import')),
	CONSTRAINT "location_qa_status_check" CHECK(status IN ('published','hidden'))
);
--> statement-breakpoint
INSERT INTO `__new_location_qa`("id", "organization_id", "site_id", "location_id", "google_question_id", "question", "question_author", "question_date", "answer", "answer_author", "answer_date", "is_owner_answer", "upvote_count", "source", "status", "sort_order", "created_at", "updated_at") SELECT "id", "organization_id", "site_id", "location_id", "google_question_id", "question", "question_author", "question_date", "answer", "answer_author", "answer_date", "is_owner_answer", "upvote_count", "source", "status", "sort_order", "created_at", "updated_at" FROM `location_qa`;--> statement-breakpoint
DROP TABLE `location_qa`;--> statement-breakpoint
ALTER TABLE `__new_location_qa` RENAME TO `location_qa`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_location_qa_google_id` ON `location_qa` (`google_question_id`) WHERE google_question_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_location_qa_location` ON `location_qa` (`location_id`,`status`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_location_qa_site` ON `location_qa` (`site_id`,`status`,`sort_order`) WHERE location_id IS NULL;--> statement-breakpoint
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
INSERT INTO `__new_reviews`("id", "organization_id", "site_id", "location_id", "customer_id", "booking_id", "booking_type", "review_request_id", "user_id", "menu_item_slug", "author_name", "reviewer_photo_url", "rating", "title", "content", "google_review_id", "owner_reply", "owner_reply_at", "photo_urls", "helpful_count", "status", "source", "entered_by_user_id", "collection_method", "original_review_date", "original_reference", "publication_authorized", "ip_hash", "user_agent", "created_at", "updated_at") SELECT "id", "organization_id", "site_id", "location_id", "customer_id", "booking_id", "booking_type", "review_request_id", "user_id", "menu_item_slug", "author_name", "reviewer_photo_url", "rating", "title", "content", "google_review_id", "owner_reply", "owner_reply_at", "photo_urls", "helpful_count", "status", "source", NULL, NULL, NULL, NULL, 0, "ip_hash", "user_agent", "created_at", "updated_at" FROM `reviews`;--> statement-breakpoint
DROP TABLE `reviews`;--> statement-breakpoint
ALTER TABLE `__new_reviews` RENAME TO `reviews`;--> statement-breakpoint
CREATE INDEX `idx_reviews_request_id` ON `reviews` (`review_request_id`);--> statement-breakpoint
CREATE INDEX `idx_reviews_customer_id` ON `reviews` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_reviews_location_status` ON `reviews` (`location_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_reviews_site_status` ON `reviews` (`site_id`,`status`,`created_at`) WHERE location_id IS NULL;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_tenant_redirects` (
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
INSERT INTO `__new_tenant_redirects`("id", "organization_id", "site_id", "from_path", "to_path", "status_code", "behavior", "reason", "source", "created_at", "updated_at") SELECT "id", "organization_id", "site_id", "from_path", "to_path", "status_code", "behavior", "reason", "source", "created_at", "updated_at" FROM `tenant_redirects`;--> statement-breakpoint
DROP TABLE `tenant_redirects`;--> statement-breakpoint
ALTER TABLE `__new_tenant_redirects` RENAME TO `tenant_redirects`;--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_redirects_site_from_path_unique` ON `tenant_redirects` (`site_id`,`from_path`);
