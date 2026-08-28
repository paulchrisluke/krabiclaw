CREATE UNIQUE INDEX `business_locations_organization_id_site_id_id_unique`
ON `business_locations` (`organization_id`,`site_id`,`id`);--> statement-breakpoint

CREATE TRIGGER `sites_default_currency_insert_guard`
BEFORE INSERT ON `sites`
WHEN NEW.`default_currency` IS NULL OR NEW.`default_currency` NOT IN ('THB','USD','EUR','GBP','JPY','AUD','CAD','SGD','HKD','MYR','IDR','PHP','VND','INR')
BEGIN
  SELECT RAISE(ABORT, 'sites.default_currency must be a supported currency');
END;--> statement-breakpoint

CREATE TRIGGER `sites_default_currency_update_guard`
BEFORE UPDATE OF `default_currency` ON `sites`
WHEN NEW.`default_currency` IS NULL OR NEW.`default_currency` NOT IN ('THB','USD','EUR','GBP','JPY','AUD','CAD','SGD','HKD','MYR','IDR','PHP','VND','INR')
BEGIN
  SELECT RAISE(ABORT, 'sites.default_currency must be a supported currency');
END;--> statement-breakpoint

CREATE TABLE `products` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `site_id` text NOT NULL,
  `location_id` text NOT NULL,
  `category` text NOT NULL,
  `name` text NOT NULL,
  `slug` text NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `price_amount` text NOT NULL,
  `compare_at_price_amount` text,
  `sale_starts_at` text,
  `sale_ends_at` text,
  `order_url` text,
  `is_visible` integer DEFAULT 1 NOT NULL,
  `available` integer DEFAULT 1 NOT NULL,
  `featured` integer DEFAULT 0 NOT NULL,
  `featured_sort_order` integer DEFAULT 0 NOT NULL,
  `sort_order` integer NOT NULL,
  `tags_json` text DEFAULT '[]' NOT NULL,
  `details_json` text DEFAULT '[]' NOT NULL,
  `seo_title` text,
  `seo_description` text,
  `canonical_url` text,
  `robots` text,
  `source` text DEFAULT 'manual' NOT NULL,
  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `created_by` text NOT NULL,
  `updated_by` text NOT NULL,
  FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE cascade,
  FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON DELETE cascade,
  FOREIGN KEY (`location_id`) REFERENCES `business_locations`(`id`) ON DELETE cascade,
  CONSTRAINT `products_location_scope_fk` FOREIGN KEY (`organization_id`,`site_id`,`location_id`) REFERENCES `business_locations`(`organization_id`,`site_id`,`id`) ON DELETE cascade,
  CONSTRAINT `products_category_not_blank_check` CHECK(trim(`category`) <> ''),
  CONSTRAINT `products_name_not_blank_check` CHECK(trim(`name`) <> ''),
  CONSTRAINT `products_slug_check` CHECK(`slug` <> '' AND `slug` = lower(`slug`) AND `slug` NOT GLOB '*[^a-z0-9-]*' AND `slug` NOT LIKE '-%' AND `slug` NOT LIKE '%-' AND `slug` NOT LIKE '%--%'),
  CONSTRAINT `products_sort_order_check` CHECK(`sort_order` >= 0),
  CONSTRAINT `products_featured_sort_order_check` CHECK(`featured_sort_order` >= 0),
  CONSTRAINT `products_boolean_check` CHECK(`is_visible` IN (0,1) AND `available` IN (0,1) AND `featured` IN (0,1)),
  CONSTRAINT `products_price_amount_check` CHECK(`price_amount` <> '' AND `price_amount` NOT GLOB '*[^0-9.]*' AND `price_amount` NOT LIKE '%.0' AND (`price_amount` = '0' OR (`price_amount` NOT LIKE '0%' AND instr(`price_amount`, '.') = 0) OR (`price_amount` LIKE '0.%' AND length(`price_amount`) > 2 AND instr(substr(`price_amount`, 3), '.') = 0 AND substr(`price_amount`, -1) <> '0') OR (`price_amount` NOT LIKE '0%' AND instr(`price_amount`, '.') > 1 AND instr(substr(`price_amount`, instr(`price_amount`, '.') + 1), '.') = 0 AND substr(`price_amount`, -1) <> '0'))),
  CONSTRAINT `products_compare_at_price_check` CHECK(`compare_at_price_amount` IS NULL OR (`compare_at_price_amount` <> '' AND `compare_at_price_amount` NOT GLOB '*[^0-9.]*' AND `compare_at_price_amount` NOT LIKE '%.0' AND (`compare_at_price_amount` = '0' OR (`compare_at_price_amount` NOT LIKE '0%' AND instr(`compare_at_price_amount`, '.') = 0) OR (`compare_at_price_amount` LIKE '0.%' AND length(`compare_at_price_amount`) > 2 AND instr(substr(`compare_at_price_amount`, 3), '.') = 0 AND substr(`compare_at_price_amount`, -1) <> '0') OR (`compare_at_price_amount` NOT LIKE '0%' AND instr(`compare_at_price_amount`, '.') > 1 AND instr(substr(`compare_at_price_amount`, instr(`compare_at_price_amount`, '.') + 1), '.') = 0 AND substr(`compare_at_price_amount`, -1) <> '0')) AND CAST(`compare_at_price_amount` AS REAL) > CAST(`price_amount` AS REAL))),
  CONSTRAINT `products_sale_dates_check` CHECK((`compare_at_price_amount` IS NOT NULL OR (`sale_starts_at` IS NULL AND `sale_ends_at` IS NULL)) AND (`sale_starts_at` IS NULL OR (length(`sale_starts_at`) = 10 AND `sale_starts_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND strftime('%Y-%m-%d', `sale_starts_at`) = `sale_starts_at`)) AND (`sale_ends_at` IS NULL OR (length(`sale_ends_at`) = 10 AND `sale_ends_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND strftime('%Y-%m-%d', `sale_ends_at`) = `sale_ends_at`)) AND (`sale_starts_at` IS NULL OR `sale_ends_at` IS NULL OR `sale_ends_at` >= `sale_starts_at`)),
  CONSTRAINT `products_tags_json_check` CHECK(json_valid(`tags_json`) AND json_type(`tags_json`) = 'array'),
  CONSTRAINT `products_details_json_check` CHECK(json_valid(`details_json`) AND json_type(`details_json`) = 'array'),
  CONSTRAINT `products_source_check` CHECK(`source` IN ('manual','template','ai','import','copy')),
  CONSTRAINT `products_order_url_check` CHECK(`order_url` IS NULL OR (`order_url` LIKE 'https://_%' AND instr(`order_url`, '@') = 0 AND instr(`order_url`, char(10)) = 0 AND instr(`order_url`, char(13)) = 0)),
  CONSTRAINT `products_robots_check` CHECK(`robots` IS NULL OR `robots` IN ('index,follow','noindex,follow','index,nofollow','noindex,nofollow'))
);--> statement-breakpoint

INSERT INTO `products` (`id`,`organization_id`,`site_id`,`location_id`,`category`,`name`,`slug`,`description`,`price_amount`,`compare_at_price_amount`,`sale_starts_at`,`sale_ends_at`,`order_url`,`is_visible`,`available`,`featured`,`featured_sort_order`,`sort_order`,`tags_json`,`details_json`,`seo_title`,`seo_description`,`canonical_url`,`robots`,`source`,`created_at`,`updated_at`,`created_by`,`updated_by`)
SELECT
  mi.`id`,m.`organization_id`,m.`site_id`,m.`location_id`,trim(mi.`section`),trim(mi.`name`),trim(mi.`slug`),COALESCE(mi.`description`,''),
  CASE WHEN instr(trim(CAST(mi.`price_amount` AS text)),'.') = 0 THEN trim(CAST(mi.`price_amount` AS text)) ELSE rtrim(rtrim(trim(CAST(mi.`price_amount` AS text)),'0'),'.') END,
  CASE WHEN mi.`compare_at_price_amount` IS NULL THEN NULL WHEN instr(trim(CAST(mi.`compare_at_price_amount` AS text)),'.') = 0 THEN trim(CAST(mi.`compare_at_price_amount` AS text)) ELSE rtrim(rtrim(trim(CAST(mi.`compare_at_price_amount` AS text)),'0'),'.') END,
  mi.`sale_starts_at`,mi.`sale_ends_at`,NULL,m.`is_visible`,mi.`available`,mi.`featured`,mi.`featured_sort_order`,
  ROW_NUMBER() OVER (PARTITION BY m.`site_id`,m.`location_id` ORDER BY (SELECT CAST(j.`key` AS integer) FROM json_each(m.`section_order`) j WHERE j.`value` = mi.`section` LIMIT 1),mi.`sort_order`,lower(trim(mi.`name`)),mi.`id`) - 1,
  COALESCE(mi.`dietary_notes`,'[]'),
  COALESCE((SELECT json_group_array(json(detail)) FROM (
    SELECT 1 AS position, json_object('key','allergens','label','Allergens','values',json(mi.`allergens`)) AS detail WHERE mi.`allergens` IS NOT NULL AND json_array_length(mi.`allergens`) > 0
    UNION ALL SELECT 2, json_object('key','ingredients','label','Ingredients','values',json(mi.`ingredients`)) WHERE mi.`ingredients` IS NOT NULL AND json_array_length(mi.`ingredients`) > 0
    UNION ALL SELECT 3, json_object('key','preparation','label','Preparation','values',json_array(trim(mi.`preparation`))) WHERE mi.`preparation` IS NOT NULL
    UNION ALL SELECT 4, json_object('key','serving','label','Serving','values',json_array(trim(mi.`serving_note`))) WHERE mi.`serving_note` IS NOT NULL
    ORDER BY position
  )),'[]'),
  mi.`seo_title`,mi.`seo_description`,mi.`canonical_url`,mi.`robots`,mi.`source`,mi.`created_at`,mi.`updated_at`,
  COALESCE(NULLIF(trim(mi.`created_by`),''),'migration:menu-to-products'),
  COALESCE(NULLIF(trim(mi.`updated_by`),''),NULLIF(trim(mi.`created_by`),''),'migration:menu-to-products')
FROM `menu_items` mi JOIN `menus` m ON m.`id` = mi.`menu_id`;--> statement-breakpoint

CREATE INDEX `products_site_location_visible_sort_idx` ON `products` (`site_id`,`location_id`,`is_visible`,`sort_order`);--> statement-breakpoint
CREATE INDEX `products_site_location_featured_sort_idx` ON `products` (`site_id`,`location_id`,`featured`,`featured_sort_order`);--> statement-breakpoint
CREATE INDEX `products_organization_site_idx` ON `products` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_site_location_slug_unique` ON `products` (`site_id`,`location_id`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_site_location_sort_order_unique` ON `products` (`site_id`,`location_id`,`sort_order`);--> statement-breakpoint

UPDATE `reviews` SET
  `organization_id` = (SELECT p.`organization_id` FROM `products` p WHERE p.`slug` = `reviews`.`menu_item_slug` AND (`reviews`.`site_id` IS NULL OR p.`site_id` = `reviews`.`site_id`) AND (`reviews`.`location_id` IS NULL OR p.`location_id` = `reviews`.`location_id`) LIMIT 1),
  `site_id` = (SELECT p.`site_id` FROM `products` p WHERE p.`slug` = `reviews`.`menu_item_slug` AND (`reviews`.`site_id` IS NULL OR p.`site_id` = `reviews`.`site_id`) AND (`reviews`.`location_id` IS NULL OR p.`location_id` = `reviews`.`location_id`) LIMIT 1),
  `location_id` = (SELECT p.`location_id` FROM `products` p WHERE p.`slug` = `reviews`.`menu_item_slug` AND (`reviews`.`site_id` IS NULL OR p.`site_id` = `reviews`.`site_id`) AND (`reviews`.`location_id` IS NULL OR p.`location_id` = `reviews`.`location_id`) LIMIT 1),
  `menu_item_slug` = (SELECT p.`id` FROM `products` p WHERE p.`slug` = `reviews`.`menu_item_slug` AND (`reviews`.`site_id` IS NULL OR p.`site_id` = `reviews`.`site_id`) AND (`reviews`.`location_id` IS NULL OR p.`location_id` = `reviews`.`location_id`) LIMIT 1)
WHERE `menu_item_slug` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `reviews` RENAME COLUMN `menu_item_slug` TO `product_id`;--> statement-breakpoint
CREATE INDEX `idx_reviews_product_status_created` ON `reviews` (`product_id`,`status`,`created_at`);--> statement-breakpoint

CREATE TRIGGER `reviews_product_scope_insert_guard` BEFORE INSERT ON `reviews`
WHEN NEW.`product_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `products` p WHERE p.`id` = NEW.`product_id` AND p.`organization_id` = NEW.`organization_id` AND p.`site_id` = NEW.`site_id` AND p.`location_id` = NEW.`location_id`)
BEGIN SELECT RAISE(ABORT, 'Product review scope does not match Product ownership'); END;--> statement-breakpoint
CREATE TRIGGER `reviews_product_scope_update_guard` BEFORE UPDATE OF `product_id`,`organization_id`,`site_id`,`location_id` ON `reviews`
WHEN NEW.`product_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `products` p WHERE p.`id` = NEW.`product_id` AND p.`organization_id` = NEW.`organization_id` AND p.`site_id` = NEW.`site_id` AND p.`location_id` = NEW.`location_id`)
BEGIN SELECT RAISE(ABORT, 'Product review scope does not match Product ownership'); END;--> statement-breakpoint
CREATE TRIGGER `products_delete_review_guard` BEFORE DELETE ON `products`
WHEN EXISTS (SELECT 1 FROM `reviews` r WHERE r.`product_id` = OLD.`id`)
BEGIN SELECT RAISE(ABORT, 'Delete Product reviews before deleting the Product'); END;--> statement-breakpoint

CREATE TABLE `__new_media_placements` (
  `id` text PRIMARY KEY NOT NULL,`organization_id` text NOT NULL,`site_id` text NOT NULL,`owner_type` text NOT NULL,`owner_id` text NOT NULL,`slot` text NOT NULL,`asset_id` text NOT NULL,`sort_order` integer DEFAULT 0 NOT NULL,`status` text DEFAULT 'active' NOT NULL,`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE cascade,FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON DELETE cascade,
  CONSTRAINT `media_placements_asset_scope_fk` FOREIGN KEY (`organization_id`,`site_id`,`asset_id`) REFERENCES `media_assets`(`organization_id`,`site_id`,`id`) ON DELETE cascade,
  CONSTRAINT `media_placements_owner_type_check` CHECK(`owner_type` IN ('site','business_location','product','post','blog_post','experience','offering','content_block','platform_doc','review','review_request','tenant_compliance','chowbot_message')),
  CONSTRAINT `media_placements_slot_check` CHECK((`owner_type` = 'site' AND `slot` IN ('logo','logo_dark','favicon')) OR (`owner_type` = 'business_location' AND `slot` IN ('hero','gallery')) OR (`owner_type` = 'product' AND `slot` IN ('image','gallery')) OR (`owner_type` = 'post' AND `slot` IN ('cover','gallery')) OR (`owner_type` = 'blog_post' AND `slot` = 'featured') OR (`owner_type` = 'experience' AND `slot` = 'gallery') OR (`owner_type` = 'offering' AND (`slot` IN ('thumbnail','hero','gallery') OR `slot` GLOB 'features.[0-9]*.image')) OR (`owner_type` = 'content_block' AND (`slot` IN ('media','gallery','background','featured','decoration') OR `slot` GLOB 'items.[0-9]*.image' OR `slot` GLOB 'images.[0-9]*' OR `slot` GLOB 'features.[0-9]*.icon' OR `slot` GLOB 'people.[0-9]*.image')) OR (`owner_type` = 'platform_doc' AND `slot` = 'featured') OR (`owner_type` = 'review' AND `slot` IN ('portrait','gallery')) OR (`owner_type` = 'review_request' AND `slot` = 'gallery') OR (`owner_type` = 'tenant_compliance' AND `slot` = 'document') OR (`owner_type` = 'chowbot_message' AND `slot` = 'attachment')),
  CONSTRAINT `media_placements_status_check` CHECK(`status` IN ('pending','active','rejected'))
);--> statement-breakpoint
INSERT INTO `__new_media_placements` (`id`,`organization_id`,`site_id`,`owner_type`,`owner_id`,`slot`,`asset_id`,`sort_order`,`status`,`created_at`,`updated_at`)
SELECT `id`,`organization_id`,`site_id`,CASE WHEN `owner_type` = 'menu_item' THEN 'product' ELSE `owner_type` END,`owner_id`,`slot`,`asset_id`,`sort_order`,`status`,`created_at`,`updated_at` FROM `media_placements`;--> statement-breakpoint
INSERT INTO `__new_media_placements` (`id`,`organization_id`,`site_id`,`owner_type`,`owner_id`,`slot`,`asset_id`,`sort_order`,`status`,`created_at`,`updated_at`)
SELECT 'product-image-' || ranked.`placement_id`,ranked.`organization_id`,ranked.`site_id`,'product',ranked.`product_id`,'image',ranked.`asset_id`,0,'active',ranked.`created_at`,ranked.`updated_at`
FROM (SELECT mp.`id` AS placement_id,mp.`organization_id`,mp.`site_id`,mp.`owner_id` AS product_id,mp.`asset_id`,mp.`created_at`,mp.`updated_at`,ROW_NUMBER() OVER (PARTITION BY mp.`owner_id` ORDER BY mp.`sort_order`,mp.`id`) AS position FROM `media_placements` mp JOIN `media_assets` ma ON ma.`id` = mp.`asset_id` AND ma.`organization_id` = mp.`organization_id` AND ma.`site_id` = mp.`site_id` WHERE mp.`owner_type` = 'menu_item' AND mp.`slot` = 'gallery' AND mp.`status` = 'active' AND ma.`status` = 'active' AND ((ma.`kind` = 'image' AND trim(COALESCE(ma.`public_url`,'')) <> '') OR (ma.`kind` = 'video' AND trim(COALESCE(ma.`public_url`,'')) <> '' AND trim(COALESCE(ma.`thumbnail_url`,'')) <> ''))) ranked
WHERE ranked.`position` = 1;--> statement-breakpoint
DROP TABLE `media_placements`;--> statement-breakpoint
ALTER TABLE `__new_media_placements` RENAME TO `media_placements`;--> statement-breakpoint
CREATE INDEX `media_placements_owner_idx` ON `media_placements` (`site_id`,`owner_type`,`owner_id`,`slot`,`sort_order`);--> statement-breakpoint
CREATE INDEX `media_placements_asset_idx` ON `media_placements` (`organization_id`,`site_id`,`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_placements_owner_slot_asset_unique` ON `media_placements` (`owner_type`,`owner_id`,`slot`,`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_placements_owner_slot_order_unique` ON `media_placements` (`owner_type`,`owner_id`,`slot`,`sort_order`);--> statement-breakpoint

UPDATE `sites` SET `feature_overrides` = json_set(`feature_overrides`,'$.enabled',json(COALESCE((SELECT json_group_array(value) FROM (SELECT CASE WHEN value = 'menu' THEN 'products' ELSE value END AS value,MIN(CAST(key AS integer)) AS position FROM json_each(`sites`.`feature_overrides`,'$.enabled') GROUP BY CASE WHEN value = 'menu' THEN 'products' ELSE value END ORDER BY position)),'[]')),'$.disabled',json(COALESCE((SELECT json_group_array(value) FROM (SELECT CASE WHEN value = 'menu' THEN 'products' ELSE value END AS value,MIN(CAST(key AS integer)) AS position FROM json_each(`sites`.`feature_overrides`,'$.disabled') GROUP BY CASE WHEN value = 'menu' THEN 'products' ELSE value END ORDER BY position)),'[]'))) WHERE `feature_overrides` IS NOT NULL;--> statement-breakpoint
UPDATE `business_locations` SET `feature_overrides` = json_set(`feature_overrides`,'$.enabled',json(COALESCE((SELECT json_group_array(value) FROM (SELECT CASE WHEN value = 'menu' THEN 'products' ELSE value END AS value,MIN(CAST(key AS integer)) AS position FROM json_each(`business_locations`.`feature_overrides`,'$.enabled') GROUP BY CASE WHEN value = 'menu' THEN 'products' ELSE value END ORDER BY position)),'[]')),'$.disabled',json(COALESCE((SELECT json_group_array(value) FROM (SELECT CASE WHEN value = 'menu' THEN 'products' ELSE value END AS value,MIN(CAST(key AS integer)) AS position FROM json_each(`business_locations`.`feature_overrides`,'$.disabled') GROUP BY CASE WHEN value = 'menu' THEN 'products' ELSE value END ORDER BY position)),'[]'))) WHERE `feature_overrides` IS NOT NULL;--> statement-breakpoint

UPDATE `onboarding_drafts` SET `payload_json` = json_remove(json_set(`payload_json`,'$.preview.products',json(COALESCE((SELECT json_group_array(json(product)) FROM (SELECT json_remove(json_set(item.`value`,'$.location_id',(SELECT json_extract(location.`value`,'$.id') FROM json_each(`onboarding_drafts`.`payload_json`,'$.preview.locations') location WHERE json_extract(location.`value`,'$.is_primary') = 1 LIMIT 1),'$.category',json_extract(item.`value`,'$.section'),'$.price_amount',CASE WHEN instr(trim(CAST(json_extract(item.`value`,'$.price_amount') AS text)),'.') = 0 THEN trim(CAST(json_extract(item.`value`,'$.price_amount') AS text)) ELSE rtrim(rtrim(trim(CAST(json_extract(item.`value`,'$.price_amount') AS text)),'0'),'.') END,'$.compare_at_price_amount',NULL,'$.sale_starts_at',NULL,'$.sale_ends_at',NULL,'$.order_url',NULL,'$.is_visible',json('true'),'$.featured',json('false'),'$.featured_sort_order',0,'$.tags',json('[]'),'$.details',json('[]'),'$.source','import'),'$.section') AS product FROM json_each(`onboarding_drafts`.`payload_json`,'$.preview.menu.items') item ORDER BY CAST(item.`key` AS integer))),'[]'))),'$.preview.menu') WHERE json_type(`payload_json`,'$.preview.menu') IS NOT NULL;--> statement-breakpoint

INSERT INTO `public_resource_cache_invalidations` (`id`,`site_id`,`reason`,`status`,`attempt_count`,`created_at`) SELECT lower(hex(randomblob(16))),p.`site_id`,'product-domain-cutover','pending',0,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM `products` p GROUP BY p.`site_id`;--> statement-breakpoint
UPDATE `work_requests` SET `type` = 'product_update' WHERE `type` = 'menu_update';--> statement-breakpoint
DROP TABLE `menu_items`;--> statement-breakpoint
DROP TABLE `menus`;--> statement-breakpoint
