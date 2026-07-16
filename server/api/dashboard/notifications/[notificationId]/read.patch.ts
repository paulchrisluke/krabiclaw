import { getRouterParam } from 'h3'
import { execute, queryFirst } from '~/server/db'
import { jsonResponse } from '~/server/utils/api-response'
import { getNotificationAccess } from '~/server/utils/notification-access'

export default defineEventHandler(async (event) => {
  const notificationId = getRouterParam(event, 'notificationId')?.trim()
  if (!notificationId) return jsonResponse({ error: 'Notification id is required' }, { status: 400 })

  const access = await getNotificationAccess(event)
  const visible = await queryFirst<{ id: string }>(access.db, `
    SELECT n.id FROM notifications n
    WHERE n.id = ? AND ${access.whereSql}
    LIMIT 1
  `, [notificationId, ...access.whereParams])
  if (!visible) {
    return jsonResponse({ error: 'Notification not found' }, { status: 404 })
  }
  await execute(access.db, `
    INSERT INTO notification_reads (notification_id, user_id, read_at)
    VALUES (?, ?, ?)
    ON CONFLICT(notification_id, user_id) DO UPDATE SET read_at = excluded.read_at
  `, [notificationId, access.userId, new Date().toISOString()])
  return jsonResponse({ success: true })
})
