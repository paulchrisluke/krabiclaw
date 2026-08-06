CREATE TABLE IF NOT EXISTS `__tenant_page_migration_assertions` (
  `id` integer PRIMARY KEY,
  `ok` integer NOT NULL CHECK (`ok` = 1)
);
DELETE FROM `__tenant_page_migration_assertions`;
INSERT INTO `__tenant_page_migration_assertions` (`id`, `ok`)
SELECT 1, CASE WHEN
  NOT EXISTS (
    SELECT 1
      FROM tenant_page_variants v
      JOIN site_locales sl ON sl.site_id = v.site_id AND sl.locale = v.locale AND sl.is_source = 0
      JOIN content_documents d ON d.owner_type = 'tenant_page' AND d.owner_id = v.id
     WHERE d.draft_revision_id IS NULL
        OR (v.status = 'published' AND d.published_revision_id IS NULL)
  )
  AND NOT EXISTS (
    SELECT 1 FROM content_blocks
     WHERE id LIKE 'migrated-site-content-translation-block:%'
        OR id LIKE 'migrated-location-translation-block:%'
  )
  AND NOT EXISTS (
    SELECT 1
      FROM tenant_page_variants v
      JOIN site_locales sl ON sl.site_id = v.site_id AND sl.locale = v.locale AND sl.is_source = 0
      JOIN content_documents d ON d.owner_type = 'tenant_page' AND d.owner_id = v.id
      JOIN content_revisions r ON r.id = d.published_revision_id AND r.document_id = d.id
     WHERE v.status = 'published'
       AND json_type(r.snapshot_json, '$.blocks') <> 'array'
  )
THEN 1 ELSE 0 END;
DROP TABLE `__tenant_page_migration_assertions`;--> statement-breakpoint
DROP TABLE `site_content`;--> statement-breakpoint
DROP TABLE `site_content_translations`;
