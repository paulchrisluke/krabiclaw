-- `sites.default_currency` becomes nullable with no default: NULL is "the owner
-- has not chosen a currency yet", which is the honest state of a site between
-- the first onboarding save and the step that asks. The old column declared
-- `NOT NULL DEFAULT 'THB'` while the only INSERT stated 'USD', so the schema and
-- the code disagreed about a value neither of them had actually been given.
--
-- Written by hand rather than taken from `drizzle-kit generate`, which emits the
-- standard SQLite rebuild: CREATE `__new_sites`, copy, DROP TABLE `sites`,
-- rename. That rebuild is unsafe on D1 and would destroy this database. Measured
-- against a throwaway D1 instance: `PRAGMA foreign_keys` reads 1, D1 ignores
-- both `PRAGMA foreign_keys=OFF` and `PRAGMA defer_foreign_keys=true`, and
-- SQLite's DROP TABLE performs an implicit DELETE that fires ON DELETE CASCADE.
-- Every row in the 24 tables that reference `sites` goes with it. ALTER TABLE
-- RENAME is no escape either: D1 rewrites the children's REFERENCES clauses to
-- follow the rename, so dropping the old table cascades just the same.
--
-- ADD COLUMN, UPDATE, DROP COLUMN and RENAME COLUMN are all in-place. The table
-- is never dropped, no foreign key action fires, and child rows are untouched --
-- verified on the same throwaway D1 instance. This is also why
-- scripts/lint-migrations.mjs stays as it is: it refuses the generated rebuild
-- for exactly the right reason.
--
-- The column lands last in the table's physical order instead of keeping its
-- original position. SQLite carries no meaning in column order and every reader
-- names its columns, so this is cosmetic.
ALTER TABLE `sites` ADD COLUMN `default_currency_next` text;--> statement-breakpoint
UPDATE `sites` SET `default_currency_next` = `default_currency`;--> statement-breakpoint
ALTER TABLE `sites` DROP COLUMN `default_currency`;--> statement-breakpoint
ALTER TABLE `sites` RENAME COLUMN `default_currency_next` TO `default_currency`;
