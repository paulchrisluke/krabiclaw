import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getPost } from '~/server/utils/post-management'
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

  const site = await loadMemberOrganizationRow(event, db, env, organizationId, session.user.id)
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const post = await getPost(db, site.id, postId)
  if (!post) return jsonResponse({ error: 'Post not found' }, { status: 404 })

  await assertResourceAccess(db, { ...memberAccessPrincipal(site.membership, { env, event }), resourceLocationId: post.location_id ?? null })

  return jsonResponse({ success: true, post })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
