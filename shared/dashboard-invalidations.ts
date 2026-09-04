interface DashboardInvalidationBase {
  eventId: string
  organizationId: string
  occurredAt: string
}

export interface GuestThreadInvalidation extends DashboardInvalidationBase {
  type: 'thread.created' | 'thread.changed' | 'entry.appended' | 'delivery.changed'
  siteId: string
  locationId: string | null
  threadId: string
}

export interface NotificationInvalidation extends DashboardInvalidationBase {
  type: 'notification.created' | 'notification.read'
  siteId: string | null
  locationId: string | null
  targetUserId: string | null
}

export type DashboardInvalidation = GuestThreadInvalidation | NotificationInvalidation

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isDashboardInvalidation(value: unknown): value is DashboardInvalidation {
  if (!isRecord(value)
    || typeof value.eventId !== 'string' || !value.eventId
    || typeof value.organizationId !== 'string' || !value.organizationId
    || typeof value.occurredAt !== 'string' || !value.occurredAt
    || !(value.siteId === null || typeof value.siteId === 'string')
    || !(value.locationId === null || typeof value.locationId === 'string')) return false

  if (value.type === 'notification.created' || value.type === 'notification.read') {
    return value.targetUserId === null || typeof value.targetUserId === 'string'
  }

  return (value.type === 'thread.created'
    || value.type === 'thread.changed'
    || value.type === 'entry.appended'
    || value.type === 'delivery.changed')
    && typeof value.siteId === 'string' && Boolean(value.siteId)
    && typeof value.threadId === 'string' && Boolean(value.threadId)
}
