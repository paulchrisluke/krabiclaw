ALTER TABLE `service_addon_purchases` ADD `checkout_session_id` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `service_addon_purchases`
SET `checkout_session_id` = 'legacy-service-addon:' || `id`
WHERE `checkout_session_id` = '';--> statement-breakpoint
CREATE UNIQUE INDEX `service_addon_purchases_checkout_session_id_unique` ON `service_addon_purchases` (`checkout_session_id`);--> statement-breakpoint
ALTER TABLE `subscription` ADD `limits` text;
