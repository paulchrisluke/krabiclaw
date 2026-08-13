import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { createError } from 'h3'
import { tenantBlogPostPath } from '~/utils/tenant-blog-route'
import type { ContentBlockSnapshot } from '~/server/utils/content-documents'

export async function publishDueBlogPosts(db: D1Database, now = new Date()) {
  const revisionIssues = await queryAll<{ id: string }>(db, `
    SELECT p.id
      FROM blog_posts p
      LEFT JOIN content_documents d
        ON d.owner_id = p.id
       AND d.owner_type = CASE WHEN p.site_id IS NULL THEN 'platform_blog' ELSE 'tenant_blog' END
      LEFT JOIN content_revisions r ON r.id = p.scheduled_revision_id AND r.document_id = d.id
     WHERE p.status = 'scheduled' AND (p.scheduled_revision_id IS NULL OR r.id IS NULL)
     ORDER BY p.scheduled_for, p.id
  `)
  const due = await queryAll<{
    id: string
    scheduled_for: string
    post_updated_at: string
    document_id: string
    document_updated_at: string
    scheduled_revision_id: string
    body_markdown: string
  }>(db, `
    SELECT p.id, p.scheduled_for, p.updated_at AS post_updated_at,
           d.id AS document_id, d.updated_at AS document_updated_at,
           p.scheduled_revision_id, r.body_markdown
      FROM blog_posts p
      JOIN content_documents d
        ON d.owner_id = p.id
       AND d.owner_type = CASE WHEN p.site_id IS NULL THEN 'platform_blog' ELSE 'tenant_blog' END
      JOIN content_revisions r ON r.id = p.scheduled_revision_id AND r.document_id = d.id
     WHERE p.status = 'scheduled' AND p.scheduled_for IS NOT NULL AND p.scheduled_for <= ?
     ORDER BY scheduled_for ASC LIMIT 100
  `, [now.toISOString()])
  let published = 0
  for (const row of due ?? []) {
    const postTimestamp = Date.parse(row.post_updated_at)
    const documentTimestamp = Date.parse(row.document_updated_at)
    const timestamp = new Date(Math.max(
      now.getTime(),
      Number.isFinite(postTimestamp) ? postTimestamp + 1 : 0,
      Number.isFinite(documentTimestamp) ? documentTimestamp + 1 : 0,
    )).toISOString()
    const results = await executeBatch(db, [
      {
        query: `INSERT INTO content_blocks (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
                SELECT ?, ?, NULL, '__scheduled_blog_publish_concurrency_guard__', 0, NULL, '{}', ?, ?
                 WHERE NOT EXISTS (
                   SELECT 1
                     FROM blog_posts p
                     JOIN content_documents d
                       ON d.id = ?
                      AND d.owner_id = p.id
                      AND d.owner_type = CASE WHEN p.site_id IS NULL THEN 'platform_blog' ELSE 'tenant_blog' END
                      AND d.updated_at = ?
                     JOIN content_revisions r
                       ON r.id = p.scheduled_revision_id
                      AND r.document_id = d.id
                    WHERE p.id = ?
                      AND p.status = 'scheduled'
                      AND p.scheduled_for = ?
                      AND p.scheduled_for <= ?
                      AND p.scheduled_revision_id = ?
                      AND p.updated_at = ?
                 )`,
        params: [
          crypto.randomUUID(),
          row.document_id,
          timestamp,
          timestamp,
          row.document_id,
          row.document_updated_at,
          row.id,
          row.scheduled_for,
          now.toISOString(),
          row.scheduled_revision_id,
          row.post_updated_at,
        ],
      },
      {
        query: `UPDATE content_revisions
                   SET published_at = COALESCE(published_at, ?)
                 WHERE id = ? AND document_id = ?`,
        params: [row.scheduled_for, row.scheduled_revision_id, row.document_id],
      },
      {
        query: `UPDATE content_documents
                   SET published_revision_id = ?, updated_at = ?
                 WHERE id = ? AND updated_at = ?`,
        params: [row.scheduled_revision_id, timestamp, row.document_id, row.document_updated_at],
      },
      {
        query: `UPDATE blog_posts
           SET body = ?, status = 'published', published_at = COALESCE(published_at, scheduled_for, ?),
               first_published_at = COALESCE(first_published_at, scheduled_for, ?),
               scheduled_for = NULL, scheduled_revision_id = NULL, updated_at = ?
         WHERE id = ? AND status = 'scheduled' AND scheduled_for = ? AND scheduled_revision_id = ? AND updated_at = ?`,
        params: [
          row.body_markdown,
          timestamp,
          timestamp,
          timestamp,
          row.id,
          row.scheduled_for,
          row.scheduled_revision_id,
          row.post_updated_at,
        ],
      },
    ])
    if (Number(results[3]?.meta?.changes ?? 0) > 0) published++
  }
  return { published, scheduled_revision_issues: (revisionIssues ?? []).map(row => row.id) }
}

export async function resolveBlogRedirect(db: DbClient, siteId: string | null, slug: string) {
  const row = await queryFirst<{ slug: string; theme: string | null; theme_id: string | null } | null>(db, `
    SELECT p.slug, s.theme, s.theme_id
      FROM blog_post_redirects r
      JOIN blog_posts p ON p.id = r.post_id
      LEFT JOIN sites s ON s.id = p.site_id
     WHERE r.old_slug = ? AND ${siteId ? 'r.site_id = ? AND p.site_id = ?' : 'r.site_id IS NULL AND p.site_id IS NULL'}
       AND p.status = 'published'
     LIMIT 1
  `, siteId ? [slug, siteId, siteId] : [slug])
  if (!row) return null
  return siteId ? tenantBlogPostPath(row, row.slug) : row.slug
}

export async function createBlogRedirect(db: D1Database, postId: string, siteId: string | null, oldSlug: string) {
  const result = await execute(db, `INSERT INTO blog_post_redirects (id, post_id, site_id, old_slug, created_at)
    SELECT ?, p.id, p.site_id, ?, ?
      FROM blog_posts p
     WHERE p.id = ? AND ((? IS NULL AND p.site_id IS NULL) OR p.site_id = ?)`,
  [crypto.randomUUID(), oldSlug, new Date().toISOString(), postId, siteId, siteId])
  if (Number(result.meta.changes ?? 0) === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Blog redirect scope must match its post' })
  }
}

export async function resolveBlogSocialImage(db: DbClient, input: {
  siteId: string | null
  explicitAssetId?: string | null
  legacyAssetId?: string | null
  blocks?: ContentBlockSnapshot[] | null
}) {
  const firstImage = input.blocks?.find(block => block.type === 'image' && block.data.status !== 'inactive')
  const firstImageId = typeof firstImage?.data.asset_id === 'string' ? firstImage.data.asset_id : null
  let siteDefaultId: string | null = null
  if (input.siteId) {
    siteDefaultId = (await queryFirst<{ og_image_asset_id: string | null } | null>(db, 'SELECT og_image_asset_id FROM sites WHERE id = ? LIMIT 1', [input.siteId]))?.og_image_asset_id ?? null
  }
  const assetId = input.explicitAssetId || firstImageId || input.legacyAssetId || siteDefaultId
  if (!assetId) return null
  return await queryFirst<{ asset_id: string; public_url: string | null; thumbnail_url: string | null; width: number | null; height: number | null } | null>(db, `
    SELECT id AS asset_id, public_url, thumbnail_url, width, height
      FROM media_assets WHERE id = ? AND status = 'active' LIMIT 1
  `, [assetId])
}
