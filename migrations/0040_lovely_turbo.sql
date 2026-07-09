ALTER TABLE `blog_posts` ADD `seo_title` text;--> statement-breakpoint
ALTER TABLE `business_locations` ADD `seo_title` text;--> statement-breakpoint
ALTER TABLE `business_locations` ADD `seo_description` text;--> statement-breakpoint
ALTER TABLE `business_locations` ADD `canonical_url` text;--> statement-breakpoint
ALTER TABLE `business_locations` ADD `robots` text;--> statement-breakpoint
ALTER TABLE `business_locations` ADD `og_image_asset_id` text REFERENCES media_assets(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `experiences` ADD `canonical_url` text;--> statement-breakpoint
ALTER TABLE `experiences` ADD `robots` text;--> statement-breakpoint
ALTER TABLE `experiences` ADD `og_image_asset_id` text REFERENCES media_assets(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `menu_items` ADD `seo_title` text;--> statement-breakpoint
ALTER TABLE `menu_items` ADD `seo_description` text;--> statement-breakpoint
ALTER TABLE `menu_items` ADD `canonical_url` text;--> statement-breakpoint
ALTER TABLE `menu_items` ADD `robots` text;--> statement-breakpoint
ALTER TABLE `menu_items` ADD `og_image_asset_id` text REFERENCES media_assets(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `menus` ADD `seo_title` text;--> statement-breakpoint
ALTER TABLE `menus` ADD `seo_description` text;--> statement-breakpoint
ALTER TABLE `menus` ADD `canonical_url` text;--> statement-breakpoint
ALTER TABLE `menus` ADD `robots` text;--> statement-breakpoint
ALTER TABLE `platform_docs` ADD `nav_group` text;--> statement-breakpoint
ALTER TABLE `platform_docs` ADD `nav_group_order` integer;--> statement-breakpoint
ALTER TABLE `sites` ADD `seo_title` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `seo_description` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `canonical_url` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `robots` text;