import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { createConversation, getSiteForMember } from '~/server/utils/chowbot-conversations'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await getSiteForMember(db, siteId, session.user.id)
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const body = await readBody(event).catch(() => ({})) as { title?: string; locationId?: string | null }
  const conversation = await createConversation(db, {
    organizationId: site.organization_id,
    siteId,
    userId: session.user.id,
    title: body.title,
    activeChannel: 'dashboard',
    selectedLocationId: typeof body.locationId === 'string' ? body.locationId : null,
  })

  return jsonResponse({ success: true, conversation }, { status: 201 })
})
