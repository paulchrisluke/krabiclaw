export type SiteEventType =
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
  db: D1Database
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

  await db.prepare(`
    INSERT INTO site_events
      (id, organization_id, site_id, location_id, actor_id, event_type, entity_type, entity_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    organizationId,
    siteId,
    locationId ?? null,
    actorId ?? null,
    eventType,
    entityType ?? null,
    entityId ?? null,
    metadata ? JSON.stringify(metadata) : null
  ).run()
}
