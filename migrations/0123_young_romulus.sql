DROP TRIGGER IF EXISTS `media_assets_scope_update`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `business_locations_og_image_scope_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `business_locations_og_image_scope_update`;--> statement-breakpoint

ALTER TABLE `blog_posts` RENAME COLUMN `social_image_asset_id` TO `retired_share_asset_id`;--> statement-breakpoint
ALTER TABLE `business_locations` RENAME COLUMN `og_image_asset_id` TO `retired_share_asset_id`;--> statement-breakpoint
ALTER TABLE `experiences` RENAME COLUMN `og_image_asset_id` TO `retired_share_asset_id`;--> statement-breakpoint
ALTER TABLE `menu_items` RENAME COLUMN `og_image_asset_id` TO `retired_share_asset_id`;--> statement-breakpoint
ALTER TABLE `posts` RENAME COLUMN `og_image_asset_id` TO `retired_share_asset_id`;--> statement-breakpoint
ALTER TABLE `sites` RENAME COLUMN `og_image_asset_id` TO `retired_share_asset_id`;--> statement-breakpoint

UPDATE `blog_posts` SET `retired_share_asset_id` = NULL WHERE `retired_share_asset_id` IS NOT NULL;--> statement-breakpoint
UPDATE `business_locations` SET `retired_share_asset_id` = NULL WHERE `retired_share_asset_id` IS NOT NULL;--> statement-breakpoint
UPDATE `experiences` SET `retired_share_asset_id` = NULL WHERE `retired_share_asset_id` IS NOT NULL;--> statement-breakpoint
UPDATE `menu_items` SET `retired_share_asset_id` = NULL WHERE `retired_share_asset_id` IS NOT NULL;--> statement-breakpoint
UPDATE `posts` SET `retired_share_asset_id` = NULL WHERE `retired_share_asset_id` IS NOT NULL;--> statement-breakpoint
UPDATE `sites` SET `retired_share_asset_id` = NULL WHERE `retired_share_asset_id` IS NOT NULL;--> statement-breakpoint

CREATE TRIGGER `blog_posts_retired_share_asset_insert`
BEFORE INSERT ON `blog_posts`
FOR EACH ROW
WHEN NEW.`retired_share_asset_id` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'retired share asset storage is not writable');
END;--> statement-breakpoint
CREATE TRIGGER `blog_posts_retired_share_asset_update`
BEFORE UPDATE OF `retired_share_asset_id` ON `blog_posts`
FOR EACH ROW
WHEN NEW.`retired_share_asset_id` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'retired share asset storage is not writable');
END;--> statement-breakpoint

CREATE TRIGGER `business_locations_retired_share_asset_insert`
BEFORE INSERT ON `business_locations`
FOR EACH ROW
WHEN NEW.`retired_share_asset_id` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'retired share asset storage is not writable');
END;--> statement-breakpoint
CREATE TRIGGER `business_locations_retired_share_asset_update`
BEFORE UPDATE OF `retired_share_asset_id` ON `business_locations`
FOR EACH ROW
WHEN NEW.`retired_share_asset_id` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'retired share asset storage is not writable');
END;--> statement-breakpoint

CREATE TRIGGER `experiences_retired_share_asset_insert`
BEFORE INSERT ON `experiences`
FOR EACH ROW
WHEN NEW.`retired_share_asset_id` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'retired share asset storage is not writable');
END;--> statement-breakpoint
CREATE TRIGGER `experiences_retired_share_asset_update`
BEFORE UPDATE OF `retired_share_asset_id` ON `experiences`
FOR EACH ROW
WHEN NEW.`retired_share_asset_id` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'retired share asset storage is not writable');
END;--> statement-breakpoint

CREATE TRIGGER `menu_items_retired_share_asset_insert`
BEFORE INSERT ON `menu_items`
FOR EACH ROW
WHEN NEW.`retired_share_asset_id` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'retired share asset storage is not writable');
END;--> statement-breakpoint
CREATE TRIGGER `menu_items_retired_share_asset_update`
BEFORE UPDATE OF `retired_share_asset_id` ON `menu_items`
FOR EACH ROW
WHEN NEW.`retired_share_asset_id` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'retired share asset storage is not writable');
END;--> statement-breakpoint

CREATE TRIGGER `posts_retired_share_asset_insert`
BEFORE INSERT ON `posts`
FOR EACH ROW
WHEN NEW.`retired_share_asset_id` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'retired share asset storage is not writable');
END;--> statement-breakpoint
CREATE TRIGGER `posts_retired_share_asset_update`
BEFORE UPDATE OF `retired_share_asset_id` ON `posts`
FOR EACH ROW
WHEN NEW.`retired_share_asset_id` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'retired share asset storage is not writable');
END;--> statement-breakpoint

CREATE TRIGGER `sites_retired_share_asset_insert`
BEFORE INSERT ON `sites`
FOR EACH ROW
WHEN NEW.`retired_share_asset_id` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'retired share asset storage is not writable');
END;--> statement-breakpoint
CREATE TRIGGER `sites_retired_share_asset_update`
BEFORE UPDATE OF `retired_share_asset_id` ON `sites`
FOR EACH ROW
WHEN NEW.`retired_share_asset_id` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'retired share asset storage is not writable');
END;--> statement-breakpoint

CREATE TRIGGER `media_assets_scope_update`
BEFORE UPDATE OF `organization_id`, `site_id` ON `media_assets`
FOR EACH ROW
WHEN NEW.`organization_id` IS NOT OLD.`organization_id`
  OR NEW.`site_id` IS NOT OLD.`site_id`
BEGIN
  SELECT RAISE(ABORT, 'media_assets organization_id/site_id update would break scoped business location media references')
  WHERE EXISTS (
    SELECT 1 FROM `business_locations`
    WHERE `hero_media_asset_id` = OLD.`id`
      AND (`organization_id` != NEW.`organization_id` OR `site_id` != NEW.`site_id`)
  );

  SELECT RAISE(ABORT, 'media_assets organization_id/site_id update would break scoped experience media references')
  WHERE EXISTS (
    SELECT 1 FROM `experience_media`
    WHERE `asset_id` = OLD.`id`
      AND (`organization_id` != NEW.`organization_id` OR `site_id` != NEW.`site_id`)
  );
END;
