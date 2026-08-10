DROP TRIGGER IF EXISTS `media_assets_scope_update`;--> statement-breakpoint

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
