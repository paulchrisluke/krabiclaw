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
  const result = await execute(db, `
    INSERT INTO notification_reads (notification_id, user_id, read_at)
    SELECT n.id, ?, ?
    FROM notifications n
    WHERE ${selectionSql} AND ${visibility.whereSql}
    ON CONFLICT(notification_id, user_id) DO UPDATE SET read_at = excluded.read_at
  `, [visibility.userId, new Date().toISOString(), ...selectionParams, ...visibility.whereParams])
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
    'n.source_entry_id IN (SELECT id FROM guest_thread_entries WHERE thread_id = ?)',
    [threadId],
  )
}
