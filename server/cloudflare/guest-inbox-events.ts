export type GuestInboxEventType =
  | 'thread.created'
  | 'thread.changed'
  | 'entry.appended'
  | 'delivery.changed'
  | 'read-state.changed'

export interface GuestInboxEvent {
  eventId: string
  type: GuestInboxEventType
  siteId: string
  locationId: string | null
  threadId: string
  threadVersion: number
  occurredAt: string
}

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
    site_id: string
    location_id: string | null
    version: number
  }>(db, `
    SELECT id, site_id, location_id, version
    FROM guest_threads
    WHERE id = ?
    LIMIT 1
  `, [input.threadId])
  if (!thread) throw new Error(`Guest thread ${input.threadId} not found for inbox publication`)
  await publishGuestInboxEvent(env, {
    eventId: crypto.randomUUID(),
    type: input.type,
    siteId: thread.site_id,
    locationId: thread.location_id,
    threadId: thread.id,
    threadVersion: thread.version,
    occurredAt: new Date().toISOString(),
  })
}

export async function publishGuestInboxEvent(
  env: GuestInboxPublicationEnv,
  event: GuestInboxEvent,
): Promise<void> {
  if (!env.GUEST_INBOX_HUBS) {
    throw new Error('GUEST_INBOX_HUBS binding is not configured')
  }

  const hub = env.GUEST_INBOX_HUBS.get(env.GUEST_INBOX_HUBS.idFromName(event.siteId))
  const response = await hub.fetch('https://guest-inbox.internal/broadcast', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-krabiclaw-site-id': event.siteId,
    },
    body: JSON.stringify(event),
  })
  if (!response.ok) {
    throw new Error(`Guest inbox publication failed with HTTP ${response.status}`)
  }
}
import { queryFirst, type DbClient } from '~/server/db'
