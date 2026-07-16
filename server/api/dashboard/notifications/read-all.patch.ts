import { execute } from '~/server/db'
import { jsonResponse } from '~/server/utils/api-response'
import { getNotificationAccess } from '~/server/utils/notification-access'

export default defineEventHandler(async (event) => {
  const access = await getNotificationAccess(event)
  const now = new Date().toISOString()
  await execute(access.db, `
    INSERT INTO notification_reads (notification_id, user_id, read_at)
    SELECT n.id, ?, ?
    FROM notifications n
    WHERE ${access.whereSql}
    ON CONFLICT(notification_id, user_id) DO UPDATE SET read_at = excluded.read_at
  `, [access.userId, now, ...access.whereParams])

  return jsonResponse({ success: true, unread_count: 0 })
})
