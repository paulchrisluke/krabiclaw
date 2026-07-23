CREATE TABLE `site_link_items` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`link_page_id` text NOT NULL,
	`label` text NOT NULL,
	`destination` text NOT NULL,
	`description` text,
	`icon` text,
	`image_asset_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`link_page_id`) REFERENCES `site_link_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
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
	`bio` text,
	`profile_image_asset_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`robots` text DEFAULT 'noindex,follow' NOT NULL,
	`seo_title` text,
	`seo_description` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_image_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "site_link_pages_path_check" CHECK(path LIKE '/%' AND path NOT LIKE '//%'),
	CONSTRAINT "site_link_pages_status_check" CHECK(status IN ('draft', 'published', 'archived')),
	CONSTRAINT "site_link_pages_robots_check" CHECK(robots IN ('index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_link_pages_site_id_unique` ON `site_link_pages` (`site_id`);--> statement-breakpoint
CREATE INDEX `site_link_pages_site_status_idx` ON `site_link_pages` (`site_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_link_pages_organization_id_site_id_path_unique` ON `site_link_pages` (`organization_id`,`site_id`,`path`);