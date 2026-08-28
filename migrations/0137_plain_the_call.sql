PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_media_placements` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`slot` text NOT NULL,
	`asset_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`source_hash` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`asset_id`) REFERENCES `media_assets`(`organization_id`,`site_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "media_placements_owner_type_check" CHECK(owner_type IN ('site','business_location','product','post','blog_post','experience','offering','content_block','platform_doc','review','review_request','tenant_compliance','chowbot_message','platform','tenant_page')),
	CONSTRAINT "media_placements_slot_check" CHECK((owner_type = 'site' AND (slot IN ('logo','logo_dark','favicon','og_default','og_generated'))) OR (owner_type = 'business_location' AND (slot IN ('hero','gallery','og_generated'))) OR (owner_type = 'product' AND (slot IN ('image','gallery','og_generated'))) OR (owner_type = 'post' AND (slot IN ('cover','gallery','og_generated'))) OR (owner_type = 'blog_post' AND (slot IN ('featured','og_generated'))) OR (owner_type = 'experience' AND (slot IN ('gallery','og_generated'))) OR (owner_type = 'offering' AND (slot IN ('thumbnail','hero','gallery','og_generated') OR slot GLOB 'features.[0-9]*.image')) OR (owner_type = 'content_block' AND (slot IN ('media','gallery','background','featured','decoration') OR slot GLOB 'items.[0-9]*.image' OR slot GLOB 'images.[0-9]*' OR slot GLOB 'features.[0-9]*.icon' OR slot GLOB 'people.[0-9]*.image')) OR (owner_type = 'platform_doc' AND (slot IN ('featured','og_generated'))) OR (owner_type = 'review' AND (slot IN ('portrait','gallery','og_generated'))) OR (owner_type = 'review_request' AND (slot IN ('gallery','og_generated'))) OR (owner_type = 'tenant_compliance' AND (slot = 'document')) OR (owner_type = 'chowbot_message' AND (slot = 'attachment')) OR (owner_type = 'platform' AND (slot = 'og_generated')) OR (owner_type = 'tenant_page' AND (slot = 'og_generated'))),
	CONSTRAINT "media_placements_status_check" CHECK("__new_media_placements"."status" IN ('pending', 'active', 'rejected'))
);
--> statement-breakpoint
INSERT INTO `__new_media_placements`("id", "organization_id", "site_id", "owner_type", "owner_id", "slot", "asset_id", "sort_order", "status", "source_hash", "created_at", "updated_at") SELECT "id", "organization_id", "site_id", "owner_type", "owner_id", "slot", "asset_id", "sort_order", "status", "source_hash", "created_at", "updated_at" FROM `media_placements`;--> statement-breakpoint
DROP TABLE `media_placements`;--> statement-breakpoint
ALTER TABLE `__new_media_placements` RENAME TO `media_placements`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `media_placements_owner_idx` ON `media_placements` (`site_id`,`owner_type`,`owner_id`,`slot`,`sort_order`);--> statement-breakpoint
CREATE INDEX `media_placements_asset_idx` ON `media_placements` (`organization_id`,`site_id`,`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_placements_owner_slot_asset_unique` ON `media_placements` (`owner_type`,`owner_id`,`slot`,`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_placements_owner_slot_order_unique` ON `media_placements` (`owner_type`,`owner_id`,`slot`,`sort_order`);