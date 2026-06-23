// PATCH /api/admin/docs/[docId] - Update platform doc
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'
import { updatePlatformDoc } from '~/server/utils/platform-content'

export default defineEventHandler(async (event) => {
  const docId = getRouterParam(event, 'docId')
  if (!docId) return jsonResponse({ error: 'Doc ID required' }, { status: 400 })

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
    faq_label?: string
    faq_status?: 'active' | 'inactive'
    faq_render_enabled?: boolean
    faq_schema_enabled?: boolean
    how_to_steps?: Array<{ name: string; text: string; image_asset_id?: string; url?: string }>
    how_to_label?: string
    how_to_status?: 'active' | 'inactive'
    how_to_render_enabled?: boolean
    how_to_schema_enabled?: boolean
    publish?: boolean
    unpublish?: boolean
  }
  try { body = await readBody(event) } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    return jsonResponse(await updatePlatformDoc(db, docId, body))
  } catch (err) {
    const statusCode = typeof (err as { statusCode?: unknown })?.statusCode === 'number' ? Number((err as { statusCode: number }).statusCode) : 500
    const message = err instanceof Error ? err.message : 'Failed to update doc'
    if (statusCode >= 500) console.error('Failed to update doc:', err)
    return jsonResponse({ error: message }, { status: statusCode })
  }
})
