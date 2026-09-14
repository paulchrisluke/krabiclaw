import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_DEFAULTS,
  isMandatoryEmailCategory,
  type NotificationCategory,
  type NotificationCategorySetting,
  type NotificationChannel,
} from '~/shared/notification-categories'

interface PreferenceRow {
  category: string
  email_enabled: number
  whatsapp_enabled: number
}

export type NotificationPreferences = Record<NotificationCategory, NotificationCategorySetting>

function defaults(): NotificationPreferences {
  return Object.fromEntries(
    NOTIFICATION_CATEGORIES.map(category => [category, { ...NOTIFICATION_CATEGORY_DEFAULTS[category] }]),
  ) as NotificationPreferences
}

/**
 * Every category for one person, stored rows overlaying the defaults.
 *
 * A missing row is not a missing value: NOTIFICATION_CATEGORY_DEFAULTS is the
 * source of a category's setting until the person changes it, and there is no
 * second place that answers the question.
 */
export async function getNotificationPreferences(db: DbClient, userId: string): Promise<NotificationPreferences> {
  const preferences = defaults()
  const rows = await queryAll<PreferenceRow>(
    db,
    'SELECT category, email_enabled, whatsapp_enabled FROM user_notification_preferences WHERE user_id = ?',
    [userId],
  )
  for (const row of rows) {
    const category = row.category as NotificationCategory
    if (!(category in preferences)) continue
    preferences[category] = {
      email: Boolean(row.email_enabled),
      whatsapp: Boolean(row.whatsapp_enabled),
    }
  }
  return preferences
}

export async function setNotificationPreference(
  db: DbClient,
  userId: string,
  category: NotificationCategory,
  setting: NotificationCategorySetting,
): Promise<void> {
  if (isMandatoryEmailCategory(category) && !setting.email) {
    throw new Error(`${category} email cannot be disabled`)
  }
  await execute(
    db,
    `INSERT INTO user_notification_preferences (user_id, category, email_enabled, whatsapp_enabled, updated_at)
     VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT (user_id, category) DO UPDATE SET
       email_enabled = excluded.email_enabled,
       whatsapp_enabled = excluded.whatsapp_enabled,
       updated_at = excluded.updated_at`,
    [userId, category, setting.email ? 1 : 0, setting.whatsapp ? 1 : 0],
  )
}

/**
 * Turns one category's email off without reading the row first.
 *
 * An unsubscribe silences the email and leaves WhatsApp alone, but doing that
 * as read-then-write would let a settings save between the two be overwritten
 * by whatever the read saw. On conflict only email_enabled moves; a person with
 * no row yet gets one carrying the category's default WhatsApp setting.
 */
export async function disableCategoryEmail(
  db: DbClient,
  userId: string,
  category: NotificationCategory,
): Promise<void> {
  if (isMandatoryEmailCategory(category)) {
    throw new Error(`${category} email cannot be disabled`)
  }
  await execute(
    db,
    `INSERT INTO user_notification_preferences (user_id, category, email_enabled, whatsapp_enabled, updated_at)
     VALUES (?, ?, 0, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT (user_id, category) DO UPDATE SET
       email_enabled = 0,
       updated_at = excluded.updated_at`,
    [userId, category, NOTIFICATION_CATEGORY_DEFAULTS[category].whatsapp ? 1 : 0],
  )
}

/**
 * Whether one person wants one category on one channel.
 *
 * This is a preference, not an authorization. A `true` here means the person
 * asked for the message; whether the address or number may receive it at all is
 * still decided by isAuthorizedWhatsAppRecipient and by who owns the mailbox.
 */
export async function wantsNotification(
  db: DbClient,
  userId: string,
  category: NotificationCategory,
  channel: NotificationChannel,
): Promise<boolean> {
  if (channel === 'email' && isMandatoryEmailCategory(category)) return true
  const row = await queryFirst<PreferenceRow>(
    db,
    'SELECT category, email_enabled, whatsapp_enabled FROM user_notification_preferences WHERE user_id = ? AND category = ?',
    [userId, category],
  )
  if (!row) return NOTIFICATION_CATEGORY_DEFAULTS[category][channel]
  return channel === 'email' ? Boolean(row.email_enabled) : Boolean(row.whatsapp_enabled)
}

/**
 * A SQL predicate for "this user wants `category` over email", for callers that
 * must page recipients — filtering in JavaScript after a LIMIT returns an empty
 * batch whenever the first page is all opt-outs, and the same page then comes
 * back forever.
 *
 * Returns the fragment and the parameters it consumes, in order.
 */
export function wantsCategoryEmailSql(userIdColumn: string, category: NotificationCategory): { sql: string; params: unknown[] } {
  if (isMandatoryEmailCategory(category)) return { sql: '1 = 1', params: [] }
  return {
    sql: `COALESCE((SELECT pref.email_enabled FROM user_notification_preferences pref
            WHERE pref.user_id = ${userIdColumn} AND pref.category = ?), ?) = 1`,
    params: [category, NOTIFICATION_CATEGORY_DEFAULTS[category].email ? 1 : 0],
  }
}
