ALTER TABLE `menu_items` ADD `source` text DEFAULT 'manual' NOT NULL;

-- Backfill seeded/template menu items to 'template' instead of 'manual'
-- This identifies rows created by the seeding process before the source column existed
-- Use a deterministic source of truth: menu items with known fixture/template IDs
-- or rows that match the seeding pattern (no manual edits, default structure)
UPDATE `menu_items` SET `source` = 'template'
WHERE `source` = 'manual'
  AND `id` IN (
    SELECT mi.id FROM `menu_items` mi
    JOIN `menus` m ON m.id = mi.menu_id
    JOIN `sites` s ON s.id = m.site_id
    WHERE s.created_at < '2026-06-01'
      AND mi.created_at < '2026-06-01'
      AND mi.updated_at = mi.created_at
      AND (mi.description IS NULL OR mi.description = '')
      AND mi.price_amount IS NULL
  );