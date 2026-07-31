CREATE INDEX IF NOT EXISTS `experience_media_asset_scope_idx` ON `experience_media` (`organization_id`,`site_id`,`asset_id`);--> statement-breakpoint

CREATE TRIGGER `media_assets_scope_update`
BEFORE UPDATE OF `organization_id`, `site_id` ON `media_assets`
FOR EACH ROW
WHEN NEW.`organization_id` IS NOT OLD.`organization_id`
  OR NEW.`site_id` IS NOT OLD.`site_id`
BEGIN
  SELECT RAISE(ABORT, 'media_assets organization_id/site_id update would break scoped business location media references')
  WHERE EXISTS (
    SELECT 1
    FROM `business_locations`
    WHERE (
      `hero_media_asset_id` = OLD.`id`
      OR `og_image_asset_id` = OLD.`id`
    )
    AND (
      `organization_id` != NEW.`organization_id`
      OR `site_id` != NEW.`site_id`
    )
  );

  SELECT RAISE(ABORT, 'media_assets organization_id/site_id update would break scoped site content media references')
  WHERE EXISTS (
    SELECT 1
    FROM `site_content`
    WHERE `hero_media_asset_id` = OLD.`id`
      AND (
        `organization_id` != NEW.`organization_id`
        OR `site_id` != NEW.`site_id`
      )
  );

  SELECT RAISE(ABORT, 'media_assets organization_id/site_id update would break scoped experience media references')
  WHERE EXISTS (
    SELECT 1
    FROM `experience_media`
    WHERE `asset_id` = OLD.`id`
      AND (
        `organization_id` != NEW.`organization_id`
        OR `site_id` != NEW.`site_id`
      )
  );

  SELECT RAISE(ABORT, 'media_assets organization_id/site_id update would break scoped experiences media references')
  WHERE EXISTS (
    SELECT 1
    FROM `experiences`
    WHERE `og_image_asset_id` = OLD.`id`
      AND (
      `organization_id` != NEW.`organization_id`
      OR `site_id` != NEW.`site_id`
    )
  );
END;--> statement-breakpoint

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
