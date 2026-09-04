import { execute, type DbClient } from '~/server/db'
import { publishNotificationInvalidation, type GuestInboxPublicationEnv } from '~/server/cloudflare/guest-inbox-events'

export const NOTIFICATION_EVENT_TYPES = {
  PLATFORM_USER_SIGNUP: 'platform.user_signup',
  RESERVATION_CREATED: 'reservation.created',
  RESERVATION_CANCELLED: 'reservation.cancelled',
  BOOKING_CREATED: 'booking.created',
  BOOKING_CANCELLED: 'booking.cancelled',
  CONTACT_MESSAGE_CREATED: 'contact_message.created',
  GUEST_REPLY_CREATED: 'guest_reply.created',
  REVIEW_CREATED: 'review.created',
  DOMAIN_UPDATED: 'domain.updated',
  SITE_TRANSFER_REMINDER: 'site_transfer.reminder',
} as const

export type NotificationScope = 'platform' | 'organization' | 'site'
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error'

export interface CreateNotificationInput {
  publishEnv?: GuestInboxPublicationEnv
  scope: NotificationScope
  eventType: string
  severity?: NotificationSeverity
  organizationId?: string | null
  siteId?: string | null
  locationId?: string | null
  guestThreadId?: string | null
  sourceEntryId?: string | null
  actorUserId?: string | null
  targetUserId?: string | null
  title: string
  message?: string | null
  deepLink?: string | null
  payload?: Record<string, unknown>
  template?: string
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
  id = crypto.randomUUID(),
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
  if (Boolean(input.guestThreadId) !== Boolean(input.sourceEntryId)) {
    throw new Error('Thread notifications require both a thread and source entry')
  }

  return {
    id,
    query: `
      INSERT INTO notifications
      (id, organization_id, site_id, location_id, guest_thread_id, source_entry_id,
       scope, event_type, severity, actor_user_id, target_user_id, deep_link,
       message, template, title, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING
    `,
    params: [
      id,
      input.organizationId ?? null,
      input.siteId ?? null,
      input.locationId ?? null,
      input.guestThreadId ?? null,
      input.sourceEntryId ?? null,
      input.scope,
      input.eventType,
      input.severity ?? 'info',
      input.actorUserId ?? null,
      input.targetUserId ?? null,
      input.deepLink ?? null,
      input.message ?? null,
      input.template ?? input.eventType,
      input.title,
      input.payload ? JSON.stringify(input.payload) : null,
      now,
    ],
  }
}

export async function createCanonicalNotification(db: DbClient, input: CreateNotificationInput): Promise<string> {
  const statement = buildCanonicalNotificationInsert(input)
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
    eventType: NOTIFICATION_EVENT_TYPES.PLATFORM_USER_SIGNUP,
    severity: 'info',
    actorUserId: user.id,
    title: 'New user signup',
    message: 'A new KrabiClaw account was created.',
    deepLink: '/admin/users',
    payload: { source: 'better_auth' },
  })
}

export function tenantEventTypeForTemplate(template: string, payload: Record<string, string>): string {
  if (payload.booking_id) {
    return template.includes('cancelled') ? NOTIFICATION_EVENT_TYPES.BOOKING_CANCELLED : NOTIFICATION_EVENT_TYPES.BOOKING_CREATED
  }
  const mapping: Record<string, string> = {
    new_reservation: NOTIFICATION_EVENT_TYPES.RESERVATION_CREATED,
    reservation_cancelled: NOTIFICATION_EVENT_TYPES.RESERVATION_CANCELLED,
    new_contact_msg: NOTIFICATION_EVENT_TYPES.CONTACT_MESSAGE_CREATED,
    new_review: NOTIFICATION_EVENT_TYPES.REVIEW_CREATED,
    guest_thread_reply: NOTIFICATION_EVENT_TYPES.GUEST_REPLY_CREATED,
  }
  return mapping[template] ?? template
}
