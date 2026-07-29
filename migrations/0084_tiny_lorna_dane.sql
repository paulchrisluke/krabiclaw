CREATE INDEX IF NOT EXISTS `experience_media_asset_scope_idx` ON `experience_media` (`organization_id`,`site_id`,`asset_id`);--> statement-breakpoint

CREATE TRIGGER `business_locations_hero_media_scope_insert`
BEFORE INSERT ON `business_locations`
FOR EACH ROW
WHEN NEW.`hero_media_asset_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM `media_assets`
    WHERE `organization_id` = NEW.`organization_id`
      AND `site_id` = NEW.`site_id`
      AND `id` = NEW.`hero_media_asset_id`
  )
BEGIN
  SELECT RAISE(ABORT, 'business_locations.hero_media_asset_id must reference media in the same organization and site');
END;--> statement-breakpoint

CREATE TRIGGER `business_locations_hero_media_scope_update`
BEFORE UPDATE OF `organization_id`, `site_id`, `hero_media_asset_id` ON `business_locations`
FOR EACH ROW
WHEN NEW.`hero_media_asset_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM `media_assets`
    WHERE `organization_id` = NEW.`organization_id`
      AND `site_id` = NEW.`site_id`
      AND `id` = NEW.`hero_media_asset_id`
  )
BEGIN
  SELECT RAISE(ABORT, 'business_locations.hero_media_asset_id must reference media in the same organization and site');
END;--> statement-breakpoint

CREATE TRIGGER `business_locations_og_image_scope_insert`
BEFORE INSERT ON `business_locations`
FOR EACH ROW
WHEN NEW.`og_image_asset_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM `media_assets`
    WHERE `organization_id` = NEW.`organization_id`
      AND `site_id` = NEW.`site_id`
      AND `id` = NEW.`og_image_asset_id`
  )
BEGIN
  SELECT RAISE(ABORT, 'business_locations.og_image_asset_id must reference media in the same organization and site');
END;--> statement-breakpoint

CREATE TRIGGER `business_locations_og_image_scope_update`
BEFORE UPDATE OF `organization_id`, `site_id`, `og_image_asset_id` ON `business_locations`
FOR EACH ROW
WHEN NEW.`og_image_asset_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM `media_assets`
    WHERE `organization_id` = NEW.`organization_id`
      AND `site_id` = NEW.`site_id`
      AND `id` = NEW.`og_image_asset_id`
  )
BEGIN
  SELECT RAISE(ABORT, 'business_locations.og_image_asset_id must reference media in the same organization and site');
END;--> statement-breakpoint

CREATE TRIGGER `site_content_hero_media_scope_insert`
BEFORE INSERT ON `site_content`
FOR EACH ROW
WHEN NEW.`hero_media_asset_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM `media_assets`
    WHERE `organization_id` = NEW.`organization_id`
      AND `site_id` = NEW.`site_id`
      AND `id` = NEW.`hero_media_asset_id`
  )
BEGIN
  SELECT RAISE(ABORT, 'site_content.hero_media_asset_id must reference media in the same organization and site');
END;--> statement-breakpoint

CREATE TRIGGER `site_content_hero_media_scope_update`
BEFORE UPDATE OF `organization_id`, `site_id`, `hero_media_asset_id` ON `site_content`
FOR EACH ROW
WHEN NEW.`hero_media_asset_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM `media_assets`
    WHERE `organization_id` = NEW.`organization_id`
      AND `site_id` = NEW.`site_id`
      AND `id` = NEW.`hero_media_asset_id`
  )
BEGIN
  SELECT RAISE(ABORT, 'site_content.hero_media_asset_id must reference media in the same organization and site');
END;
