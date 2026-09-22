import type { PostMutation } from '~/shared/posts'
import { cloudflareEnv, jsonResponse, readStrictBody } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { createPost, PostValidationError } from '~/server/utils/post-management'
import { assertResourceAccess, memberAccessPrincipal } from '~/server/utils/member-access'
import { loadMemberSiteRow } from '~/server/utils/location-access'



export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Organization ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readStrictBody<PostMutation>(event, {
    title: 'string', body: 'string', slug: 'nullable-string',
    seo_title: 'nullable-string', seo_description: 'nullable-string', media: 'unknown',
    scheduled_for: 'nullable-string', location_id: 'nullable-string', post_type: 'string',
    event: 'unknown', offer: 'unknown', call_to_action: 'unknown', alert_type: 'nullable-string',
  })
  if (!body.body?.trim()) return jsonResponse({ error: 'Post body is required' }, { status: 400 })

  const site = await loadMemberSiteRow(event, db, env, organizationId, session.user.id)
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const targetLocationId = typeof body.location_id === 'string' && body.location_id ? body.location_id : null
  await assertResourceAccess(db, { ...memberAccessPrincipal(site.membership, { env, organizationId, event }), resourceLocationId: targetLocationId })

  let post
  try {
    post = await createPost(db, site.organization_id, organizationId, body, session.user.id, env)
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
