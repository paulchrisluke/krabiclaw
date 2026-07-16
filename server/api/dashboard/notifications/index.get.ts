import { getQuery } from 'h3'
import { queryAll, queryFirst } from '~/server/db'
import { jsonResponse } from '~/server/utils/api-response'
import { getNotificationAccess } from '~/server/utils/notification-access'

interface NotificationRow {
  id: string
  scope: 'platform' | 'organization' | 'site'
  event_type: string
  severity: 'info' | 'success' | 'warning' | 'error'
  organization_id: string | null
  site_id: string | null
  location_id: string | null
  actor_user_id: string | null
  target_user_id: string | null
  title: string | null
  message: string | null
  deep_link: string | null
  payload: string | null
  created_at: string
  read_at: string | null
}

function parsePayload(payload: string | null): Record<string, unknown> | null {
  if (!payload) return null
  try {
    const parsed = JSON.parse(payload)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export default defineEventHandler(async (event) => {
  const access = await getNotificationAccess(event)
  const rawLimit = Number(getQuery(event).limit ?? 20)
  const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, Math.trunc(rawLimit))) : 20

  const [rows, count] = await Promise.all([
    queryAll<NotificationRow>(access.db, `
      SELECT n.id, n.scope, n.event_type, n.severity, n.organization_id, n.site_id,
             n.location_id, n.actor_user_id, n.target_user_id, n.title, n.message,
             n.deep_link, n.payload, n.created_at, COALESCE(nr.read_at, n.read_at) AS read_at
      FROM notifications n
      LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
      WHERE ${access.whereSql}
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT ?
    `, [access.userId, ...access.whereParams, limit]),
    queryFirst<{ count: number }>(access.db, `
      SELECT COUNT(*) AS count
      FROM notifications n
      LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
      WHERE ${access.whereSql} AND COALESCE(nr.read_at, n.read_at) IS NULL
    `, [access.userId, ...access.whereParams]),
  ])

  return jsonResponse({
    notifications: rows.map(row => ({ ...row, payload: parsePayload(row.payload) })),
    unread_count: Number(count?.count ?? 0),
  })
})
