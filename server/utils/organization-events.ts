import { execute, type DbClient } from '~/server/db'

export type OrganizationEventType =
  | 'post.created' | 'post.published'
  | 'product.created' | 'product.updated' | 'product.deleted' | 'product.reordered'
  | 'product.category_created' | 'product.category_renamed' | 'product.category_deleted'
  | 'content.updated' | 'content.published' | 'media.uploaded' | 'media.deleted'
  | 'review.received' | 'review.replied'
  | 'location.created' | 'location.updated'
  | 'experience.created'
  | 'work_request.created' | 'work_request.status_changed'
  | 'domain.connected' | 'domain.verified' | 'domain.failed'
  | 'member.invited' | 'member.role_changed' | 'member.removed' | 'member.access_scope_revoked'

export interface FireOrganizationEventParams {
  db: DbClient
  organizationId: string
  siteId?: string | null
  locationId?: string | null
  actorId?: string | null
  eventType: OrganizationEventType
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
}

export async function fireOrganizationEvent(params: FireOrganizationEventParams): Promise<void> {
  const { db, organizationId, siteId, locationId, actorId, eventType, entityType, entityId, metadata } = params
  await execute(db, `
    INSERT INTO organization_events
      (id, organization_id, site_id, location_id, actor_id, event_type, entity_type, entity_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [crypto.randomUUID(), organizationId, siteId ?? null, locationId ?? null, actorId ?? null,
    eventType, entityType ?? null, entityId ?? null, metadata ? JSON.stringify(metadata) : null])
}

export async function fireOrganizationEventSafe(params: FireOrganizationEventParams): Promise<void> {
  try {
    await fireOrganizationEvent(params)
  } catch (error) {
    console.warn('organization_event_write_failed', {
      eventType: params.eventType,
      organizationId: params.organizationId,
      siteId: params.siteId ?? null,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
