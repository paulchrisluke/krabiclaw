-- Validate the location/experience media-contract rebuild after restoration.

CREATE TABLE `__um_assert_0080` (`violation` text NOT NULL CHECK (`violation` = ''));--> statement-breakpoint
INSERT INTO `__um_assert_0080` (`violation`)
SELECT 'business_locations_backup_count_mismatch'
WHERE (SELECT COUNT(*) FROM `__um_backup_business_locations`) != (SELECT COUNT(*) FROM `business_locations`)
LIMIT 1;--> statement-breakpoint
INSERT INTO `__um_assert_0080` (`violation`)
SELECT 'experiences_backup_count_mismatch'
WHERE (SELECT COUNT(*) FROM `__um_backup_experiences`) != (SELECT COUNT(*) FROM `experiences`)
LIMIT 1;--> statement-breakpoint
INSERT INTO `__um_assert_0080` (`violation`)
SELECT 'site_content_backup_count_mismatch'
WHERE (SELECT COUNT(*) FROM `__um_backup_site_content`) != (SELECT COUNT(*) FROM `site_content`)
LIMIT 1;--> statement-breakpoint
INSERT INTO `__um_assert_0080` (`violation`)
SELECT 'chowbot_conversations_selected_location_restore_mismatch'
WHERE EXISTS (
	SELECT 1
	FROM `__um_backup_chowbot_conversations`
	WHERE `selected_location_id` IS NOT NULL
	  AND (
		`id` NOT IN (SELECT `id` FROM `chowbot_conversations`)
		OR `selected_location_id` IS NOT (
			SELECT `selected_location_id`
			FROM `chowbot_conversations`
			WHERE `chowbot_conversations`.`id` = `__um_backup_chowbot_conversations`.`id`
		)
	  )
)
LIMIT 1;--> statement-breakpoint
INSERT INTO `__um_assert_0080` (`violation`)
SELECT 'invitation_access_scope_restore_id_mismatch'
WHERE EXISTS (
	SELECT 1
	FROM `__um_backup_invitation_access_scope`
	WHERE `id` NOT IN (SELECT `id` FROM `invitation_access_scope`)
	  AND NOT EXISTS (
		SELECT 1
		FROM `invitation_access_scope`
		WHERE `invitation_access_scope`.`invitation_id` = `__um_backup_invitation_access_scope`.`invitation_id`
		  AND `invitation_access_scope`.`site_id` = `__um_backup_invitation_access_scope`.`site_id`
		  AND (
			(`invitation_access_scope`.`location_id` IS NULL AND `__um_backup_invitation_access_scope`.`location_id` IS NULL)
			OR `invitation_access_scope`.`location_id` = `__um_backup_invitation_access_scope`.`location_id`
		  )
	  )
)
LIMIT 1;--> statement-breakpoint
INSERT INTO `__um_assert_0080` (`violation`)
SELECT 'location_qa_restore_id_mismatch'
WHERE EXISTS (
	SELECT 1
	FROM `__um_backup_location_qa`
	WHERE `id` NOT IN (SELECT `id` FROM `location_qa`)
)
LIMIT 1;--> statement-breakpoint
INSERT INTO `__um_assert_0080` (`violation`)
SELECT 'site_content_translations_restore_id_mismatch'
WHERE EXISTS (
	SELECT 1
	FROM `__um_backup_site_content_translations`
	WHERE `id` NOT IN (SELECT `id` FROM `site_content_translations`)
	  AND NOT EXISTS (
		SELECT 1
		FROM `site_content_translations`
		WHERE `site_content_translations`.`organization_id` = `__um_backup_site_content_translations`.`organization_id`
		  AND `site_content_translations`.`site_id` = `__um_backup_site_content_translations`.`site_id`
		  AND `site_content_translations`.`locale` = `__um_backup_site_content_translations`.`locale`
		  AND `site_content_translations`.`page` = `__um_backup_site_content_translations`.`page`
		  AND `site_content_translations`.`field` = `__um_backup_site_content_translations`.`field`
		  AND (
			(`site_content_translations`.`location_id` IS NULL AND `__um_backup_site_content_translations`.`location_id` IS NULL)
			OR `site_content_translations`.`location_id` = `__um_backup_site_content_translations`.`location_id`
		  )
	  )
)
LIMIT 1;--> statement-breakpoint
INSERT INTO `__um_assert_0080` (`violation`)
SELECT 'location cleanup foreign key check failed'
WHERE EXISTS (SELECT 1 FROM pragma_foreign_key_check)
LIMIT 1;--> statement-breakpoint
DROP TABLE `__um_assert_0080`;--> statement-breakpoint
