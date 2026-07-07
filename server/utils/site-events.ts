import { execute, type DbClient } from '~/server/db'

export type SiteEventType =
  // Contact
  | 'contact.created'
  // Posts
  | 'post.created'
  | 'post.published'
  | 'post.archived'
  // Menu
  | 'menu.created'
  | 'menu.item_added'
  | 'menu.item_updated'
  | 'menu.item_deleted'
  // Content
  | 'content.updated'
  | 'content.published'
  // Media
  | 'media.uploaded'
  | 'media.deleted'
  // Reviews
  | 'review.received'
  | 'review.replied'
  // Reservations
  | 'reservation.created'
  | 'reservation.confirmed'
  | 'reservation.cancelled'
  // Locations
  | 'location.created'
  | 'location.updated'
  | 'location.gmb_connected'
  // Translations
  | 'translation.job_completed'
  // Experiences
  | 'experience.created'
  | 'experience.booking_received'

interface FireEventParams {
  db: DbClient
  organizationId: string
  siteId: string
  locationId?: string | null
  actorId?: string | null
  eventType: SiteEventType
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
}

export async function fireSiteEvent(params: FireEventParams): Promise<void> {
  const {
    db, organizationId, siteId, locationId, actorId,
    eventType, entityType, entityId, metadata
  } = params

  await execute(db, `
    INSERT INTO site_events
      (id, organization_id, site_id, location_id, actor_id, event_type, entity_type, entity_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    crypto.randomUUID(),
    organizationId,
    siteId,
    locationId ?? null,
    actorId ?? null,
    eventType,
    entityType ?? null,
    entityId ?? null,
    metadata ? JSON.stringify(metadata) : null
  ])
}

export async function fireSiteEventSafe(params: FireEventParams): Promise<void> {
  try {
    await fireSiteEvent(params)
  } catch (error) {
    console.warn('site_event_write_failed', {
      eventType: params.eventType,
      siteId: params.siteId,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
