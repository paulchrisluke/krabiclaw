import { execute, type DbClient } from '~/server/db'
import { publishNotificationInvalidation, type GuestInboxPublicationEnv } from '~/server/cloudflare/guest-inbox-events'

export const NOTIFICATION_EVENT_TYPES = {
  PLATFORM_USER_SIGNUP: 'platform.user_signup',
} as const

export type NotificationScope = 'platform' | 'organization' | 'site'
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error'

export interface CreateNotificationInput {
  publishEnv?: GuestInboxPublicationEnv
  scope: NotificationScope
  template: string
  severity?: NotificationSeverity
  organizationId?: string | null
  siteId?: string | null
  locationId?: string | null
  sourceEntryId?: string | null
  targetUserId?: string | null
  title: string
  message?: string | null
  deepLink?: string | null
  /** Stable event identity. Replays reuse the notification instead of adding a second alert. */
  idempotencyKey?: string
}

export interface CanonicalNotificationInsert {
  id: string
  query: string
  params: unknown[]
}

const SENSITIVE_KEY = /(?:authorization|cookie|secret|token|password|webhook|access[_-]?key|api[_-]?key|email|phone|address|message|name)/i

export function redactNotificationPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactNotificationPayload)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    key,
    SENSITIVE_KEY.test(key) ? '[redacted]' : redactNotificationPayload(entry),
  ]))
}

export function buildCanonicalNotificationInsert(
  input: CreateNotificationInput,
  id: string = crypto.randomUUID(),
  now = new Date().toISOString(),
): CanonicalNotificationInsert {
  if (input.scope === 'platform' && (input.organizationId || input.siteId)) {
    throw new Error('Platform notifications cannot be organization or site scoped')
  }
  if (input.scope !== 'platform' && !input.organizationId) {
    throw new Error(`${input.scope} notifications require an organization`)
  }
  if (input.scope === 'site' && !input.siteId) {
    throw new Error('Site notifications require a site')
  }
  return {
    id,
    query: `
      INSERT INTO notifications
      (id, organization_id, site_id, location_id, source_entry_id, scope, severity,
       target_user_id, deep_link, message, template, title, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING
    `,
    params: [
      id,
      input.organizationId ?? null,
      input.siteId ?? null,
      input.locationId ?? null,
      input.sourceEntryId ?? null,
      input.scope,
      input.severity ?? 'info',
      input.targetUserId ?? null,
      input.deepLink ?? null,
      input.message ?? null,
      input.template,
      input.title,
      now,
    ],
  }
}

export async function createCanonicalNotification(db: DbClient, input: CreateNotificationInput): Promise<string> {
  const statement = buildCanonicalNotificationInsert(input, input.idempotencyKey)
  const result = await execute(db, statement.query, statement.params)
  if (Number(result.meta.changes ?? 0) > 0 && input.publishEnv && input.organizationId) {
    await publishNotificationInvalidation(input.publishEnv, {
      type: 'notification.created',
      organizationId: input.organizationId,
      siteId: input.siteId ?? null,
      locationId: input.locationId ?? null,
      targetUserId: input.targetUserId ?? null,
    })
  }
  return statement.id
}

export async function notifyNewUserSignup(
  db: DbClient,
  user: { id: string; email: string },
): Promise<void> {
  if (user.email.endsWith('@phone.krabiclaw.local')) return

  await createCanonicalNotification(db, {
    scope: 'platform',
    template: NOTIFICATION_EVENT_TYPES.PLATFORM_USER_SIGNUP,
    severity: 'info',
    title: 'New user signup',
    message: 'A new KrabiClaw account was created.',
    deepLink: '/admin/users',
  })
}
