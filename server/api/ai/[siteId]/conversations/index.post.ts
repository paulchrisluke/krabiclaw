import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { createConversation, getSiteForMember } from '~/server/utils/chowbot-conversations'

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'siteId')
    if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

    const env = cloudflareEnv(event)
    const db = env.DB
    if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

    const session = await getAuthSession(event, env)
    if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

    const site = await getSiteForMember(db, siteId, session.user.id)
    if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

    let body: { title?: string; locationId?: string | null } = {}
    try {
      const parsedBody = await readBody(event)
      if (parsedBody && typeof parsedBody === 'object') {
        body = parsedBody as { title?: string; locationId?: string | null }
      }
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode ?? 0)
      const message = String((error as { message?: string })?.message ?? '')
      if (statusCode === 400 || /json|parse|unexpected token/i.test(message)) {
        return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
      }
      console.error('Failed to parse conversation request body:', error)
      return jsonResponse({ error: 'Internal server error' }, { status: 500 })
    }

    // Validate locationId if provided
    if (typeof body.locationId === 'string' && body.locationId) {
      const location = await db.prepare(
        'SELECT id FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1'
      ).bind(body.locationId, siteId).first()
      if (!location) {
        return jsonResponse({ error: 'Invalid location ID' }, { status: 400 })
      }
    }

    const conversation = await createConversation(db, {
      organizationId: site.organization_id,
      siteId,
      userId: session.user.id,
      title: body.title,
      activeChannel: 'dashboard',
      selectedLocationId: (typeof body.locationId === 'string' && body.locationId) ? body.locationId : null,
    })

    return jsonResponse({ success: true, conversation }, { status: 201 })
  } catch (error) {
    console.error('Error creating conversation:', error)
    return jsonResponse({ error: 'Internal server error' }, { status: 500 })
  }
})
