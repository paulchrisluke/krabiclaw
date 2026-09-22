import type { PostMutation } from '~/shared/posts'
import { cloudflareEnv, jsonResponse, readStrictBody } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { PostValidationError, getPost, updatePost } from '~/server/utils/post-management'
import { assertResourceAccess, memberAccessPrincipal } from '~/server/utils/member-access'
import { loadMemberOrganizationRow } from '~/server/utils/location-access'



export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const postId = getRouterParam(event, 'postId')
  if (!organizationId || !postId) return jsonResponse({ error: 'Site ID and Post ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readStrictBody<PostMutation>(event, {
    title: 'string', body: 'string', slug: 'nullable-string',
    seo_title: 'nullable-string', seo_description: 'nullable-string',
    scheduled_for: 'nullable-string', location_id: 'nullable-string', post_type: 'string',
    event: 'unknown', offer: 'unknown', call_to_action: 'unknown', alert_type: 'nullable-string',
  })

  const site = await loadMemberOrganizationRow(event, db, env, organizationId, session.user.id)
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const existingPost = await getPost(db, site.id, postId)
  if (!existingPost) return jsonResponse({ error: 'Post not found' }, { status: 404 })

  const principal = memberAccessPrincipal(site.membership, { env, event })
  await assertResourceAccess(db, { ...principal, resourceLocationId: existingPost.location_id ?? null })
  // Moving the post to a different location is itself checked against the
  // target scope, not just the post's current one.
  if ('location_id' in body) {
    await assertResourceAccess(db, { ...principal, resourceLocationId: body.location_id || null })
  }

  let post
  try {
    post = await updatePost(db, site.id, postId, body, session.user.id, env)
  } catch (error) {
    if (error instanceof PostValidationError) {
      return jsonResponse({ error: error.message }, { status: error.statusCode })
    }
    throw error
  }

  if (!post) return jsonResponse({ error: 'Post not found' }, { status: 404 })
  return jsonResponse({ success: true, post })
})
import { defineHandler } from 'nitro';
import { getRouterParam  } from 'nitro/h3';
