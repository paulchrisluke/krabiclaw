import {  getRouterParam , readBody  } from 'nitro/h3';
import { jsonResponse } from '~/server/utils/api-response'
import { updateNotificationsSettings } from '~/server/utils/mcp-workflows'
import { hasSiteEntitlement } from '~/server/utils/billing'
import { requireOrganizationAccess } from '~/server/utils/location-access'

// The site's WhatsApp business number. Which channels a person wants to be
// reached on is per-account and lives at /api/user/notification-preferences.
export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Organization ID required' }, { status: 400 })

  const body = await readBody(event) as { whatsapp_phone?: string }
  if (typeof body.whatsapp_phone !== 'string') {
    return jsonResponse({ error: 'whatsapp_phone is required' }, { status: 400 })
  }

  const { env, db, organization } = await requireOrganizationAccess(event, organizationId)

  if (body.whatsapp_phone.trim() && !(await hasSiteEntitlement(env, db, organizationId, 'messaging'))) {
    return jsonResponse({ error: 'WhatsApp notifications require a Growth plan or higher.' }, { status: 403 })
  }

  const notifications = await updateNotificationsSettings(db, organization.id, body.whatsapp_phone)
  return jsonResponse({ success: true, notifications })
})
import { defineHandler } from 'nitro';
