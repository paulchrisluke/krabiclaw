import { execute, type DbClient } from '~/server/db'

export const NOTIFICATION_EVENT_TYPES = {
  PLATFORM_USER_SIGNUP: 'platform.user_signup',
  RESERVATION_CREATED: 'reservation.created',
  RESERVATION_CANCELLED: 'reservation.cancelled',
  BOOKING_CREATED: 'booking.created',
  BOOKING_CANCELLED: 'booking.cancelled',
  CONTACT_MESSAGE_CREATED: 'contact_message.created',
  GUEST_REPLY_CREATED: 'guest_reply.created',
  REVIEW_CREATED: 'review.created',
} as const

export type NotificationScope = 'platform' | 'organization' | 'site'
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error'

export interface NotificationCenterEnv {
  DISCORD_DELIVERY_MODE?: string
  DISCORD_WEBHOOK_URL?: string
}

export interface CreateNotificationInput {
  scope: NotificationScope
  eventType: string
  severity?: NotificationSeverity
  organizationId?: string | null
  siteId?: string | null
  locationId?: string | null
  actorUserId?: string | null
  targetUserId?: string | null
  title: string
  message?: string | null
  deepLink?: string | null
  payload?: Record<string, unknown>
  template?: string
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

export function getDiscordDeliveryMode(env: NotificationCenterEnv): 'log_only' | 'provider' {
  return String(env.DISCORD_DELIVERY_MODE ?? '').trim().toLowerCase() === 'provider' ? 'provider' : 'log_only'
}

function validDiscordWebhookUrl(rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl)
    const allowedHost = url.hostname === 'discord.com' || url.hostname === 'discordapp.com'
    if (url.protocol !== 'https:' || !allowedHost || !/^\/api\/webhooks\/[^/]+\/[^/]+$/.test(url.pathname)) return null
    url.searchParams.set('wait', 'true')
    return url
  } catch {
    return null
  }
}

export async function createCanonicalNotification(db: DbClient, input: CreateNotificationInput): Promise<string> {
  if (input.scope === 'platform' && (input.organizationId || input.siteId)) {
    throw new Error('Platform notifications cannot be organization or site scoped')
  }
  if (input.scope !== 'platform' && !input.organizationId) {
    throw new Error(`${input.scope} notifications require an organization`)
  }
  if (input.scope === 'site' && !input.siteId) {
    throw new Error('Site notifications require a site')
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await execute(db, `
    INSERT INTO notifications
    (id, organization_id, site_id, location_id, scope, event_type, severity,
     actor_user_id, target_user_id, deep_link, message, channel, template, title,
     payload, status, sent_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'dashboard', ?, ?, ?, 'sent', ?, ?)
  `, [
    id,
    input.organizationId ?? null,
    input.siteId ?? null,
    input.locationId ?? null,
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
    now,
  ])
  return id
}

async function updateDelivery(
  db: DbClient,
  deliveryId: string,
  status: 'sent' | 'failed',
  providerMessageId: string | null,
  error: string | null,
) {
  await execute(db, `
    UPDATE notification_deliveries
    SET status = ?, provider_message_id = ?, error = ?, sent_at = ?
    WHERE id = ?
  `, [status, providerMessageId, error, new Date().toISOString(), deliveryId])
}

export async function deliverNotificationToDiscord(
  db: DbClient,
  env: NotificationCenterEnv,
  notification: { id: string; scope: NotificationScope; eventType: string; severity: NotificationSeverity; title: string; message?: string | null },
): Promise<'sent' | 'logged' | 'failed'> {
  if (notification.scope !== 'platform') throw new Error('Discord delivery is platform-only in v1')

  const deliveryId = crypto.randomUUID()
  await execute(db, `
    INSERT INTO notification_deliveries (id, notification_id, channel, status, created_at)
    VALUES (?, ?, 'discord', 'pending', ?)
  `, [deliveryId, notification.id, new Date().toISOString()])

  if (getDiscordDeliveryMode(env) === 'log_only') {
    await updateDelivery(db, deliveryId, 'sent', 'log_only:discord', null)
    console.info('discord_delivery_log_only', {
      notificationId: notification.id,
      eventType: notification.eventType,
      scope: notification.scope,
      severity: notification.severity,
    })
    return 'logged'
  }

  const webhookUrl = validDiscordWebhookUrl(String(env.DISCORD_WEBHOOK_URL ?? '').trim())
  if (!webhookUrl) {
    await updateDelivery(db, deliveryId, 'failed', null, 'DISCORD_WEBHOOK_URL is missing or invalid')
    console.error('discord_delivery_failed', { notificationId: notification.id, reason: 'webhook_not_configured' })
    return 'failed'
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        username: 'KrabiClaw Notifications',
        allowed_mentions: { parse: [] },
        embeds: [{
          title: notification.title,
          description: notification.message || undefined,
          color: notification.severity === 'error' ? 0xdc2626 : notification.severity === 'warning' ? 0xd97706 : 0xfb7461,
          fields: [{ name: 'Event', value: notification.eventType, inline: true }],
          timestamp: new Date().toISOString(),
        }],
      }),
    })
    if (!response.ok) {
      await updateDelivery(db, deliveryId, 'failed', null, `Discord returned HTTP ${response.status}`)
      console.error('discord_delivery_failed', { notificationId: notification.id, status: response.status })
      return 'failed'
    }
    const responseBody = await response.json().catch(() => ({})) as { id?: string }
    await updateDelivery(db, deliveryId, 'sent', responseBody.id ?? null, null)
    return 'sent'
  } catch (error) {
    const reason = error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'request_failed'
    await updateDelivery(db, deliveryId, 'failed', null, reason)
    console.error('discord_delivery_failed', { notificationId: notification.id, reason })
    return 'failed'
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function dispatchNotification(
  db: DbClient,
  env: NotificationCenterEnv,
  input: CreateNotificationInput,
  channels: Array<'discord'> = [],
): Promise<{ id: string; deliveries: { discord?: 'sent' | 'logged' | 'failed' } }> {
  const id = await createCanonicalNotification(db, input)
  const deliveries: { discord?: 'sent' | 'logged' | 'failed' } = {}
  if (channels.includes('discord')) {
    deliveries.discord = await deliverNotificationToDiscord(db, env, {
      id,
      scope: input.scope,
      eventType: input.eventType,
      severity: input.severity ?? 'info',
      title: input.title,
      message: input.message,
    })
  }
  return { id, deliveries }
}

export async function notifyNewUserSignup(
  db: DbClient,
  env: NotificationCenterEnv,
  user: { id: string; email: string },
): Promise<void> {
  if (user.email.endsWith('@phone.krabiclaw.local')) return

  await dispatchNotification(db, env, {
    scope: 'platform',
    eventType: NOTIFICATION_EVENT_TYPES.PLATFORM_USER_SIGNUP,
    severity: 'info',
    actorUserId: user.id,
    title: 'New user signup',
    message: 'A new KrabiClaw account was created.',
    deepLink: '/admin?tab=users',
    payload: { source: 'better_auth' },
  }, ['discord'])
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
