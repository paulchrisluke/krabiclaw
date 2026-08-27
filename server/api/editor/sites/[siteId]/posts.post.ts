import { cloudflareEnv, jsonResponse, readStrictBody } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { createPost, PostValidationError } from '~/server/utils/post-management'
import { assertResourceAccess } from '~/server/utils/member-access'
import { loadMemberSiteRow } from '~/server/utils/location-access'

interface EditorPostBody {
  title?: string; body?: string; slug?: string | null
  seo_title?: string | null; seo_description?: string | null
  media?: unknown; scheduled_for?: string; location_id?: string
  post_type?: string; cta_type?: string; cta_url?: string; event_title?: string
  event_start?: string; event_end?: string; offer_coupon?: string; offer_terms?: string
}

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readStrictBody<EditorPostBody>(event, {
    title: 'string', body: 'string', slug: 'nullable-string',
    seo_title: 'nullable-string', seo_description: 'nullable-string', media: 'unknown',
    scheduled_for: 'string', location_id: 'string', post_type: 'string', cta_type: 'string',
    cta_url: 'string', event_title: 'string', event_start: 'string', event_end: 'string',
    offer_coupon: 'string', offer_terms: 'string',
  })
  if (!body.body?.trim()) return jsonResponse({ error: 'Post body is required' }, { status: 400 })

  const site = await loadMemberSiteRow(db, env, siteId, session.user.id)
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const targetLocationId = typeof body.location_id === 'string' && body.location_id ? body.location_id : null
  await assertResourceAccess(db, {
    env,
    memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId, resourceLocationId: targetLocationId, })

  let post
  try {
    post = await createPost(db, site.organization_id, siteId, {
      title: body.title?.trim() || undefined, body: body.body.trim(), slug: body.slug || undefined, seo_title: body.seo_title || undefined, seo_description: body.seo_description || undefined, media: body.media, scheduled_for: body.scheduled_for || undefined, location_id: body.location_id || undefined, post_type: body.post_type || undefined, cta_type: body.cta_type || undefined, cta_url: body.cta_url || undefined, event_title: body.event_title || undefined, event_start: body.event_start || undefined, event_end: body.event_end || undefined, offer_coupon: body.offer_coupon || undefined, offer_terms: body.offer_terms || undefined, }, session.user.id, env)
  } catch (error) {
    if (error instanceof PostValidationError) {
      return jsonResponse({ error: error.message }, { status: error.statusCode })
    }
    throw error
  }

  return jsonResponse({ success: true, post }, { status: 201 })
})
import { defineHandler } from 'nitro';
import { getRouterParam  } from 'nitro/h3';
