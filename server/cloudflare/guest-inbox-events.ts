import type { DashboardInvalidation, GuestThreadInvalidation, NotificationInvalidation } from '~/shared/dashboard-invalidations'
import { queryFirst, type DbClient } from '~/server/db'

export type GuestInboxEventType = GuestThreadInvalidation['type']

export interface GuestInboxPublicationEnv {
  GUEST_INBOX_HUBS?: DurableObjectNamespace
}

export async function publishGuestInboxThreadEvent(
  env: GuestInboxPublicationEnv,
  db: DbClient,
  input: {
    threadId: string
    type: GuestInboxEventType
  },
): Promise<void> {
  const thread = await queryFirst<{
    id: string
    organization_id: string
    site_id: string
    location_id: string | null
  }>(db, `
    SELECT id, organization_id, site_id, location_id
    FROM guest_threads
    WHERE id = ?
    LIMIT 1
  `, [input.threadId])
  if (!thread) throw new Error(`Guest thread ${input.threadId} not found for inbox publication`)
  await publishDashboardInvalidation(env, {
    eventId: crypto.randomUUID(),
    type: input.type,
    organizationId: thread.organization_id,
    siteId: thread.site_id,
    locationId: thread.location_id,
    threadId: thread.id,
    occurredAt: new Date().toISOString(),
  })
}

export async function publishDashboardInvalidation(
  env: GuestInboxPublicationEnv,
  event: DashboardInvalidation,
): Promise<void> {
  if (!env.GUEST_INBOX_HUBS) {
    throw new Error('GUEST_INBOX_HUBS binding is not configured')
  }

  const hub = env.GUEST_INBOX_HUBS.get(env.GUEST_INBOX_HUBS.idFromName(event.organizationId))
  const response = await hub.fetch('https://guest-inbox.internal/broadcast', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-krabiclaw-organization-id': event.organizationId,
    },
    body: JSON.stringify(event),
  })
  if (!response.ok) {
    throw new Error(`Dashboard invalidation publication failed with HTTP ${response.status}`)
  }
}

export async function publishNotificationInvalidation(
  env: GuestInboxPublicationEnv,
  input: Omit<NotificationInvalidation, 'eventId' | 'occurredAt'>,
): Promise<void> {
  await publishDashboardInvalidation(env, {
    ...input,
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
  })
}
