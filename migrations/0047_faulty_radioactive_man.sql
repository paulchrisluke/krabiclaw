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
INSERT INTO `__new_location_qa`("id", "organization_id", "site_id", "location_id", "page_path", "google_question_id", "question", "question_author", "question_date", "answer", "answer_author", "answer_date", "is_owner_answer", "upvote_count", "source", "status", "sort_order", "created_at", "updated_at") SELECT "id", "organization_id", "site_id", "location_id", NULL, "google_question_id", "question", "question_author", "question_date", "answer", "answer_author", "answer_date", "is_owner_answer", "upvote_count", "source", "status", "sort_order", "created_at", "updated_at" FROM `location_qa`;--> statement-breakpoint
DROP TABLE `location_qa`;--> statement-breakpoint
ALTER TABLE `__new_location_qa` RENAME TO `location_qa`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_location_qa_google_id` ON `location_qa` (`google_question_id`) WHERE google_question_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_location_qa_location` ON `location_qa` (`location_id`,`status`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_location_qa_site` ON `location_qa` (`site_id`,`status`,`sort_order`) WHERE location_id IS NULL;--> statement-breakpoint
CREATE INDEX `idx_location_qa_page` ON `location_qa` (`site_id`,`page_path`,`status`,`sort_order`) WHERE location_id IS NULL AND page_path IS NOT NULL;
