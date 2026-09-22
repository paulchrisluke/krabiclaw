// GET /api/public/blog?collection=blog|docs — the requesting tenant's published articles
//
// This was two routes. `/api/public/blog` served KrabiClaw's own articles
// through `listPublicPlatformBlogPosts`, which was `listBlogPosts` with the
// platform site looked up and hardcoded; `/api/public/sites/[siteId]/blog`
// served everyone else's from a near-identical query. The platform is an
// ordinary tenant, so that was one concept with two implementations, and the
// tenant half took its site id from the URL instead of from the host that had
// already identified it.
//
// One route now. The tenant comes from `event.context.organizationId`, which
// tenant-resolution sets from the host, so krabiclaw.com gets KrabiClaw's
// articles and a tenant domain gets that tenant's, by the same code.
import { queryAll } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { attachCover } from '~/server/utils/content/publishing'
import { COVER_SELECT, coverJoinSql } from '~/server/utils/content/cover'
import { isArticleCollection } from '~/utils/article-collections'
import { defineHandler } from 'nitro'
import { getQuery } from 'nitro/h3'

export default defineHandler(async (event) => {
  const organizationId = event.context.organizationId
  if (!organizationId) return jsonResponse({ error: 'Unknown tenant' }, { status: 404 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  // Absent means every collection, which is what a tenant blog asked for when
  // it had no collection concept at all. Naming one narrows to it.
  const requested = getQuery(event).collection
  if (requested !== undefined && !isArticleCollection(requested)) {
    return jsonResponse({ error: 'Unknown collection' }, { status: 400 })
  }
  const collection = requested === undefined ? null : requested

  const sql = `
    SELECT
      p.id, p.title, p.slug, p.summary AS excerpt, (p.metadata_json ->> '$.collection') AS collection,
      (p.metadata_json ->> '$.category') AS category, p.seo_description, p.seo_keywords,
      p.canonical_url, p.robots, p.published_at, p.updated_at, p.sort_order, ${COVER_SELECT}
    FROM content_documents p
    ${coverJoinSql('p')}
    WHERE p.kind = 'article' AND p.row_role = 'root' AND p.status = 'published'
      AND p.organization_id = ? AND p.visibility = 'public'
      ${collection === null ? '' : "AND (p.metadata_json ->> '$.collection') = ?"}
    ORDER BY ${collection === 'docs' ? 'p.sort_order, p.title' : 'p.published_at IS NULL, p.published_at DESC, p.id DESC'}
    LIMIT 200
  `

  try {
    const params = collection === null ? [organizationId] : [organizationId, collection]
    const results = await queryAll<ApiRecord>(db, sql, params)
    return jsonResponse({ posts: (results ?? []).map(attachCover) })
  } catch (err) {
    console.error('Failed to fetch public blog posts:', err)
    return jsonResponse({ error: 'Failed to fetch posts' }, { status: 500 })
  }
})
