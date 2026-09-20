-- Hand-written: drizzle-kit emits a rebuild (CREATE __new_sites, copy, DROP
-- TABLE sites, RENAME) for a NOT NULL change, and that DROP cascades on D1.
-- ADD/DROP/RENAME COLUMN are in place. See docs/operations/release-flow.md.
ALTER TABLE `sites` ADD COLUMN `default_currency_next` text;--> statement-breakpoint
UPDATE `sites` SET `default_currency_next` = `default_currency`;--> statement-breakpoint
ALTER TABLE `sites` DROP COLUMN `default_currency`;--> statement-breakpoint
ALTER TABLE `sites` RENAME COLUMN `default_currency_next` TO `default_currency`;
