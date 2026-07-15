CREATE TRIGGER `media_assets_category_insert_guard`
BEFORE INSERT ON `media_assets`
WHEN NEW.`category` IS NOT NULL
  AND NEW.`category` NOT IN ('exterior', 'interior', 'food', 'menu', 'team', 'other', 'logo', 'blog')
BEGIN
  SELECT RAISE(ABORT, 'media_assets category is invalid');
END;
--> statement-breakpoint
CREATE TRIGGER `media_assets_category_update_guard`
BEFORE UPDATE OF `category` ON `media_assets`
WHEN NEW.`category` IS NOT NULL
  AND NEW.`category` NOT IN ('exterior', 'interior', 'food', 'menu', 'team', 'other', 'logo', 'blog')
BEGIN
  SELECT RAISE(ABORT, 'media_assets category is invalid');
END;
