-- Two independent data-hygiene fixes surfaced after 0129/0130/0131 finally
-- succeeded on production for the first time (2026-08-28):
--
-- 1. content_blocks whose data_json still carries a legacy embedded
--    `asset_id` (the old pre-media-placement pattern this whole migration
--    set was meant to retire) never got a corresponding media_placements
--    row. 0129's own backfill only ever covered the OLD dedicated columns
--    (sites.logo_asset_id, business_locations.hero_media_asset_id, etc.)
--    and a handful of other tables' JSON columns - it never scanned
--    content_blocks.data_json itself. This silently dropped hero/story
--    images across several tenants until fixed by hand against production;
--    this makes that fix permanent and idempotent everywhere else
--    (including any environment that hasn't hit this yet).
--
-- 2. A small number of content_blocks (platform docs + one NCLS blog post)
--    have a literal `{{component type="..."}}` placeholder token baked
--    directly into their markdown text. This token is only ever meant to
--    appear in the flattened plain-text output of
--    renderContentBlocksToMarkdown() (server/utils/content-documents.ts) -
--    a representation for consumers that don't render content_blocks
--    directly (search indexing, plain-text export). At some point that
--    flattened output was saved back as a block's own literal markdown
--    content instead, permanently baking the placeholder in as visible
--    text on real pages. Strip it - the block's real successor content
--    already exists as its own content_blocks row elsewhere in the same
--    document, so no content is lost by removing the dead marker text.

INSERT INTO `media_placements` (`id`, `organization_id`, `site_id`, `owner_type`, `owner_id`, `slot`, `asset_id`, `sort_order`, `status`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(16))), a.`organization_id`, a.`site_id`, 'content_block', cb.`id`, 'media', a.`id`, 0, 'active', datetime('now'), datetime('now')
FROM `content_blocks` cb
JOIN `media_assets` a ON a.`id` = json_extract(cb.`data_json`, '$.asset_id')
WHERE json_extract(cb.`data_json`, '$.asset_id') IS NOT NULL AND json_extract(cb.`data_json`, '$.asset_id') != ''
  AND NOT EXISTS (
    SELECT 1 FROM `media_placements` mp WHERE mp.`owner_type` = 'content_block' AND mp.`owner_id` = cb.`id` AND mp.`slot` = 'media' AND mp.`status` = 'active'
  );--> statement-breakpoint

UPDATE `content_blocks`
SET `data_json` = json_set(
  `data_json`, '$.markdown',
  trim(
    replace(
      replace(json_extract(`data_json`, '$.markdown'), char(10) || char(10) || '{{component type="faq"}}', ''),
      char(10) || char(10) || '{{component type="how_to"}}', ''
    )
  )
)
WHERE `type` = 'markdown'
  AND (`data_json` LIKE '%' || char(10) || char(10) || '{{component type="faq"}}%' OR `data_json` LIKE '%' || char(10) || char(10) || '{{component type="how_to"}}%');--> statement-breakpoint
