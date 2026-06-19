import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { updateNotificationsSettings } from '~/server/utils/mcp-workflows'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const body = await readBody(event) as { whatsapp_phone?: string; channels?: string[] }
  if (!body.whatsapp_phone?.trim()) {
    return jsonResponse({ error: 'whatsapp_phone is required' }, { status: 400 })
  }

  if (body.channels !== undefined && !Array.isArray(body.channels)) {
    return jsonResponse({ error: 'channels must be an array' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db.prepare(`
    SELECT s.id, s.organization_id FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member om ON o.id = om.organizationId
    WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin')
    LIMIT 1
  `).bind(siteId, session.user.id).first<{ id: string; organization_id: string }>()

  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const notifications = await updateNotificationsSettings(db, site.organization_id, siteId, body.whatsapp_phone.trim(), body.channels)
  return jsonResponse({ success: true, notifications })
})
