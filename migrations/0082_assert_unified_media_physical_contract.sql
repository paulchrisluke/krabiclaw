CREATE TABLE `__um_assert_0079` (`violation` text NOT NULL CHECK (`violation` = ''));--> statement-breakpoint
INSERT INTO `__um_assert_0079` (`violation`)
SELECT 'legacy unified media columns still present'
WHERE (
	SELECT COUNT(*) FROM pragma_table_info('business_locations')
	WHERE name IN ('hero_image_asset_id', 'hero_video_asset_id')
) + (
	SELECT COUNT(*) FROM pragma_table_info('site_content')
	WHERE name IN ('hero_image_asset_id', 'hero_video_asset_id')
) + (
	SELECT COUNT(*) FROM pragma_table_info('experiences')
	WHERE name IN ('image_asset_id', 'video_asset_id', 'images')
) > 0
LIMIT 1;--> statement-breakpoint
INSERT INTO `__um_assert_0079` (`violation`)
SELECT 'unified media physical contract foreign key check failed'
WHERE EXISTS (SELECT 1 FROM pragma_foreign_key_check)
LIMIT 1;--> statement-breakpoint
DROP TABLE `__um_assert_0079`;
