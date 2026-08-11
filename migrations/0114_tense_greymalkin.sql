DROP TABLE IF EXISTS `__assert_0114_sites_compatibility`;--> statement-breakpoint
CREATE TABLE `__assert_0114_sites_compatibility` (
	`violation` text NOT NULL CHECK (`violation` = '')
);--> statement-breakpoint
INSERT INTO `__assert_0114_sites_compatibility` (`violation`)
SELECT 'sites_url_structure_missing_before_compatibility_release'
WHERE NOT EXISTS (
	SELECT 1
	FROM pragma_table_info('sites')
	WHERE name = 'url_structure'
);--> statement-breakpoint
DROP TABLE `__assert_0114_sites_compatibility`;
