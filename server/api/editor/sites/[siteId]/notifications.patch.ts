import { getHeaders } from 'h3'
import { jsonResponse } from '~/server/utils/api-response'
import { updateNotificationsSettings } from '~/server/utils/mcp-workflows'
import { hasSiteEntitlement } from '~/server/utils/billing'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const body = await readBody(event) as { whatsapp_phone?: string; channels?: string[] }
  if (!body.whatsapp_phone?.trim() && body.channels === undefined) {
    return jsonResponse({ error: 'whatsapp_phone or channels is required' }, { status: 400 })
  }

  if (body.channels !== undefined) {
    if (!Array.isArray(body.channels)) {
      return jsonResponse({ error: 'channels must be an array' }, { status: 400 })
    }
    if (body.channels.length === 0 || !body.channels.every(c => c === 'whatsapp' || c === 'email')) {
      return jsonResponse({ error: 'channels must only contain valid values (whatsapp or email)' }, { status: 400 })
    }
  }

  const { env, db, site } = await requireSiteAccess(event, siteId)

  const wantsWhatsApp = Boolean(body.whatsapp_phone?.trim()) || (body.channels?.includes('whatsapp') ?? false)
  if (wantsWhatsApp && !(await hasSiteEntitlement(db, siteId, 'whatsapp_notifications'))) {
    return jsonResponse({ error: 'WhatsApp notifications require a Growth plan or higher.' }, { status: 403 })
  }

  const notifications = await updateNotificationsSettings(db, site.organization_id, siteId, body.whatsapp_phone?.trim(), body.channels, env, getHeaders(event) as HeadersInit)
  return jsonResponse({ success: true, notifications })
})
