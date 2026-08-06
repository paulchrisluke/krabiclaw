-- Repair the live tenant-page documents produced by 0092. That migration
-- mapped legacy component names to canonical block types, but it left the
-- legacy payload shape in place. Normalize those payloads once at the data
-- boundary so every public surface can render the same block contract.

UPDATE content_blocks
SET data_json = json_remove(
  json_set(
    data_json,
    '$.section', CASE json_extract(data_json, '$.type') WHEN 'home_hero' THEN 'hero' ELSE 'page-hero' END,
    '$.cta_label', json_extract(data_json, '$.label'),
    '$.cta_url', json_extract(data_json, '$.url'),
    '$.asset_id', json_extract(data_json, '$.background.asset_id')
  ),
  '$.type', '$.legacy_type'
)
WHERE type = 'hero'
  AND json_extract(data_json, '$.type') IN ('home_hero', 'page_hero', 'schedule_hero');

UPDATE content_blocks
SET data_json = json_remove(
  json_set(data_json, '$.source', 'site_offerings', '$.section', 'services'),
  '$.type', '$.legacy_type'
)
WHERE type = 'offering_grid'
  AND json_extract(data_json, '$.type') = 'services_intro';

UPDATE content_blocks
SET data_json = json_remove(
  json_set(
    data_json,
    '$.items', json(COALESCE((
      SELECT json_group_array(json_object(
        'title', json_extract(item.value, '$.name'),
        'description', json_extract(item.value, '$.desc')
      ))
      FROM json_each(json_extract(content_blocks.data_json, '$.features')) item
    ), '[]')),
    '$.section', 'approach'
  ),
  '$.type', '$.legacy_type', '$.features'
)
WHERE type = 'feature_grid'
  AND json_extract(data_json, '$.type') = 'video_feature';

UPDATE content_blocks
SET data_json = json_remove(
  json_set(data_json, '$.source', 'page_qa', '$.section', 'qa'),
  '$.type', '$.legacy_type'
)
WHERE type = 'faq'
  AND json_extract(data_json, '$.type') IN ('qa', 'schedule_qa');

UPDATE content_blocks
SET data_json = json_remove(
  json_set(data_json, '$.source', 'site_reviews', '$.section', 'reviews'),
  '$.type', '$.legacy_type'
)
WHERE type = 'testimonial_grid'
  AND json_extract(data_json, '$.type') = 'reviews';

UPDATE content_blocks
SET data_json = json_remove(
  json_set(data_json, '$.section', 'consultation'),
  '$.type', '$.legacy_type'
)
WHERE type = 'contact_cta'
  AND json_extract(data_json, '$.type') = 'consultation_cta';

UPDATE content_blocks
SET data_json = json_remove(
  json_set(
    data_json,
    '$.items', json(COALESCE((
      SELECT json_group_array(json_object(
        'title', json_extract(item.value, '$.label'),
        'value', json_extract(item.value, '$.value')
      ))
      FROM json_each(json_extract(content_blocks.data_json, '$.statistics')) item
    ), '[]')),
    '$.section', 'donation'
  ),
  '$.type', '$.legacy_type', '$.statistics'
)
WHERE type = 'feature_grid'
  AND json_extract(data_json, '$.type') = 'impact';

UPDATE content_blocks
SET data_json = json_remove(
  json_set(
    data_json,
    '$.items', json(COALESCE((
      SELECT json_group_array(json_object(
        'title', json_extract(item.value, '$.discount'),
        'value', json_extract(item.value, '$.price'),
        'description', json_extract(item.value, '$.description')
      ))
      FROM json_each(json_extract(content_blocks.data_json, '$.plans')) item
    ), '[]')),
    '$.section', 'pricing'
  ),
  '$.type', '$.legacy_type', '$.plans'
)
WHERE type = 'offering_grid'
  AND json_extract(data_json, '$.type') = 'pricing_plans';

UPDATE content_blocks
SET data_json = json_remove(
  json_set(
    data_json,
    '$.calculator', json_object(
      'rows', json(json_extract(data_json, '$.table.rows')),
      'note', json_extract(data_json, '$.note')
    ),
    '$.effective_date', json_extract(data_json, '$.effectiveDate'),
    '$.section', 'pricing'
  ),
  '$.type', '$.legacy_type', '$.table', '$.note', '$.enabled', '$.effectiveDate'
)
WHERE type = 'feature_grid'
  AND json_extract(data_json, '$.type') = 'pricing_calculator';

UPDATE content_blocks
SET data_json = json_remove(
  json_set(
    data_json,
    '$.destination', CASE
      WHEN EXISTS (
        SELECT 1
        FROM content_documents page_document
        JOIN tenant_page_variants variant ON variant.id = page_document.owner_id
        JOIN tenant_pages page ON page.id = variant.page_id
        WHERE page_document.id = content_blocks.document_id
          AND page.site_id = 'site-ncls-blawby'
          AND page.path = '/donate'
      ) THEN 'https://donate.stripe.com/bIY29UfAUec37GocMM'
      ELSE json_extract(data_json, '$.destination')
    END,
    '$.section', 'donation'
  ),
  '$.type', '$.legacy_type'
)
WHERE type = 'donation_choices'
  AND json_extract(data_json, '$.type') = 'donation_choices';

UPDATE content_blocks
SET data_json = json_remove(
  json_set(
    data_json,
    '$.title', json_extract(data_json, '$.difference.title'),
    '$.body', json_extract(data_json, '$.difference.description'),
    '$.buttons', json(COALESCE((
      SELECT json_group_array(json_object(
        'label', json_extract(item.value, '$.title'),
        'url', json_extract(item.value, '$.url')
      ))
      FROM json_each(json_extract(content_blocks.data_json, '$.other_ways.items')) item
    ), '[]')),
    '$.section', 'donation'
  ),
  '$.type', '$.legacy_type', '$.difference', '$.other_ways'
)
WHERE type = 'callout'
  AND json_extract(data_json, '$.type') = 'donation_support';

UPDATE content_blocks
SET data_json = json_remove(
  json_set(data_json, '$.body', json_extract(data_json, '$.content'), '$.section', 'disclaimer'),
  '$.type', '$.legacy_type', '$.content'
)
WHERE type = 'callout'
  AND json_extract(data_json, '$.type') = 'disclaimer';

-- The old route markers latest_articles/article_filters are now represented
-- by ordinary source-backed blocks in the canonical document.
UPDATE content_blocks
SET position = position + 2
WHERE document_id IN (
  SELECT document.id
  FROM content_documents document
  JOIN tenant_page_variants variant ON variant.id = document.owner_id
  JOIN tenant_pages page ON page.id = variant.page_id
  WHERE document.owner_type = 'tenant_page' AND page.path = '/'
    AND page.site_id = 'site-ncls-blawby'
)
AND position >= 5;

INSERT INTO content_blocks
  (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
SELECT
  'migrated-tenant-page-block:' || variant.id || ':articles',
  document.id,
  NULL,
  'feature_grid',
  5,
  NULL,
  json_object('title', 'From the Blog', 'source', 'site_posts', 'limit', 3, 'section', 'articles'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM content_documents document
JOIN tenant_page_variants variant ON variant.id = document.owner_id
  JOIN tenant_pages page ON page.id = variant.page_id
  WHERE document.owner_type = 'tenant_page'
    AND page.path = '/'
    AND page.site_id = 'site-ncls-blawby'
  AND NOT EXISTS (
    SELECT 1 FROM content_blocks existing
    WHERE existing.document_id = document.id
      AND json_extract(existing.data_json, '$.source') = 'site_posts'
  );

INSERT INTO content_blocks
  (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
SELECT
  'migrated-tenant-page-block:' || variant.id || ':articles-more',
  document.id,
  NULL,
  'button_group',
  6,
  NULL,
  json_object('buttons', json('[{"label":"See All","url":"/blog"}]'), 'section', 'articles-more'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM content_documents document
JOIN tenant_page_variants variant ON variant.id = document.owner_id
  JOIN tenant_pages page ON page.id = variant.page_id
  WHERE document.owner_type = 'tenant_page'
    AND page.path = '/'
    AND page.site_id = 'site-ncls-blawby'
  AND NOT EXISTS (
    SELECT 1 FROM content_blocks existing
    WHERE existing.document_id = document.id
      AND json_extract(existing.data_json, '$.section') = 'articles-more'
  );

-- Inner Blawby pages retain their reviewed divider as a regular block.
UPDATE content_blocks
SET position = position + 1
WHERE document_id IN (
  SELECT document.id
  FROM content_documents document
  JOIN tenant_page_variants variant ON variant.id = document.owner_id
  JOIN tenant_pages page ON page.id = variant.page_id
  WHERE document.owner_type = 'tenant_page'
    AND page.site_id = 'site-ncls-blawby'
    AND page.path IN ('/about', '/pricing', '/contact', '/donate', '/policies/privacy', '/policies/terms', '/third-party-notices')
)
AND position >= 1;

INSERT INTO content_blocks
  (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
SELECT
  'migrated-tenant-page-block:' || variant.id || ':divider',
  document.id,
  NULL,
  'divider',
  1,
  NULL,
  json_object('section', 'shield-divider'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM content_documents document
JOIN tenant_page_variants variant ON variant.id = document.owner_id
  JOIN tenant_pages page ON page.id = variant.page_id
  WHERE document.owner_type = 'tenant_page'
    AND page.site_id = 'site-ncls-blawby'
    AND page.path IN ('/about', '/pricing', '/contact', '/donate', '/policies/privacy', '/policies/terms', '/third-party-notices')
  AND EXISTS (SELECT 1 FROM content_blocks hero WHERE hero.document_id = document.id AND hero.type = 'hero' AND hero.position = 0)
  AND NOT EXISTS (SELECT 1 FROM content_blocks existing WHERE existing.document_id = document.id AND json_extract(existing.data_json, '$.section') = 'shield-divider');

-- Draft revisions intentionally follow the repaired mutable document. This is
-- limited to the current draft pointer; historical revisions remain immutable.
UPDATE content_revisions
SET snapshot_json = json_set(
  snapshot_json,
  '$.blocks', json(COALESCE((
    SELECT json_group_array(json_object('id', ordered.id, 'parent_block_id', ordered.parent_block_id, 'type', ordered.type, 'position', ordered.position, 'level', ordered.level, 'data', json(ordered.data_json)))
    FROM (
      SELECT block.id, block.parent_block_id, block.type, block.position, block.level, block.data_json
      FROM content_blocks block
      WHERE block.document_id = content_revisions.document_id
      ORDER BY block.position ASC, block.id ASC
    ) ordered
  ), '[]'))
)
WHERE id IN (
  SELECT draft_revision_id FROM content_documents
   WHERE owner_type = 'tenant_page' AND draft_revision_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM content_documents published_document
        WHERE published_document.owner_type = 'tenant_page'
          AND published_document.published_revision_id = content_revisions.id
     )
);

-- Published revisions are rebuilt from their own published snapshot, never
-- from the mutable draft blocks. The legacy payload is normalized in-place so
-- published translated pages cannot receive draft translation overrides.
UPDATE content_revisions
SET snapshot_json = json_set(
  snapshot_json,
  '$.blocks', json(COALESCE((
    SELECT json_group_array(json_object(
      'id', normalized.id,
      'parent_block_id', normalized.parent_block_id,
      'type', normalized.type,
      'position', normalized.position,
      'level', normalized.level,
      'data', json(normalized.data_json)
    ))
    FROM (
      SELECT
        json_extract(block.value, '$.id') AS id,
        json_extract(block.value, '$.parent_block_id') AS parent_block_id,
        json_extract(block.value, '$.type') AS type,
        CAST(json_extract(block.value, '$.position') AS INTEGER)
          + CASE
              WHEN page.site_id = 'site-ncls-blawby' AND page.path = '/' AND CAST(json_extract(block.value, '$.position') AS INTEGER) >= 5 THEN 2
              WHEN page.site_id = 'site-ncls-blawby' AND page.path IN ('/about', '/pricing', '/contact', '/donate', '/policies/privacy', '/policies/terms', '/third-party-notices') AND CAST(json_extract(block.value, '$.position') AS INTEGER) >= 1 THEN 1
              ELSE 0
            END AS position,
        json_extract(block.value, '$.level') AS level,
        CASE json_extract(block.value, '$.data.type')
          WHEN 'home_hero' THEN json_remove(json_set(json_extract(block.value, '$.data'), '$.section', 'hero', '$.cta_label', json_extract(block.value, '$.data.label'), '$.cta_url', json_extract(block.value, '$.data.url'), '$.asset_id', json_extract(block.value, '$.data.background.asset_id')), '$.type', '$.legacy_type')
          WHEN 'page_hero' THEN json_remove(json_set(json_extract(block.value, '$.data'), '$.section', 'page-hero', '$.cta_label', json_extract(block.value, '$.data.label'), '$.cta_url', json_extract(block.value, '$.data.url'), '$.asset_id', json_extract(block.value, '$.data.background.asset_id')), '$.type', '$.legacy_type')
          WHEN 'schedule_hero' THEN json_remove(json_set(json_extract(block.value, '$.data'), '$.section', 'page-hero', '$.cta_label', json_extract(block.value, '$.data.label'), '$.cta_url', json_extract(block.value, '$.data.url'), '$.asset_id', json_extract(block.value, '$.data.background.asset_id')), '$.type', '$.legacy_type')
          WHEN 'services_intro' THEN json_remove(json_set(json_extract(block.value, '$.data'), '$.source', 'site_offerings', '$.section', 'services'), '$.type', '$.legacy_type')
          WHEN 'video_feature' THEN json_remove(json_set(json_extract(block.value, '$.data'), '$.items', json(COALESCE((SELECT json_group_array(json_object('title', json_extract(item.value, '$.name'), 'description', json_extract(item.value, '$.desc'))) FROM json_each(json_extract(block.value, '$.data.features')) item), '[]')), '$.section', 'approach'), '$.type', '$.legacy_type', '$.features')
          WHEN 'qa' THEN json_remove(json_set(json_extract(block.value, '$.data'), '$.source', 'page_qa', '$.section', 'qa'), '$.type', '$.legacy_type')
          WHEN 'schedule_qa' THEN json_remove(json_set(json_extract(block.value, '$.data'), '$.source', 'page_qa', '$.section', 'qa'), '$.type', '$.legacy_type')
          WHEN 'reviews' THEN json_remove(json_set(json_extract(block.value, '$.data'), '$.source', 'site_reviews', '$.section', 'reviews'), '$.type', '$.legacy_type')
          WHEN 'consultation_cta' THEN json_remove(json_set(json_extract(block.value, '$.data'), '$.section', 'consultation'), '$.type', '$.legacy_type')
          WHEN 'impact' THEN json_remove(json_set(json_extract(block.value, '$.data'), '$.items', json(COALESCE((SELECT json_group_array(json_object('title', json_extract(item.value, '$.label'), 'value', json_extract(item.value, '$.value'))) FROM json_each(json_extract(block.value, '$.data.statistics')) item), '[]')), '$.section', 'donation'), '$.type', '$.legacy_type', '$.statistics')
          WHEN 'pricing_plans' THEN json_remove(json_set(json_extract(block.value, '$.data'), '$.items', json(COALESCE((SELECT json_group_array(json_object('title', json_extract(item.value, '$.discount'), 'value', json_extract(item.value, '$.price'), 'description', json_extract(item.value, '$.description'))) FROM json_each(json_extract(block.value, '$.data.plans')) item), '[]')), '$.section', 'pricing'), '$.type', '$.legacy_type', '$.plans')
          WHEN 'pricing_calculator' THEN json_remove(json_set(json_extract(block.value, '$.data'), '$.calculator', json_object('rows', json(json_extract(json_extract(block.value, '$.data'), '$.table.rows')), 'note', json_extract(block.value, '$.data.note')), '$.effective_date', json_extract(block.value, '$.data.effectiveDate'), '$.section', 'pricing'), '$.type', '$.legacy_type', '$.table', '$.note', '$.enabled', '$.effectiveDate')
          WHEN 'donation_choices' THEN json_remove(json_set(json_extract(block.value, '$.data'), '$.section', 'donation'), '$.type', '$.legacy_type')
          WHEN 'donation_support' THEN json_remove(json_set(json_extract(block.value, '$.data'), '$.title', json_extract(block.value, '$.data.difference.title'), '$.body', json_extract(block.value, '$.data.difference.description'), '$.buttons', json(COALESCE((SELECT json_group_array(json_object('label', json_extract(item.value, '$.title'), 'url', json_extract(item.value, '$.url'))) FROM json_each(json_extract(block.value, '$.data.other_ways.items')) item), '[]')), '$.section', 'donation'), '$.type', '$.legacy_type', '$.difference', '$.other_ways')
          WHEN 'disclaimer' THEN json_remove(json_set(json_extract(block.value, '$.data'), '$.body', json_extract(block.value, '$.data.content'), '$.section', 'disclaimer'), '$.type', '$.legacy_type', '$.content')
          ELSE json_remove(json_extract(block.value, '$.data'), '$.legacy_type')
        END AS data_json
      FROM json_each(content_revisions.snapshot_json, '$.blocks') block
      JOIN content_documents document ON document.id = content_revisions.document_id
      JOIN tenant_page_variants variant ON variant.id = document.owner_id
      JOIN tenant_pages page ON page.id = variant.page_id
      ORDER BY position ASC, id ASC
    ) normalized
  ), '[]'))
)
WHERE id IN (
  SELECT published_revision_id FROM content_documents
   WHERE owner_type = 'tenant_page' AND published_revision_id IS NOT NULL
);

UPDATE content_revisions
SET snapshot_json = json_insert(
  snapshot_json,
  '$.blocks[#]',
  json_object('id', 'migrated-tenant-page-block:' || variant.id || ':articles', 'parent_block_id', NULL, 'type', 'feature_grid', 'position', 5, 'level', NULL, 'data', json_object('title', 'From the Blog', 'source', 'site_posts', 'limit', 3, 'section', 'articles'))
)
FROM content_documents document
JOIN tenant_page_variants variant ON variant.id = document.owner_id
JOIN tenant_pages page ON page.id = variant.page_id
WHERE content_revisions.id = document.published_revision_id
  AND document.owner_type = 'tenant_page'
  AND page.site_id = 'site-ncls-blawby'
  AND page.path = '/'
  AND NOT EXISTS (SELECT 1 FROM json_each(content_revisions.snapshot_json, '$.blocks') existing WHERE json_extract(existing.value, '$.data.source') = 'site_posts');

UPDATE content_revisions
SET snapshot_json = json_insert(
  snapshot_json,
  '$.blocks[#]',
  json_object('id', 'migrated-tenant-page-block:' || variant.id || ':articles-more', 'parent_block_id', NULL, 'type', 'button_group', 'position', 6, 'level', NULL, 'data', json_object('buttons', json('[{"label":"See All","url":"/blog"}]'), 'section', 'articles-more'))
)
FROM content_documents document
JOIN tenant_page_variants variant ON variant.id = document.owner_id
JOIN tenant_pages page ON page.id = variant.page_id
WHERE content_revisions.id = document.published_revision_id
  AND document.owner_type = 'tenant_page'
  AND page.site_id = 'site-ncls-blawby'
  AND page.path = '/'
  AND NOT EXISTS (SELECT 1 FROM json_each(content_revisions.snapshot_json, '$.blocks') existing WHERE json_extract(existing.value, '$.data.section') = 'articles-more');

UPDATE content_revisions
SET snapshot_json = json_insert(
  snapshot_json,
  '$.blocks[#]',
  json_object('id', 'migrated-tenant-page-block:' || variant.id || ':divider', 'parent_block_id', NULL, 'type', 'divider', 'position', 1, 'level', NULL, 'data', json_object('section', 'shield-divider'))
)
FROM content_documents document
JOIN tenant_page_variants variant ON variant.id = document.owner_id
JOIN tenant_pages page ON page.id = variant.page_id
WHERE content_revisions.id = document.published_revision_id
  AND document.owner_type = 'tenant_page'
  AND page.site_id = 'site-ncls-blawby'
  AND page.path IN ('/about', '/pricing', '/contact', '/donate', '/policies/privacy', '/policies/terms', '/third-party-notices')
  AND EXISTS (SELECT 1 FROM json_each(content_revisions.snapshot_json, '$.blocks') hero WHERE json_extract(hero.value, '$.type') = 'hero' AND json_extract(hero.value, '$.position') = 0)
  AND NOT EXISTS (SELECT 1 FROM json_each(content_revisions.snapshot_json, '$.blocks') existing WHERE json_extract(existing.value, '$.data.section') = 'shield-divider');
