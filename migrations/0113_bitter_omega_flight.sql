-- The provider/application census found no purchases or active auto-top-up
-- configuration. Abort instead of deleting an unexpected customer obligation.
CREATE TABLE `__retired_billing_0113_assertions` (
	`violation` text NOT NULL,
	CONSTRAINT `service_addon_purchases_not_empty` CHECK (`violation` != 'service_addon_purchases_not_empty'),
	CONSTRAINT `stripe_credit_topups_not_empty` CHECK (`violation` != 'stripe_credit_topups_not_empty'),
	CONSTRAINT `auto_topup_configuration_not_default` CHECK (`violation` != 'auto_topup_configuration_not_default')
);--> statement-breakpoint
INSERT INTO `__retired_billing_0113_assertions` (`violation`)
SELECT 'service_addon_purchases_not_empty'
WHERE EXISTS (SELECT 1 FROM `service_addon_purchases`);--> statement-breakpoint
INSERT INTO `__retired_billing_0113_assertions` (`violation`)
SELECT 'stripe_credit_topups_not_empty'
WHERE EXISTS (SELECT 1 FROM `stripe_credit_topups`);--> statement-breakpoint
INSERT INTO `__retired_billing_0113_assertions` (`violation`)
SELECT 'auto_topup_configuration_not_default'
WHERE EXISTS (
	SELECT 1
	FROM `organization_billing`
	WHERE `auto_topup_enabled` != 0
		OR `auto_topup_bundle` != 500
		OR `auto_topup_threshold` != 100
);--> statement-breakpoint
DROP TABLE `__retired_billing_0113_assertions`;--> statement-breakpoint
DROP TABLE `service_addon_purchases`;--> statement-breakpoint
DROP TABLE `stripe_credit_topups`;--> statement-breakpoint
ALTER TABLE `organization_billing` DROP COLUMN `auto_topup_enabled`;--> statement-breakpoint
ALTER TABLE `organization_billing` DROP COLUMN `auto_topup_bundle`;--> statement-breakpoint
ALTER TABLE `organization_billing` DROP COLUMN `auto_topup_threshold`;
