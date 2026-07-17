// POST /api/admin/blog/posts - Create platform blog post
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'
import { createPlatformBlogPost } from '~/server/utils/platform-content'
import { platformContentNavInput } from '~/server/utils/platform-content-request'
import { schedulePlatformKnowledgeIndexRebuild } from '~/server/utils/platform-search-rebuild'

import type { PlatformBlogPostRequestBody } from '~/server/types/platform-content'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  if (!isPlatformAdmin(session.user, env)) {
    return jsonResponse({ error: 'Platform admin access required' }, { status: 403 })
  }

  let body: PlatformBlogPostRequestBody
  try { body = await readBody(event) } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const result = await createPlatformBlogPost(db, session.user.id, {
      title: body.title ?? '',
      content_blocks: body.content_blocks ?? [],
      excerpt: body.excerpt ?? null,
      category: body.category ?? null,
      ...platformContentNavInput(body, { defaultHideFromNav: false }),
      seo_description: body.seo_description ?? null,
      seo_keywords: body.seo_keywords ?? null,
      canonical_url: body.canonical_url ?? null,
      robots: body.robots ?? null,
      featured_image_asset_id: body.featured_image_asset_id ?? null,
      publish: body.publish ?? false,
    })
    schedulePlatformKnowledgeIndexRebuild(event, env, 'blog post create')
    return jsonResponse(result)
  } catch (err) {
    const statusCode = typeof (err as { statusCode?: unknown })?.statusCode === 'number' ? Number((err as { statusCode: number }).statusCode) : 500
    const message = err instanceof Error ? err.message : 'Failed to create post'
    if (statusCode >= 500) console.error('Failed to create blog post:', err)
    return jsonResponse({ error: message }, { status: statusCode })
  }
})
