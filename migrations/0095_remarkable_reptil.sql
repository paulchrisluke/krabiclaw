CREATE TABLE IF NOT EXISTS `__tenant_page_migration_assertions` (
  `id` integer PRIMARY KEY,
  `ok` integer NOT NULL CHECK (`ok` = 1)
);
DELETE FROM `__tenant_page_migration_assertions`;
INSERT INTO `__tenant_page_migration_assertions` (`id`, `ok`)
SELECT 1, CASE WHEN
  (SELECT COUNT(*) FROM site_content_translations) =
  (SELECT COUNT(*) FROM content_blocks WHERE id LIKE 'migrated-site-content-translation-block:%' OR id LIKE 'migrated-location-translation-block:%')
  AND NOT EXISTS (
    SELECT 1
    FROM site_content_translations sct
    JOIN business_locations bl ON bl.id = sct.location_id AND bl.site_id = sct.site_id
    JOIN tenant_pages p ON p.organization_id = sct.organization_id
      AND p.site_id = sct.site_id
      AND p.path = '/locations/' || bl.slug
    LEFT JOIN tenant_page_variants v ON v.page_id = p.id AND v.locale = sct.locale
    WHERE sct.location_id IS NOT NULL AND sct.page = 'location' AND v.id IS NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM site_content_translations sct
    JOIN business_locations bl ON bl.id = sct.location_id AND bl.site_id = sct.site_id
    JOIN tenant_pages p ON p.organization_id = sct.organization_id
      AND p.site_id = sct.site_id
      AND p.path = '/locations/' || bl.slug
    JOIN tenant_page_variants v ON v.page_id = p.id AND v.locale = sct.locale
    GROUP BY p.id, sct.locale
    HAVING SUM(CASE WHEN sct.status = 'published' THEN 1 ELSE 0 END) < COUNT(*) AND v.status = 'published'
  )
THEN 1 ELSE 0 END;
DROP TABLE `__tenant_page_migration_assertions`;--> statement-breakpoint
DROP TABLE `site_content`;--> statement-breakpoint
DROP TABLE `site_content_translations`;
