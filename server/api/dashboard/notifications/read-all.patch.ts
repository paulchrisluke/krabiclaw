import { defineHandler } from 'nitro'
import { jsonResponse } from '~/server/utils/api-response'
import { publishNotificationInvalidation } from '~/server/cloudflare/guest-inbox-events'
import { acknowledgeAllNotifications } from '~/server/utils/notification-acknowledgement'
import { getNotificationAccess } from '~/server/utils/notification-access'

export default defineHandler(async (event) => {
  const access = await getNotificationAccess(event)
  const acknowledged = await acknowledgeAllNotifications(access.db, access)
  if (acknowledged > 0 && access.organization) {
    await publishNotificationInvalidation(access.env, {
      type: 'notification.read',
      organizationId: access.organization.id,
      siteId: null,
      locationId: null,
      targetUserId: access.userId,
    })
  }

  return jsonResponse({ success: true, unread_count: 0 })
})
