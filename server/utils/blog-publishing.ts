import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { HTTPError } from 'nitro';
import { tenantBlogPostPath } from '~/utils/tenant-blog-route'
import { resolveBlogPublicPath } from '~/utils/blog-editor'
import { PLATFORM_SITE_ID } from '~/shared/platform-scope'

export async function publishDueBlogPosts(db: D1Database, now = new Date()) {
  const contentIssues = await queryAll<{ id: string }>(db, `
    SELECT p.id
      FROM blog_posts p
      LEFT JOIN content_documents d
        ON d.owner_id = p.id
       AND d.owner_type = CASE WHEN p.site_id = '${PLATFORM_SITE_ID}' THEN 'platform_blog' ELSE 'tenant_blog' END
     WHERE p.status = 'scheduled' AND (p.scheduled_for IS NULL OR d.id IS NULL)
     ORDER BY p.scheduled_for, p.id
  `)
  const due = await queryAll<{
    id: string
    scheduled_for: string
    post_updated_at: string
    document_id: string
    document_updated_at: string
  }>(db, `
    SELECT p.id, p.scheduled_for, p.updated_at AS post_updated_at,
           d.id AS document_id, d.updated_at AS document_updated_at
      FROM blog_posts p
      JOIN content_documents d
        ON d.owner_id = p.id
       AND d.owner_type = CASE WHEN p.site_id = '${PLATFORM_SITE_ID}' THEN 'platform_blog' ELSE 'tenant_blog' END
     WHERE p.status = 'scheduled' AND p.scheduled_for IS NOT NULL AND p.scheduled_for <= ?
     ORDER BY scheduled_for ASC LIMIT 100
  `, [now.toISOString()])
  let published = 0
  for (const row of due ?? []) {
    const postTimestamp = Date.parse(row.post_updated_at)
    const timestamp = new Date(Math.max(
      now.getTime(),
      Number.isFinite(postTimestamp) ? postTimestamp + 1 : 0,
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
                      AND d.owner_type = CASE WHEN p.site_id = '${PLATFORM_SITE_ID}' THEN 'platform_blog' ELSE 'tenant_blog' END
                      AND d.updated_at = ?
                    WHERE p.id = ?
                      AND p.status = 'scheduled'
                      AND p.scheduled_for = ?
                      AND p.scheduled_for <= ?
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
          row.post_updated_at,
        ],
      },
      {
        query: `UPDATE blog_posts
           SET status = 'published', published_at = COALESCE(published_at, scheduled_for, ?),
               first_published_at = COALESCE(first_published_at, scheduled_for, ?),
               scheduled_for = NULL, updated_at = ?
         WHERE id = ? AND status = 'scheduled' AND scheduled_for = ? AND updated_at = ?`,
        params: [
          timestamp,
          timestamp,
          timestamp,
          row.id,
          row.scheduled_for,
          row.post_updated_at,
        ],
      },
    ])
    if (Number(results[1]?.meta?.changes ?? 0) > 0) published++
  }
  return { published, scheduled_content_issues: (contentIssues ?? []).map(row => row.id) }
}

export async function resolveBlogRedirect(db: DbClient, siteId: string | null, slug: string) {
  const resolvedSiteId = siteId ?? PLATFORM_SITE_ID
  const row = await queryFirst<{ to_path: string | null } | null>(db, `
    SELECT to_path FROM site_redirects
     WHERE site_id = ? AND locale = 'en'
       AND from_path IN (?, ?, ?) AND behavior = 'redirect'
     LIMIT 1
  `, [resolvedSiteId, `/blog/${slug}`, `/article/${slug}`, `/${slug}`])
  return row?.to_path ?? null
}

export async function createBlogRedirect(db: D1Database, postId: string, siteId: string | null, oldSlug: string) {
  const now = new Date().toISOString()
  const resolvedSiteId = siteId ?? PLATFORM_SITE_ID
  const post = await queryFirst<{ id: string; organization_id: string; slug: string; category: string | null; theme: string | null; theme_id: string | null }>(db, `
    SELECT p.id, p.organization_id, p.slug, p.category, s.theme, s.theme_id
      FROM blog_posts p JOIN sites s ON s.id = p.site_id
     WHERE p.id = ? AND p.site_id = ? LIMIT 1
  `, [postId, resolvedSiteId])
  if (!post) throw new HTTPError({ statusCode: 400, statusMessage: 'Blog redirect scope must match its post' })
  const platform = resolvedSiteId === PLATFORM_SITE_ID
  const oldPath = platform ? resolveBlogPublicPath({ scope: 'platform', slug: oldSlug, category: post.category }) : tenantBlogPostPath(post, oldSlug)
  const newPath = platform ? resolveBlogPublicPath({ scope: 'platform', slug: post.slug, category: post.category }) : tenantBlogPostPath(post, post.slug)
  const result = await execute(db, `INSERT INTO site_redirects
    (id, organization_id, site_id, locale, owner_type, owner_id, from_path, to_path, status_code, behavior, reason, source, created_at, updated_at)
    VALUES (?, ?, ?, 'en', ?, ?, ?, ?, 301, 'redirect', ?, ?, ?, ?)
    ON CONFLICT(site_id, locale, from_path) DO UPDATE SET owner_type = excluded.owner_type, owner_id = excluded.owner_id,
      to_path = excluded.to_path, status_code = 301, behavior = 'redirect', reason = excluded.reason, source = excluded.source, updated_at = excluded.updated_at`,
  [crypto.randomUUID(), post.organization_id, resolvedSiteId, platform ? 'platform_blog_post' : 'tenant_blog_post', postId, oldPath, newPath, platform ? 'platform_blog_slug_change' : 'tenant_blog_slug_change', platform ? 'platform-blog' : 'tenant-blog', now, now])
  if (Number(result.meta.changes ?? 0) === 0) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Blog redirect scope must match its post' })
  }
}
