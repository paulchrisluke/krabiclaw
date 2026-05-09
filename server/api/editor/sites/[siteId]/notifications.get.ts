import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getOrgWhatsAppPhone } from '~/server/utils/whatsapp'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db.prepare(`
    SELECT s.id, s.organization_id FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member om ON o.id = om.organizationId
    WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin')
    LIMIT 1
  `).bind(siteId, session.user.id).first()

  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const whatsappPhone = await getOrgWhatsAppPhone(db, site.organization_id, siteId)

  return jsonResponse({ success: true, notifications: { whatsapp_phone: whatsappPhone } })
})
