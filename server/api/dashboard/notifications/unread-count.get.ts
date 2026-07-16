import { queryFirst } from '~/server/db'
import { jsonResponse } from '~/server/utils/api-response'
import { getNotificationAccess } from '~/server/utils/notification-access'

export default defineEventHandler(async (event) => {
  const access = await getNotificationAccess(event)
  const row = await queryFirst<{ count: number }>(access.db, `
    SELECT COUNT(*) AS count
    FROM notifications n
    LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
    WHERE ${access.whereSql} AND COALESCE(nr.read_at, n.read_at) IS NULL
  `, [access.userId, ...access.whereParams])

  return jsonResponse({ unread_count: Number(row?.count ?? 0) })
})
