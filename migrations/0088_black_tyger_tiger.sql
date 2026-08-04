CREATE TABLE `menu_item_media` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` text NOT NULL,
	`menu_item_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`,`asset_id`) REFERENCES `media_assets`(`organization_id`,`site_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `menu_item_media_menu_item_order_idx` ON `menu_item_media` (`menu_item_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `menu_item_media_asset_scope_idx` ON `menu_item_media` (`organization_id`,`site_id`,`asset_id`);--> statement-breakpoint
CREATE INDEX `menu_item_media_site_menu_item_idx` ON `menu_item_media` (`site_id`,`menu_item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `menu_item_media_menu_item_asset_unique` ON `menu_item_media` (`menu_item_id`,`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `menu_item_media_menu_item_sort_unique` ON `menu_item_media` (`menu_item_id`,`sort_order`);--> statement-breakpoint
INSERT INTO `menu_item_media` (`id`, `organization_id`, `site_id`, `menu_item_id`, `asset_id`, `sort_order`, `created_at`, `updated_at`)
SELECT
	lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
	m.organization_id,
	m.site_id,
	mi.id,
	mi.image_asset_id,
	0,
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `menu_items` mi
JOIN `menus` m ON m.id = mi.menu_id
JOIN `media_assets` ma
	ON ma.id = mi.image_asset_id
	AND ma.organization_id = m.organization_id
	AND ma.site_id = m.site_id
	AND ma.status = 'active'
	AND ma.kind IN ('image', 'video')
WHERE mi.image_asset_id IS NOT NULL;
