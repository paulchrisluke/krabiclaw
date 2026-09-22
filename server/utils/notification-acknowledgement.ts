import { execute, type DbClient } from '~/server/db'

interface NotificationVisibility {
  userId: string
  whereSql: string
  whereParams: unknown[]
}

async function acknowledgeVisibleNotifications(
  db: DbClient,
  visibility: NotificationVisibility,
  selectionSql: string,
  selectionParams: unknown[],
): Promise<number> {
  const command = crypto.randomUUID()
  const now = new Date().toISOString()
  const result = await execute(db, `
    INSERT INTO activity_entries (id, kind, scope_kind, organization_id, location_id, parent_id, actor_kind, actor_user_id, dedupe_key, occurred_at, created_at)
    SELECT ? || ':' || n.id, 'acknowledgement', n.scope_kind, n.organization_id, n.location_id, n.id, 'member', ?, ? || ':' || n.id, ?, ?
    FROM activity_entries n WHERE n.kind = 'notification' AND ${selectionSql} AND ${visibility.whereSql}
    ON CONFLICT(dedupe_key) DO NOTHING
  `, [command, visibility.userId, `ack:${command}`, now, now, ...selectionParams, ...visibility.whereParams])
  return Number(result?.meta?.changes ?? 0)
}

export async function acknowledgeNotification(
  db: DbClient,
  visibility: NotificationVisibility,
  notificationId: string,
): Promise<boolean> {
  return await acknowledgeVisibleNotifications(db, visibility, 'n.id = ?', [notificationId]) > 0
}

export async function acknowledgeAllNotifications(
  db: DbClient,
  visibility: NotificationVisibility,
): Promise<number> {
  return await acknowledgeVisibleNotifications(db, visibility, '1 = 1', [])
}

export async function acknowledgeThreadNotifications(
  db: DbClient,
  visibility: NotificationVisibility,
  threadId: string,
): Promise<number> {
  return await acknowledgeVisibleNotifications(
    db,
    visibility,
    'n.parent_id IN (SELECT id FROM activity_entries WHERE request_id = ?)',
    [threadId],
  )
}
