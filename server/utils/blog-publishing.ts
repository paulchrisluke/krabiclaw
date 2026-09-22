import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import { HTTPError } from 'nitro';
import { tenantBlogPostPath } from '~/utils/tenant-blog-route'

export async function publishDueBlogPosts(db: D1Database, now = new Date()) {
  const contentIssues = await queryAll<{ id: string }>(db, `SELECT id FROM content_documents
    WHERE kind = 'article' AND row_role = 'root' AND status = 'scheduled' AND scheduled_for IS NULL ORDER BY id`)
  const due = await queryAll<{ id: string; scheduled_for: string; updated_at: string }>(db, `
    SELECT id, scheduled_for, updated_at FROM content_documents
    WHERE kind = 'article' AND row_role = 'root' AND status = 'scheduled' AND scheduled_for <= ?
    ORDER BY scheduled_for LIMIT 100`, [now.toISOString()])
  let published = 0
  for (const row of due) {
    const timestamp = new Date(Math.max(now.getTime(), Date.parse(row.updated_at) + 1)).toISOString()
    const result = await execute(db, `UPDATE content_documents SET status = 'published',
      published_at = scheduled_for, first_published_at = COALESCE(first_published_at, scheduled_for),
      scheduled_for = NULL, updated_at = ? WHERE kind = 'article' AND row_role = 'root' AND id = ?
      AND status = 'scheduled' AND scheduled_for = ? AND updated_at = ?`, [timestamp, row.id, row.scheduled_for, row.updated_at])
    published += Number(result.meta.changes)
  }
  return { published, scheduled_content_issues: contentIssues.map(row => row.id) }
}

export async function resolveBlogRedirect(db: DbClient, organizationId: string | null, slug: string) {
  const row = await queryFirst<{ to_path: string | null } | null>(db, `
    SELECT to_path FROM organization_redirects
     WHERE organization_id = ? AND locale = 'en'
       AND from_path IN (?, ?, ?) AND behavior = 'redirect'
     LIMIT 1
  `, [organizationId, `/blog/${slug}`, `/article/${slug}`, `/${slug}`])
  return row?.to_path ?? null
}

export async function createBlogRedirect(db: D1Database, postId: string, organizationId: string | null, oldSlug: string) {
  const now = new Date().toISOString()
  const post = await queryFirst<{ id: string; organization_id: string; slug: string; category: string | null; theme_id: string | null }>(db, `
    SELECT p.id, p.organization_id, p.slug, (p.metadata_json ->> '$.category') AS category, s.theme_id
      FROM content_documents p JOIN organization s ON s.id = p.organization_id
     WHERE p.kind = 'article' AND p.row_role = 'root' AND p.id = ? AND p.organization_id = ? LIMIT 1
  `, [postId, organizationId])
  if (!post) throw new HTTPError({ statusCode: 400, statusMessage: 'Blog redirect scope must match its post' })
  const oldPath = tenantBlogPostPath({ themeId: post.theme_id }, oldSlug)
  const newPath = tenantBlogPostPath({ themeId: post.theme_id }, post.slug)
  // The scope check is the SELECT above: the post was read under the caller's
  // organization, so the redirect cannot be written against another tenant's.
  await execute(db, `INSERT INTO organization_redirects
    (id, organization_id, locale, owner_type, owner_id, from_path, to_path, status_code, behavior, reason, source, created_at, updated_at)
    VALUES (?, ?, 'en', ?, ?, ?, ?, 301, 'redirect', ?, ?, ?, ?)
    ON CONFLICT(organization_id, locale, from_path) DO UPDATE SET owner_type = excluded.owner_type, owner_id = excluded.owner_id,
      to_path = excluded.to_path, status_code = 301, behavior = 'redirect', reason = excluded.reason, source = excluded.source, updated_at = excluded.updated_at`,
  [crypto.randomUUID(), post.organization_id, 'content_document', postId, oldPath, newPath, 'blog_slug_change', 'blog', now, now])
}
