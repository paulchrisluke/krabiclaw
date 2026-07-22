import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { deletePost } from '~/server/utils/post-management'
import { queryFirst } from '~/server/db'
import { loadMemberSiteRow } from '~/server/utils/location-access'
import { assertResourceAccess } from '~/server/utils/member-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const postId = getRouterParam(event, 'postId')
  if (!siteId || !postId) return jsonResponse({ error: 'Site ID and Post ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await loadMemberSiteRow(db, siteId, session.user.id)
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const post = await queryFirst<{ location_id: string | null }>(db, `
    SELECT location_id FROM posts
    WHERE id = ? AND organization_id = ? AND site_id = ?
    LIMIT 1
  `, [postId, site.organization_id, siteId])
  if (!post) return jsonResponse({ error: 'Post not found' }, { status: 404 })
  await assertResourceAccess(db, {
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
    resourceLocationId: post.location_id,
  })

  await deletePost(db, site.organization_id, siteId, postId)
  return jsonResponse({ success: true })
})
