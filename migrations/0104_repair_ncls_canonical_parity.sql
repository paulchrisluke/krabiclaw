-- Repair the NCLS canonical tenant-page snapshots after the 0099 payload
-- repair.  The original repair used tenant_pages.path for route ownership,
-- but the published route is owned by tenant_page_variants.published_path and
-- the mutable route may be in draft_path while a path is being migrated.

UPDATE content_blocks
SET data_json = json_set(
  json_set(data_json, '$.destination', 'https://donate.stripe.com/bIY29UfAUec37GocMM'),
  '$.section', 'donation'
)
WHERE type = 'donation_choices'
  AND document_id IN (
    SELECT document.id
    FROM content_documents document
    JOIN tenant_page_variants variant ON variant.id = document.owner_id
    WHERE document.owner_type = 'tenant_page'
      AND variant.site_id = 'site-ncls-blawby'
      AND (variant.published_path = '/donate' OR variant.draft_path = '/donate')
  );

UPDATE content_revisions
SET snapshot_json = json_set(
  snapshot_json,
  '$.blocks',
  json(COALESCE((
    SELECT json_group_array(json(normalized.block_json))
    FROM (
      SELECT CASE
        WHEN json_extract(block.value, '$.type') = 'donation_choices'
          THEN json_set(
            block.value,
            '$.data.destination', 'https://donate.stripe.com/bIY29UfAUec37GocMM',
            '$.data.section', 'donation'
          )
        ELSE block.value
      END AS block_json
      FROM json_each(content_revisions.snapshot_json, '$.blocks') block
    ) normalized
  ), '[]'))
)
WHERE id IN (
  SELECT document.published_revision_id
  FROM content_documents document
  JOIN tenant_page_variants variant ON variant.id = document.owner_id
  WHERE document.owner_type = 'tenant_page'
    AND variant.site_id = 'site-ncls-blawby'
    AND (variant.published_path = '/donate' OR variant.draft_path = '/donate')
  UNION
  SELECT document.draft_revision_id
  FROM content_documents document
  JOIN tenant_page_variants variant ON variant.id = document.owner_id
  WHERE document.owner_type = 'tenant_page'
    AND variant.site_id = 'site-ncls-blawby'
    AND (variant.published_path = '/donate' OR variant.draft_path = '/donate')
);

-- Keep the canonical home page order stable across the mutable document and
-- both revision snapshots.  The source order is part of the public-page
-- contract, so do not rely on insertion order when repairing snapshots.
UPDATE content_blocks
SET position = CASE json_extract(data_json, '$.section')
  WHEN 'hero' THEN 0
  WHEN 'services' THEN 1
  WHEN 'approach' THEN 2
  WHEN 'qa' THEN 3
  WHEN 'reviews' THEN 4
  WHEN 'articles' THEN 5
  WHEN 'articles-more' THEN 6
  WHEN 'consultation' THEN 7
  ELSE position
END
WHERE document_id IN (
  SELECT document.id
  FROM content_documents document
  JOIN tenant_page_variants variant ON variant.id = document.owner_id
  WHERE document.owner_type = 'tenant_page'
    AND variant.site_id = 'site-ncls-blawby'
    AND (variant.published_path = '/' OR variant.draft_path = '/')
)
  AND json_extract(data_json, '$.section') IN (
    'hero', 'services', 'approach', 'qa', 'reviews', 'articles', 'articles-more', 'consultation'
  );

UPDATE content_revisions
SET snapshot_json = json_set(
  snapshot_json,
  '$.blocks',
  json(COALESCE((
    SELECT json_group_array(json(ordered.block_json))
    FROM (
      SELECT
        json_set(
          block.value,
          '$.position',
          CASE json_extract(block.value, '$.data.section')
            WHEN 'hero' THEN 0
            WHEN 'services' THEN 1
            WHEN 'approach' THEN 2
            WHEN 'qa' THEN 3
            WHEN 'reviews' THEN 4
            WHEN 'articles' THEN 5
            WHEN 'articles-more' THEN 6
            WHEN 'consultation' THEN 7
            ELSE CAST(json_extract(block.value, '$.position') AS INTEGER)
          END
        ) AS block_json,
        CASE json_extract(block.value, '$.data.section')
          WHEN 'hero' THEN 0
          WHEN 'services' THEN 1
          WHEN 'approach' THEN 2
          WHEN 'qa' THEN 3
          WHEN 'reviews' THEN 4
          WHEN 'articles' THEN 5
          WHEN 'articles-more' THEN 6
          WHEN 'consultation' THEN 7
          ELSE CAST(json_extract(block.value, '$.position') AS INTEGER)
        END AS target_position,
        CAST(json_extract(block.value, '$.position') AS INTEGER) AS source_position,
        COALESCE(json_extract(block.value, '$.id'), '') AS block_id
      FROM json_each(content_revisions.snapshot_json, '$.blocks') block
      ORDER BY target_position, source_position, block_id
    ) ordered
  ), '[]'))
)
WHERE id IN (
  SELECT document.published_revision_id
  FROM content_documents document
  JOIN tenant_page_variants variant ON variant.id = document.owner_id
  WHERE document.owner_type = 'tenant_page'
    AND variant.site_id = 'site-ncls-blawby'
    AND (variant.published_path = '/' OR variant.draft_path = '/')
  UNION
  SELECT document.draft_revision_id
  FROM content_documents document
  JOIN tenant_page_variants variant ON variant.id = document.owner_id
  WHERE document.owner_type = 'tenant_page'
    AND variant.site_id = 'site-ncls-blawby'
    AND (variant.published_path = '/' OR variant.draft_path = '/')
);
