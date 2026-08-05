-- Repair databases where the first tenant-page migration rebuilt
-- content_documents while D1 still cascaded its child rows. The source of
-- truth for a published blog revision is the published blog body; preserve
-- that content as a canonical markdown block and point the document at the
-- repaired revision. On databases where 0092 preserved its children this is
-- a no-op.

WITH source_documents AS (
  SELECT d.id AS document_id, p.body AS body
  FROM content_documents d
  JOIN blog_posts p ON p.id = d.owner_id
   AND d.owner_type IN ('platform_blog', 'tenant_blog')
  WHERE (
    (d.published_revision_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM content_revisions r WHERE r.id = d.published_revision_id
    ))
    OR (d.draft_revision_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM content_revisions r WHERE r.id = d.draft_revision_id
    ))
  )
  UNION ALL
  SELECT d.id AS document_id, p.body AS body
  FROM content_documents d
  JOIN platform_docs p ON p.id = d.owner_id
   AND d.owner_type = 'platform_doc'
  WHERE (
    (d.published_revision_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM content_revisions r WHERE r.id = d.published_revision_id
    ))
    OR (d.draft_revision_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM content_revisions r WHERE r.id = d.draft_revision_id
    ))
  )
  UNION ALL
  SELECT d.id AS document_id, COALESCE(NULLIF(p.body, ''), v.title, '') AS body
  FROM content_documents d
  JOIN tenant_page_variants v ON v.id = d.owner_id
   AND d.owner_type = 'tenant_page'
  JOIN tenant_pages p ON p.id = v.page_id
  WHERE (
    (d.published_revision_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM content_revisions r WHERE r.id = d.published_revision_id
    ))
    OR (d.draft_revision_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM content_revisions r WHERE r.id = d.draft_revision_id
    ))
  )
)
INSERT INTO content_blocks
  (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
SELECT
  'repaired-content-block:' || source_documents.document_id,
  source_documents.document_id,
  NULL,
  'markdown',
  0,
  NULL,
  json_object('markdown', source_documents.body, 'editor_mode', 'source'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM source_documents
WHERE trim(source_documents.body) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM content_blocks b WHERE b.document_id = source_documents.document_id
  );

WITH source_documents AS (
  SELECT d.id AS document_id, p.body AS body
  FROM content_documents d
  JOIN blog_posts p ON p.id = d.owner_id
   AND d.owner_type IN ('platform_blog', 'tenant_blog')
  WHERE (
    (d.published_revision_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM content_revisions r WHERE r.id = d.published_revision_id
    ))
    OR (d.draft_revision_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM content_revisions r WHERE r.id = d.draft_revision_id
    ))
  )
  UNION ALL
  SELECT d.id AS document_id, p.body AS body
  FROM content_documents d
  JOIN platform_docs p ON p.id = d.owner_id
   AND d.owner_type = 'platform_doc'
  WHERE (
    (d.published_revision_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM content_revisions r WHERE r.id = d.published_revision_id
    ))
    OR (d.draft_revision_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM content_revisions r WHERE r.id = d.draft_revision_id
    ))
  )
  UNION ALL
  SELECT d.id AS document_id, COALESCE(NULLIF(p.body, ''), v.title, '') AS body
  FROM content_documents d
  JOIN tenant_page_variants v ON v.id = d.owner_id
   AND d.owner_type = 'tenant_page'
  JOIN tenant_pages p ON p.id = v.page_id
  WHERE (
    (d.published_revision_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM content_revisions r WHERE r.id = d.published_revision_id
    ))
    OR (d.draft_revision_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM content_revisions r WHERE r.id = d.draft_revision_id
    ))
  )
)
INSERT INTO content_revisions
  (id, document_id, snapshot_json, body_markdown, created_by, label, created_at)
SELECT
  'repaired-content-revision:' || source_documents.document_id,
  source_documents.document_id,
  json_object(
    'schemaVersion', 1,
    'blocks', json_array(json_object(
      'id', 'repaired-content-block:' || source_documents.document_id,
      'parent_block_id', NULL,
      'type', 'markdown',
      'position', 0,
      'level', NULL,
      'data', json_object('markdown', source_documents.body, 'editor_mode', 'source')
    ))
  ),
  source_documents.body,
  NULL,
  'Repair dangling content revision after tenant page migration',
  CURRENT_TIMESTAMP
FROM source_documents
WHERE NOT EXISTS (
  SELECT 1
  FROM content_revisions r
  WHERE r.id = 'repaired-content-revision:' || source_documents.document_id
);

UPDATE content_documents
SET
  draft_revision_id = CASE
    WHEN draft_revision_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM content_revisions r WHERE r.id = draft_revision_id)
    THEN 'repaired-content-revision:' || content_documents.id
    ELSE draft_revision_id
  END,
  published_revision_id = CASE
    WHEN published_revision_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM content_revisions r WHERE r.id = published_revision_id)
    THEN 'repaired-content-revision:' || content_documents.id
    ELSE published_revision_id
  END
WHERE EXISTS (
  SELECT 1
  FROM content_revisions r
  WHERE r.id = 'repaired-content-revision:' || content_documents.id
);

UPDATE blog_posts
SET scheduled_revision_id = 'repaired-content-revision:' || content_documents.id
FROM content_documents
WHERE content_documents.owner_type IN ('platform_blog', 'tenant_blog')
  AND content_documents.owner_id = blog_posts.id
  AND blog_posts.scheduled_revision_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_revisions r WHERE r.id = blog_posts.scheduled_revision_id
  )
  AND EXISTS (
    SELECT 1
    FROM content_revisions r
    WHERE r.id = 'repaired-content-revision:' || content_documents.id
  );
