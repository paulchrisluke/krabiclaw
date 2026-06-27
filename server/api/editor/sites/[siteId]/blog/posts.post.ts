// POST /api/editor/sites/[siteId]/blog/posts - Create a tenant site blog post
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { createPlatformBlogPost } from '~/server/utils/platform-content'
import { queryFirst } from '~/server/db'

import type { PlatformBlogPostRequestBody } from '~/server/types/platform-content'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await queryFirst<{ id: string; organization_id: string }>(db, `
    SELECT s.id, s.organization_id FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member m ON o.id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner','admin','editor') LIMIT 1
  `, [siteId, session.user.id])
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  let body: PlatformBlogPostRequestBody
  try { body = await readBody(event) } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const result = await createPlatformBlogPost(db, session.user.id, {
      title: body.title ?? '',
      body: body.body ?? '',
      excerpt: body.excerpt ?? null,
      category: body.category ?? null,
      seo_description: body.seo_description ?? null,
      seo_keywords: body.seo_keywords ?? null,
      canonical_url: body.canonical_url ?? null,
      robots: body.robots ?? null,
      featured_image_asset_id: body.featured_image_asset_id ?? null,
      faq_items: body.faq_items,
      faq_label: body.faq_label,
      faq_status: body.faq_status,
      faq_render_enabled: body.faq_render_enabled,
      faq_schema_enabled: body.faq_schema_enabled,
      how_to_steps: body.how_to_steps,
      how_to_estimated_time: body.how_to_estimated_time,
      how_to_tool_items: body.how_to_tool_items,
      how_to_supply_items: body.how_to_supply_items,
      how_to_label: body.how_to_label,
      how_to_status: body.how_to_status,
      how_to_render_enabled: body.how_to_render_enabled,
      how_to_schema_enabled: body.how_to_schema_enabled,
      components: body.components,
      publish: body.publish ?? false,
    }, { site_id: siteId, organization_id: site.organization_id })
    return jsonResponse(result, { status: 201 })
  } catch (err) {
    const statusCode = typeof (err as { statusCode?: unknown })?.statusCode === 'number' ? Number((err as { statusCode: number }).statusCode) : 500
    if (statusCode >= 500) console.error('Failed to create site blog post:', err)
    const message = statusCode >= 500 ? 'Failed to create post' : err instanceof Error ? err.message : 'Failed to create post'
    return jsonResponse({ error: message }, { status: statusCode })
  }
})
