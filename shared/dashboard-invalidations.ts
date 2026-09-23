interface DashboardInvalidationBase {
  eventId: string
  organizationId: string
  occurredAt: string
}

export interface GuestThreadInvalidation extends DashboardInvalidationBase {
  type: 'thread.created' | 'thread.changed' | 'entry.appended' | 'delivery.changed'
  locationId: string | null
  threadId: string
}

export interface NotificationInvalidation extends DashboardInvalidationBase {
  type: 'notification.created' | 'notification.read'
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
    || !(value.locationId === null || typeof value.locationId === 'string')) return false

  if (value.type === 'notification.created' || value.type === 'notification.read') {
    return value.targetUserId === null || typeof value.targetUserId === 'string'
  }

  return (value.type === 'thread.created'
    || value.type === 'thread.changed'
    || value.type === 'entry.appended'
    || value.type === 'delivery.changed')
    && typeof value.threadId === 'string' && Boolean(value.threadId)
}
