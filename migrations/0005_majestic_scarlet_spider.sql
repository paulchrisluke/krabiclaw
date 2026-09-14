CREATE TABLE `broadcast_deliveries` (
	`broadcast_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`provider_message_id` text,
	`error` text,
	`sent_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`broadcast_id`, `user_id`),
	FOREIGN KEY (`broadcast_id`) REFERENCES `broadcasts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "broadcast_deliveries_status_check" CHECK(status IN ('sent', 'failed')),
	CONSTRAINT "broadcast_deliveries_sent_at_check" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', sent_at, '+0 days') IS sent_at)
);
--> statement-breakpoint
CREATE TABLE `broadcasts` (
	`id` text PRIMARY KEY NOT NULL,
	`content_document_id` text NOT NULL,
	`category` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`content_document_id`) REFERENCES `content_documents`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "broadcasts_category_check" CHECK(category IN ('account_security', 'reservations_bookings', 'guest_messages', 'reviews', 'site_and_billing', 'product_news')),
	CONSTRAINT "broadcasts_created_at_check" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `broadcasts_content_document_id_unique` ON `broadcasts` (`content_document_id`);--> statement-breakpoint
CREATE TABLE `user_notification_preferences` (
	`user_id` text NOT NULL,
	`category` text NOT NULL,
	`email_enabled` integer NOT NULL,
	`whatsapp_enabled` integer NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`user_id`, `category`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_notification_preferences_category_check" CHECK(category IN ('account_security', 'reservations_bookings', 'guest_messages', 'reviews', 'site_and_billing', 'product_news')),
	CONSTRAINT "user_notification_preferences_updated_at_check" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at),
	CONSTRAINT "user_notification_preferences_account_security_check" CHECK(category != 'account_security' OR email_enabled = 1)
);
