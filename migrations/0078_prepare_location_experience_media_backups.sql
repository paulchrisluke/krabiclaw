-- Prepare bounded backups for the location/experience media-contract rebuild.
-- Full backups are kept only for tables that can be cascaded away by the parent rebuild.
-- Large SET NULL dependents use narrow lookup tables with indexes for restore updates.

DROP TABLE IF EXISTS `__um_assert_0078`;--> statement-breakpoint
DROP TABLE IF EXISTS `__new_business_locations`;--> statement-breakpoint
DROP TABLE IF EXISTS `__new_site_content`;--> statement-breakpoint
DROP TABLE IF EXISTS `__new_experiences`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_booking_policies`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_business_location_translations`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_business_locations`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_chowbot_conversations`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_contact_submissions`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_dashboard_preferences`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_experience_bookings`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_experience_media`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_experience_slot_overrides`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_experiences`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_google_business_connections`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_google_place_snapshots`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_guest_threads`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_invitation_access_scope`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_location_qa`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_mcp_tool_call_events`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_mcp_workspace_preferences`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_media_assets`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_menu_item_translations`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_menu_items`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_menus`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_notification_events`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_notifications`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_offerings`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_posts`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_reservation_slot_overrides`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_reservation_submissions`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_review_requests`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_reviews`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_site_content`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_site_content_translations`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_site_events`;--> statement-breakpoint
DROP TABLE IF EXISTS `__um_backup_site_pageview_events`;--> statement-breakpoint

CREATE TABLE `__um_backup_booking_policies` AS SELECT * FROM `booking_policies`;--> statement-breakpoint
CREATE TABLE `__um_backup_business_location_translations` AS SELECT * FROM `business_location_translations`;--> statement-breakpoint
CREATE TABLE `__um_backup_business_locations` AS SELECT * FROM `business_locations`;--> statement-breakpoint
CREATE TABLE `__um_backup_experience_bookings` AS SELECT * FROM `experience_bookings`;--> statement-breakpoint
CREATE TABLE `__um_backup_experience_media` AS SELECT * FROM `experience_media`;--> statement-breakpoint
CREATE TABLE `__um_backup_experience_slot_overrides` AS SELECT * FROM `experience_slot_overrides`;--> statement-breakpoint
CREATE TABLE `__um_backup_experiences` AS SELECT * FROM `experiences`;--> statement-breakpoint
CREATE TABLE `__um_backup_invitation_access_scope` AS SELECT * FROM `invitation_access_scope`;--> statement-breakpoint
CREATE TABLE `__um_backup_location_qa` AS SELECT * FROM `location_qa`;--> statement-breakpoint
CREATE TABLE `__um_backup_menu_item_translations` AS SELECT * FROM `menu_item_translations`;--> statement-breakpoint
CREATE TABLE `__um_backup_menu_items` AS SELECT * FROM `menu_items`;--> statement-breakpoint
CREATE TABLE `__um_backup_menus` AS SELECT * FROM `menus`;--> statement-breakpoint
CREATE TABLE `__um_backup_reservation_slot_overrides` AS SELECT * FROM `reservation_slot_overrides`;--> statement-breakpoint
CREATE TABLE `__um_backup_reservation_submissions` AS SELECT * FROM `reservation_submissions`;--> statement-breakpoint
CREATE TABLE `__um_backup_reviews` AS SELECT * FROM `reviews`;--> statement-breakpoint
CREATE TABLE `__um_backup_site_content` AS SELECT * FROM `site_content`;--> statement-breakpoint
CREATE TABLE `__um_backup_site_content_translations` AS SELECT * FROM `site_content_translations`;--> statement-breakpoint

CREATE TABLE `__um_backup_chowbot_conversations` AS SELECT `id`, `selected_location_id` FROM `chowbot_conversations` WHERE `selected_location_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__um_backup_contact_submissions` AS SELECT `id`, `location_id`, `experience_id` FROM `contact_submissions` WHERE `location_id` IS NOT NULL OR `experience_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__um_backup_dashboard_preferences` AS SELECT `id`, `selected_location_id` FROM `dashboard_preferences` WHERE `selected_location_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__um_backup_google_business_connections` AS SELECT `id`, `location_id` FROM `google_business_connections` WHERE `location_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__um_backup_google_place_snapshots` AS SELECT `id`, `location_id` FROM `google_place_snapshots` WHERE `location_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__um_backup_guest_threads` AS SELECT `id`, `location_id` FROM `guest_threads` WHERE `location_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__um_backup_mcp_tool_call_events` AS SELECT `id`, `location_id` FROM `mcp_tool_call_events` WHERE `location_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__um_backup_mcp_workspace_preferences` AS SELECT `user_id`, `location_id` FROM `mcp_workspace_preferences` WHERE `location_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__um_backup_media_assets` AS SELECT `id`, `location_id` FROM `media_assets` WHERE `location_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__um_backup_notification_events` AS SELECT `id`, `location_id` FROM `notification_events` WHERE `location_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__um_backup_notifications` AS SELECT `id`, `location_id` FROM `notifications` WHERE `location_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__um_backup_offerings` AS SELECT `id`, `location_id` FROM `offerings` WHERE `location_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__um_backup_posts` AS SELECT `id`, `location_id` FROM `posts` WHERE `location_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__um_backup_review_requests` AS SELECT `id`, `location_id` FROM `review_requests` WHERE `location_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__um_backup_site_events` AS SELECT `id`, `location_id` FROM `site_events` WHERE `location_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__um_backup_site_pageview_events` AS SELECT `id`, `location_id` FROM `site_pageview_events` WHERE `location_id` IS NOT NULL;--> statement-breakpoint

CREATE INDEX `__um_backup_business_locations_id_idx` ON `__um_backup_business_locations` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_experiences_id_idx` ON `__um_backup_experiences` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_site_content_id_idx` ON `__um_backup_site_content` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_booking_policies_id_idx` ON `__um_backup_booking_policies` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_business_location_translations_id_idx` ON `__um_backup_business_location_translations` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_experience_bookings_id_idx` ON `__um_backup_experience_bookings` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_experience_media_id_idx` ON `__um_backup_experience_media` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_experience_slot_overrides_id_idx` ON `__um_backup_experience_slot_overrides` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_invitation_access_scope_id_idx` ON `__um_backup_invitation_access_scope` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_invitation_access_scope_natural_idx` ON `__um_backup_invitation_access_scope` (`invitation_id`, `site_id`, `location_id`);--> statement-breakpoint
CREATE INDEX `__um_backup_location_qa_id_idx` ON `__um_backup_location_qa` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_menu_item_translations_id_idx` ON `__um_backup_menu_item_translations` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_menu_item_translations_natural_idx` ON `__um_backup_menu_item_translations` (`organization_id`, `site_id`, `menu_item_id`, `locale`);--> statement-breakpoint
CREATE INDEX `__um_backup_menu_items_id_idx` ON `__um_backup_menu_items` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_menus_id_idx` ON `__um_backup_menus` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_reservation_slot_overrides_id_idx` ON `__um_backup_reservation_slot_overrides` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_reservation_submissions_id_idx` ON `__um_backup_reservation_submissions` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_reviews_id_idx` ON `__um_backup_reviews` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_site_content_translations_id_idx` ON `__um_backup_site_content_translations` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_site_content_translations_natural_idx` ON `__um_backup_site_content_translations` (`organization_id`, `site_id`, `locale`, `page`, `field`, `location_id`);--> statement-breakpoint
CREATE INDEX `__um_backup_chowbot_conversations_id_idx` ON `__um_backup_chowbot_conversations` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_contact_submissions_id_idx` ON `__um_backup_contact_submissions` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_dashboard_preferences_id_idx` ON `__um_backup_dashboard_preferences` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_google_business_connections_id_idx` ON `__um_backup_google_business_connections` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_google_place_snapshots_id_idx` ON `__um_backup_google_place_snapshots` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_guest_threads_id_idx` ON `__um_backup_guest_threads` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_mcp_tool_call_events_id_idx` ON `__um_backup_mcp_tool_call_events` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_mcp_workspace_preferences_user_id_idx` ON `__um_backup_mcp_workspace_preferences` (`user_id`);--> statement-breakpoint
CREATE INDEX `__um_backup_media_assets_id_idx` ON `__um_backup_media_assets` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_notification_events_id_idx` ON `__um_backup_notification_events` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_notifications_id_idx` ON `__um_backup_notifications` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_offerings_id_idx` ON `__um_backup_offerings` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_posts_id_idx` ON `__um_backup_posts` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_review_requests_id_idx` ON `__um_backup_review_requests` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_site_events_id_idx` ON `__um_backup_site_events` (`id`);--> statement-breakpoint
CREATE INDEX `__um_backup_site_pageview_events_id_idx` ON `__um_backup_site_pageview_events` (`id`);
