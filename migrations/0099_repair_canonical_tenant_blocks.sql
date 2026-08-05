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
  AND page.path IN ('/about', '/pricing', '/contact', '/donate', '/policies/privacy', '/policies/terms', '/third-party-notices')
  AND EXISTS (SELECT 1 FROM content_blocks hero WHERE hero.document_id = document.id AND hero.type = 'hero' AND hero.position = 0)
  AND NOT EXISTS (SELECT 1 FROM content_blocks existing WHERE existing.document_id = document.id AND json_extract(existing.data_json, '$.section') = 'shield-divider');

-- Published pages read immutable revision snapshots. Rebuild those snapshots
-- after the canonical block repair so the database and public read model agree.
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
WHERE document_id IN (SELECT id FROM content_documents WHERE owner_type = 'tenant_page');
