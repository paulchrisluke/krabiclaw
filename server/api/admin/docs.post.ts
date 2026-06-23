// POST /api/admin/docs - Create platform doc
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'
import { createPlatformDoc } from '~/server/utils/platform-content'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  if (!isPlatformAdmin(session.user, env)) {
    return jsonResponse({ error: 'Platform admin access required' }, { status: 403 })
  }

  let body: {
    title?: string
    body?: string
    excerpt?: string
    category?: string
    seo_description?: string
    seo_keywords?: string
    canonical_url?: string
    robots?: string
    difficulty_level?: string
    sort_order?: number
    parent_doc_id?: string
    featured_image_asset_id?: string
    faq_items?: Array<{ question: string; answer: string }>
    how_to_steps?: Array<{ name: string; text: string; image_asset_id?: string; url?: string }>
    publish?: boolean
  }
  try { body = await readBody(event) } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const result = await createPlatformDoc(db, session.user.id, {
      title: body.title ?? '',
      body: body.body ?? '',
      excerpt: body.excerpt ?? null,
      category: body.category ?? null,
      seo_description: body.seo_description ?? null,
      seo_keywords: body.seo_keywords ?? null,
      canonical_url: body.canonical_url ?? null,
      robots: body.robots ?? null,
      difficulty_level: body.difficulty_level ?? null,
      sort_order: body.sort_order ?? 0,
      parent_doc_id: body.parent_doc_id ?? null,
      featured_image_asset_id: body.featured_image_asset_id ?? null,
      faq_items: body.faq_items,
      how_to_steps: body.how_to_steps,
      publish: body.publish ?? false,
    })
    return jsonResponse(result)
  } catch (err) {
    const statusCode = typeof (err as { statusCode?: unknown })?.statusCode === 'number' ? Number((err as { statusCode: number }).statusCode) : 500
    const message = err instanceof Error ? err.message : 'Failed to create doc'
    if (statusCode >= 500) console.error('Failed to create doc:', err)
    return jsonResponse({ error: message }, { status: statusCode })
  }
})
