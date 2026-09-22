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
    location_id: string | null
  }>(db, `
    SELECT id, organization_id, organization_id, location_id
    FROM requests
    WHERE id = ?
    LIMIT 1
  `, [input.threadId])
  if (!thread) throw new Error(`Guest thread ${input.threadId} not found for inbox publication`)
  await publishDashboardInvalidation(env, {
    eventId: crypto.randomUUID(),
    type: input.type,
    organizationId: thread.organization_id,
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
  const request = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-krabiclaw-organization-id': event.organizationId,
    },
    body: JSON.stringify(event),
  }
  const publication = { eventId: event.eventId, type: event.type, organizationId: event.organizationId }
  let response: Response
  try {
    response = await hub.fetch('https://guest-inbox.internal/broadcast', request)
  } catch (error) {
    console.error('dashboard_invalidation_transport_failed', {
      ...publication,
      error: error instanceof Error ? error.message : String(error),
    })
    return
  }
  if (response.status >= 500) {
    console.error('dashboard_invalidation_transport_failed', { ...publication, status: response.status })
    return
  }
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
