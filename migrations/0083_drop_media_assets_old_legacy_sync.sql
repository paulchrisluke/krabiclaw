-- After every historical FK has been retargeted or dropped, remove the legacy
-- mirror table and its sync triggers. Fail before the drop if any old FK target
-- remains.

DROP TRIGGER IF EXISTS `sync_media_assets_old_delete`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_media_assets_old_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_media_assets_old_update`;--> statement-breakpoint

CREATE TABLE `__um_assert_0080` (`violation` text NOT NULL CHECK (`violation` = ''));--> statement-breakpoint
INSERT INTO `__um_assert_0080` (`violation`)
SELECT 'foreign keys still target media_assets_old'
WHERE (
	SELECT COUNT(*) FROM pragma_foreign_key_list('business_locations') WHERE "table" = 'media_assets_old'
) + (
	SELECT COUNT(*) FROM pragma_foreign_key_list('site_content') WHERE "table" = 'media_assets_old'
) + (
	SELECT COUNT(*) FROM pragma_foreign_key_list('experiences') WHERE "table" = 'media_assets_old'
) + (
	SELECT COUNT(*) FROM pragma_foreign_key_list('blog_posts') WHERE "table" = 'media_assets_old'
) + (
	SELECT COUNT(*) FROM pragma_foreign_key_list('menu_items') WHERE "table" = 'media_assets_old'
) + (
	SELECT COUNT(*) FROM pragma_foreign_key_list('platform_docs') WHERE "table" = 'media_assets_old'
) + (
	SELECT COUNT(*) FROM pragma_foreign_key_list('posts') WHERE "table" = 'media_assets_old'
) > 0
LIMIT 1;--> statement-breakpoint
INSERT INTO `__um_assert_0080` (`violation`)
SELECT 'media_assets_old cleanup foreign key check failed'
WHERE EXISTS (SELECT 1 FROM pragma_foreign_key_check)
LIMIT 1;--> statement-breakpoint
DROP TABLE `__um_assert_0080`;--> statement-breakpoint

DROP TABLE IF EXISTS `media_assets_old`;
