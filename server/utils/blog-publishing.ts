import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import { tenantBlogPostPath } from '~/utils/tenant-blog-route'
import type { ContentBlockSnapshot } from '~/server/utils/content-documents'

export async function publishDueBlogPosts(db: D1Database, now = new Date()) {
  const due = await queryAll<{ id: string }>(db, `
    SELECT id FROM blog_posts
     WHERE status = 'scheduled' AND scheduled_for IS NOT NULL AND scheduled_for <= ?
     ORDER BY scheduled_for ASC LIMIT 100
  `, [now.toISOString()])
  let published = 0
  for (const row of due ?? []) {
    const timestamp = now.toISOString()
    const result = await queryFirst<{ id: string } | null>(db, `
      UPDATE blog_posts
         SET status = 'published', published_at = COALESCE(published_at, scheduled_for, ?),
             first_published_at = COALESCE(first_published_at, scheduled_for, ?), updated_at = ?
       WHERE id = ? AND status = 'scheduled' AND scheduled_for <= ?
       RETURNING id
    `, [timestamp, timestamp, timestamp, row.id, timestamp])
    if (result) published++
  }
  return { published }
}

export async function resolveBlogRedirect(db: DbClient, siteId: string | null, slug: string) {
  const row = await queryFirst<{ slug: string; theme: string | null; theme_id: string | null } | null>(db, `
    SELECT p.slug, s.theme, s.theme_id
      FROM blog_post_redirects r
      JOIN blog_posts p ON p.id = r.post_id
      LEFT JOIN sites s ON s.id = p.site_id
     WHERE r.old_slug = ? AND ${siteId ? 'r.site_id = ?' : 'r.site_id IS NULL'}
       AND p.status = 'published'
     LIMIT 1
  `, siteId ? [slug, siteId] : [slug])
  if (!row) return null
  return siteId ? tenantBlogPostPath(row, row.slug) : row.slug
}

export async function createBlogRedirect(db: D1Database, postId: string, siteId: string | null, oldSlug: string) {
  await execute(db, `INSERT INTO blog_post_redirects (id, post_id, site_id, old_slug, created_at)
    VALUES (?, ?, ?, ?, ?)`, [crypto.randomUUID(), postId, siteId, oldSlug, new Date().toISOString()])
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
