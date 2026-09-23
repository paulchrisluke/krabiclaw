import { execute, type DbClient } from '~/server/db'

export type OrganizationEventType =
  | 'post.created' | 'post.published'
  | 'product.created' | 'product.updated' | 'product.deleted' | 'product.reordered'
  | 'product.category_created' | 'product.category_renamed' | 'product.category_deleted'
  | 'content.updated' | 'content.published' | 'media.uploaded' | 'media.deleted'
  | 'review.received' | 'review.replied'
  | 'location.created' | 'location.updated'
  | 'experience.created'
  | 'domain.connected' | 'domain.verified' | 'domain.failed'
  | 'canonical_domain_changed' | 'cloudflare_create_failed' | 'cloudflare_delete_failed'
  | 'domain_added' | 'domain_deleted' | 'domain_state_changed'
  | 'member.invited' | 'member.role_changed' | 'member.removed' | 'member.access_scope_revoked'

export interface FireOrganizationEventParams {
  db: DbClient
  organizationId: string
  locationId?: string | null
  actorId?: string | null
  eventType: OrganizationEventType
  entityType?: string
  entityId?: string
  metadata?: unknown
  actorType?: 'owner' | 'admin' | 'editor' | 'member' | 'system' | 'cloudflare'
  message?: string
  beforeState?: unknown
  afterState?: unknown
}

export async function fireOrganizationEvent(params: FireOrganizationEventParams): Promise<void> {
  const { db, organizationId, locationId, actorId, eventType, entityType, entityId, metadata, actorType, message, beforeState, afterState } = params
  const id = crypto.randomUUID()
  const actorKind = actorType === 'cloudflare' ? 'cloudflare' : actorId ? 'member' : 'system'
  await execute(db, `
    INSERT INTO activity_entries
      (id, kind, scope_kind, organization_id, location_id, actor_kind, actor_user_id,
       event_name, body, payload_json, occurred_at, created_at, dedupe_key)
    VALUES (?, 'audit', 'organization', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, organizationId, locationId ?? null,
    actorKind, actorId ?? null, eventType, message ?? null,
    JSON.stringify({ entityType: entityType ?? null, entityId: entityId ?? null, actorType: actorType ?? actorKind,
      beforeState: beforeState ?? null, afterState: afterState ?? null, metadata: metadata ?? null }),
    new Date().toISOString(), new Date().toISOString(), 'audit:' + id])
}

export async function fireOrganizationEventSafe(params: FireOrganizationEventParams): Promise<void> {
  try {
    await fireOrganizationEvent(params)
  } catch (error) {
    console.warn('organization_event_write_failed', {
      eventType: params.eventType,
      organizationId: params.organizationId,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
