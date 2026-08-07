CREATE TABLE `__um_tenant_page_media_map` (
  `site_id` text NOT NULL,
  `legacy_value` text NOT NULL,
  `asset_id` text NOT NULL,
  PRIMARY KEY (`site_id`, `legacy_value`)
);
--> statement-breakpoint
INSERT INTO `__um_tenant_page_media_map` (`site_id`, `legacy_value`, `asset_id`)
SELECT `site_id`, `legacy_value`, `asset_id`
FROM (
  SELECT 'site-demo' AS `site_id`,
         'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/cad82f19-5ecd-43cd-8781-606a59256000/public' AS `legacy_value`,
         'media-demo-team-1' AS `asset_id`
  UNION ALL
  SELECT 'site-kikuzuki', '', 'media-kiku-about'
  UNION ALL
  SELECT 'site-pottery-house', '2aaf5d75-8459-46a5-8b8a-a4f517adf706', 'media-ph-team'
) repair
WHERE EXISTS (
  SELECT 1
  FROM `media_assets` asset
  WHERE asset.`site_id` = repair.`site_id`
    AND asset.`id` = repair.`asset_id`
    AND asset.`kind` = 'image'
    AND asset.`status` = 'active'
);
--> statement-breakpoint
INSERT INTO `__um_tenant_page_media_map` (`site_id`, `legacy_value`, `asset_id`)
SELECT asset.`site_id`, asset.`id`, asset.`id`
FROM `media_assets` asset
WHERE asset.`kind` = 'image'
  AND asset.`status` = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM `__um_tenant_page_media_map` repair
    WHERE repair.`site_id` = asset.`site_id`
      AND repair.`legacy_value` = asset.`id`
  );
--> statement-breakpoint
INSERT INTO `__um_tenant_page_media_map` (`site_id`, `legacy_value`, `asset_id`)
SELECT asset.`site_id`, asset.`public_url`, min(asset.`id`)
FROM `media_assets` asset
WHERE asset.`kind` = 'image'
  AND asset.`status` = 'active'
  AND trim(COALESCE(asset.`public_url`, '')) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM `__um_tenant_page_media_map` repair
    WHERE repair.`site_id` = asset.`site_id`
      AND repair.`legacy_value` = asset.`public_url`
  )
GROUP BY asset.`site_id`, asset.`public_url`
HAVING count(*) = 1;
--> statement-breakpoint
INSERT INTO `__um_tenant_page_media_map` (`site_id`, `legacy_value`, `asset_id`)
SELECT asset.`site_id`, asset.`cloudflare_image_id`, min(asset.`id`)
FROM `media_assets` asset
WHERE asset.`kind` = 'image'
  AND asset.`status` = 'active'
  AND trim(COALESCE(asset.`cloudflare_image_id`, '')) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM `__um_tenant_page_media_map` repair
    WHERE repair.`site_id` = asset.`site_id`
      AND repair.`legacy_value` = asset.`cloudflare_image_id`
  )
GROUP BY asset.`site_id`, asset.`cloudflare_image_id`
HAVING count(*) = 1;
--> statement-breakpoint
CREATE TABLE `__um_tenant_page_media_affected_sites` (
  `site_id` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
INSERT INTO `__um_tenant_page_media_affected_sites` (`site_id`)
SELECT DISTINCT variant.`site_id`
FROM `content_blocks` block
JOIN `content_documents` document
  ON document.`id` = block.`document_id`
 AND document.`owner_type` = 'tenant_page'
JOIN `tenant_page_variants` variant
  ON variant.`id` = document.`owner_id`
WHERE block.`type` = 'image'
  AND (
    trim(COALESCE(json_extract(block.`data_json`, '$.asset_id'), '')) = ''
    OR json_type(block.`data_json`, '$.url') IS NOT NULL
  )
UNION
SELECT DISTINCT variant.`site_id`
FROM `content_revisions` revision
JOIN `content_documents` document
  ON document.`id` = revision.`document_id`
 AND document.`owner_type` = 'tenant_page'
JOIN `tenant_page_variants` variant
  ON variant.`id` = document.`owner_id`
JOIN json_each(json_extract(revision.`snapshot_json`, '$.blocks')) block
WHERE json_extract(block.`value`, '$.type') = 'image'
  AND (
    trim(COALESCE(json_extract(block.`value`, '$.data.asset_id'), '')) = ''
    OR json_type(block.`value`, '$.data.url') IS NOT NULL
  )
UNION
SELECT 'site-demo'
WHERE EXISTS (
  SELECT 1
  FROM `tenant_page_variants` variant
  JOIN `content_revisions` revision
    ON revision.`document_id` = variant.`draft_document_id`
  WHERE variant.`site_id` = 'site-demo'
    AND json_extract(revision.`snapshot_json`, '$.metadata.path') = '/about'
    AND json_extract(revision.`snapshot_json`, '$.metadata.title') LIKE 'http%'
);
--> statement-breakpoint
CREATE TABLE `__um_assert_0106` (
  `violation` text NOT NULL CHECK (`violation` = '')
);
--> statement-breakpoint
INSERT INTO `__um_assert_0106` (`violation`)
SELECT 'unresolved_tenant_page_image_block:' || block.`id`
FROM `content_blocks` block
JOIN `content_documents` document
  ON document.`id` = block.`document_id`
 AND document.`owner_type` = 'tenant_page'
JOIN `tenant_page_variants` variant
  ON variant.`id` = document.`owner_id`
WHERE block.`type` = 'image'
  AND trim(COALESCE(json_extract(block.`data_json`, '$.asset_id'), '')) = ''
  AND trim(COALESCE(json_extract(block.`data_json`, '$.url'), '')) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM `__um_tenant_page_media_map` repair
    WHERE repair.`site_id` = variant.`site_id`
      AND repair.`legacy_value` = trim(json_extract(block.`data_json`, '$.url'))
  );
--> statement-breakpoint
INSERT INTO `__um_assert_0106` (`violation`)
SELECT 'unresolved_tenant_page_revision_image:' || revision.`id` || ':' || json_extract(block.`value`, '$.id')
FROM `content_revisions` revision
JOIN `content_documents` document
  ON document.`id` = revision.`document_id`
 AND document.`owner_type` = 'tenant_page'
JOIN `tenant_page_variants` variant
  ON variant.`id` = document.`owner_id`
JOIN json_each(json_extract(revision.`snapshot_json`, '$.blocks')) block
WHERE json_extract(block.`value`, '$.type') = 'image'
  AND trim(COALESCE(json_extract(block.`value`, '$.data.asset_id'), '')) = ''
  AND trim(COALESCE(json_extract(block.`value`, '$.data.url'), '')) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM `__um_tenant_page_media_map` repair
    WHERE repair.`site_id` = variant.`site_id`
      AND repair.`legacy_value` = trim(json_extract(block.`value`, '$.data.url'))
  );
--> statement-breakpoint
INSERT INTO `__um_assert_0106` (`violation`)
SELECT 'invalid_tenant_page_image_asset:' || block.`id`
FROM `content_blocks` block
JOIN `content_documents` document
  ON document.`id` = block.`document_id`
 AND document.`owner_type` = 'tenant_page'
JOIN `tenant_page_variants` variant
  ON variant.`id` = document.`owner_id`
WHERE block.`type` = 'image'
  AND trim(COALESCE(json_extract(block.`data_json`, '$.asset_id'), '')) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM `media_assets` asset
    WHERE asset.`site_id` = variant.`site_id`
      AND asset.`id` = trim(json_extract(block.`data_json`, '$.asset_id'))
      AND asset.`kind` = 'image'
      AND asset.`status` = 'active'
  );
--> statement-breakpoint
INSERT INTO `__um_assert_0106` (`violation`)
SELECT 'invalid_tenant_page_revision_image_asset:' || revision.`id` || ':' || json_extract(block.`value`, '$.id')
FROM `content_revisions` revision
JOIN `content_documents` document
  ON document.`id` = revision.`document_id`
 AND document.`owner_type` = 'tenant_page'
JOIN `tenant_page_variants` variant
  ON variant.`id` = document.`owner_id`
JOIN json_each(json_extract(revision.`snapshot_json`, '$.blocks')) block
WHERE json_extract(block.`value`, '$.type') = 'image'
  AND trim(COALESCE(json_extract(block.`value`, '$.data.asset_id'), '')) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM `media_assets` asset
    WHERE asset.`site_id` = variant.`site_id`
      AND asset.`id` = trim(json_extract(block.`value`, '$.data.asset_id'))
      AND asset.`kind` = 'image'
      AND asset.`status` = 'active'
  );
--> statement-breakpoint
CREATE TABLE `__um_tenant_page_block_media_repairs` (
  `block_id` text PRIMARY KEY NOT NULL,
  `data_json` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__um_tenant_page_block_media_repairs` (`block_id`, `data_json`)
SELECT block.`id`,
       json_remove(
         json_set(
           block.`data_json`,
           '$.asset_id',
           COALESCE(
             NULLIF(trim(json_extract(block.`data_json`, '$.asset_id')), ''),
             repair.`asset_id`
           )
         ),
         '$.url'
       )
FROM `content_blocks` block
JOIN `content_documents` document
  ON document.`id` = block.`document_id`
 AND document.`owner_type` = 'tenant_page'
JOIN `tenant_page_variants` variant
  ON variant.`id` = document.`owner_id`
LEFT JOIN `__um_tenant_page_media_map` repair
  ON repair.`site_id` = variant.`site_id`
 AND repair.`legacy_value` = trim(COALESCE(json_extract(block.`data_json`, '$.url'), ''))
 AND (
   repair.`legacy_value` <> ''
   OR json_extract(block.`data_json`, '$.field') = 'story.image'
 )
WHERE block.`type` = 'image'
  AND COALESCE(
    NULLIF(trim(json_extract(block.`data_json`, '$.asset_id')), ''),
    repair.`asset_id`
  ) IS NOT NULL;
--> statement-breakpoint
UPDATE `content_blocks`
SET `data_json` = (
  SELECT repair.`data_json`
  FROM `__um_tenant_page_block_media_repairs` repair
  WHERE repair.`block_id` = `content_blocks`.`id`
)
WHERE `id` IN (SELECT `block_id` FROM `__um_tenant_page_block_media_repairs`);
--> statement-breakpoint
DELETE FROM `content_blocks`
WHERE `type` = 'image'
  AND trim(COALESCE(json_extract(`data_json`, '$.asset_id'), '')) = ''
  AND trim(COALESCE(json_extract(`data_json`, '$.url'), '')) = '';
--> statement-breakpoint
CREATE TABLE `__um_tenant_page_revision_media_repairs` (
  `revision_id` text PRIMARY KEY NOT NULL,
  `snapshot_json` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__um_tenant_page_revision_media_repairs` (`revision_id`, `snapshot_json`)
SELECT revision.`id`,
       json_set(
         revision.`snapshot_json`,
         '$.blocks',
         json(COALESCE((
           SELECT json_group_array(json(repaired.`block_json`))
           FROM (
             SELECT block.`key`,
                    CASE
                      WHEN json_extract(block.`value`, '$.type') = 'image' THEN
                        json_remove(
                          json_set(
                            block.`value`,
                            '$.data.asset_id',
                            COALESCE(
                              NULLIF(trim(json_extract(block.`value`, '$.data.asset_id')), ''),
                              (
                                SELECT repair.`asset_id`
                                FROM `__um_tenant_page_media_map` repair
                                WHERE repair.`site_id` = variant.`site_id`
                                  AND repair.`legacy_value` = trim(COALESCE(json_extract(block.`value`, '$.data.url'), ''))
                                  AND (
                                    repair.`legacy_value` <> ''
                                    OR json_extract(block.`value`, '$.data.field') = 'story.image'
                                  )
                                LIMIT 1
                              )
                            )
                          ),
                          '$.data.url'
                        )
                      ELSE block.`value`
                    END AS `block_json`
             FROM json_each(json_extract(revision.`snapshot_json`, '$.blocks')) block
             WHERE NOT (
               json_extract(block.`value`, '$.type') = 'image'
               AND trim(COALESCE(json_extract(block.`value`, '$.data.asset_id'), '')) = ''
               AND trim(COALESCE(json_extract(block.`value`, '$.data.url'), '')) = ''
               AND NOT EXISTS (
                 SELECT 1
                 FROM `__um_tenant_page_media_map` repair
                 WHERE repair.`site_id` = variant.`site_id`
                   AND repair.`legacy_value` = ''
                   AND json_extract(block.`value`, '$.data.field') = 'story.image'
               )
             )
             ORDER BY CAST(block.`key` AS integer)
           ) repaired
         ), '[]'))
       )
FROM `content_revisions` revision
JOIN `content_documents` document
  ON document.`id` = revision.`document_id`
 AND document.`owner_type` = 'tenant_page'
JOIN `tenant_page_variants` variant
  ON variant.`id` = document.`owner_id`
WHERE EXISTS (
  SELECT 1
  FROM json_each(json_extract(revision.`snapshot_json`, '$.blocks')) block
  WHERE json_extract(block.`value`, '$.type') = 'image'
);
--> statement-breakpoint
UPDATE `content_revisions`
SET `snapshot_json` = (
  SELECT repair.`snapshot_json`
  FROM `__um_tenant_page_revision_media_repairs` repair
  WHERE repair.`revision_id` = `content_revisions`.`id`
)
WHERE `id` IN (SELECT `revision_id` FROM `__um_tenant_page_revision_media_repairs`);
--> statement-breakpoint
UPDATE `content_revisions`
SET `snapshot_json` = json_set(`snapshot_json`, '$.metadata.title', 'About')
WHERE `id` IN (
  SELECT revision.`id`
  FROM `content_revisions` revision
  JOIN `content_documents` document
    ON document.`id` = revision.`document_id`
   AND document.`owner_type` = 'tenant_page'
  JOIN `tenant_page_variants` variant
    ON variant.`id` = document.`owner_id`
  WHERE variant.`site_id` = 'site-demo'
    AND json_extract(revision.`snapshot_json`, '$.metadata.path') = '/about'
    AND json_extract(revision.`snapshot_json`, '$.metadata.title') LIKE 'http%'
);
--> statement-breakpoint
UPDATE `tenant_page_variants`
SET `title` = 'About'
WHERE `site_id` = 'site-demo'
  AND (`published_path` = '/about' OR `draft_path` = '/about')
  AND `title` LIKE 'http%';
--> statement-breakpoint
UPDATE `tenant_pages`
SET `title` = 'About'
WHERE `site_id` = 'site-demo'
  AND `path` = '/about'
  AND `title` LIKE 'http%';
--> statement-breakpoint
INSERT INTO `public_resource_cache_invalidations`
  (`id`, `site_id`, `reason`, `status`, `attempt_count`, `created_at`)
SELECT 'migration-0106-tenant-page-media-' || affected.`site_id`,
       affected.`site_id`,
       'canonical-tenant-page-media',
       'pending',
       0,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `__um_tenant_page_media_affected_sites` affected
WHERE NOT EXISTS (
  SELECT 1
  FROM `public_resource_cache_invalidations` existing
  WHERE existing.`id` = 'migration-0106-tenant-page-media-' || affected.`site_id`
);
--> statement-breakpoint
DROP TABLE `__um_tenant_page_revision_media_repairs`;
--> statement-breakpoint
DROP TABLE `__um_tenant_page_block_media_repairs`;
--> statement-breakpoint
DROP TABLE `__um_assert_0106`;
--> statement-breakpoint
DROP TABLE `__um_tenant_page_media_affected_sites`;
--> statement-breakpoint
DROP TABLE `__um_tenant_page_media_map`;
