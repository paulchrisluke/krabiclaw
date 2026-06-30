ALTER TABLE `menu_items` ADD `source` text DEFAULT 'manual' NOT NULL;

-- Backfill seeded/template menu items to 'template' instead of 'manual'
-- This identifies rows created by the seeding process before the source column existed.
-- Seed definitions (seed-definitions/demo.ts, seed-definitions/kikuzuki.ts) and the
-- client-onboarding pipeline always mint deterministic `mi-*` / `item-*` IDs; rows
-- created manually via the dashboard or MCP always get a crypto.randomUUID() id, which
-- never matches either prefix. This is an explicit ID selector, not a content/timestamp
-- heuristic, so it can't misclassify a real manually-edited item.
UPDATE `menu_items` SET `source` = 'template'
WHERE `source` = 'manual'
  AND (`id` LIKE 'mi-%' OR `id` LIKE 'item-%');