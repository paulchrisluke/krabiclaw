import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { listPosts } from '~/server/utils/post-management'
import { assertResourceAccess, memberAccessPrincipal } from '~/server/utils/member-access'
import { loadMemberOrganizationRow } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Organization ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await loadMemberOrganizationRow(event, db, env, organizationId, session.user.id)
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const query = getQuery(event)
  const status = typeof query.status === 'string' ? query.status : undefined
  const rawLocationId = typeof query.location_id === 'string' ? query.location_id.trim() : ''
  const locationId = rawLocationId || undefined

  // No location_id filter means "every post across the whole site" — only a
  // site-wide-scoped member may see that; a location-scoped editor must
  // filter to their own location.
  await assertResourceAccess(db, { ...memberAccessPrincipal(site.membership, { env, event }), resourceLocationId: locationId ?? null })
  const posts = await listPosts(db, site.id, status, locationId)
  return jsonResponse({ success: true, posts })
})
import { defineHandler } from 'nitro';
import { getQuery, getRouterParam  } from 'nitro/h3';
