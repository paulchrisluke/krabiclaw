import type { BatchQuery } from '~/server/db'

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

export interface OrganizationEvent {
  organizationId: string
  locationId?: string | null
  actorId?: string | null
  eventType: OrganizationEventType
  entityType?: string
  entityId?: string
  metadata?: unknown
  actorType?: 'owner' | 'admin' | 'system' | 'cloudflare'
  message?: string
  beforeState?: unknown
  afterState?: unknown
  /**
   * Record the event only when the statement just before it in the batch
   * changed exactly one row. A compare-and-set write that lost its guard
   * changed nothing, and an audit row for it would describe a change that
   * never happened. A guarded event that is skipped changes no rows itself,
   * so a second guarded event after it is skipped too.
   */
  onlyIfPreviousChangedOneRow?: boolean
}

/**
 * The audit row for a write, as a statement for that write's own batch.
 *
 * It is a statement rather than a function that runs it so that it commits
 * with the change it describes: neither exists without the other. Written
 * separately, an audit that failed after the change committed left a change
 * with no record and an error for a caller whose write had in fact landed.
 */
export function organizationEventQuery(event: OrganizationEvent): BatchQuery {
  const { organizationId, locationId, actorId, eventType, entityType, entityId, metadata, actorType, message, beforeState, afterState } = event
  const id = crypto.randomUUID()
  const actorKind = actorType === 'cloudflare' ? 'cloudflare' : actorId ? 'member' : 'system'
  const now = new Date().toISOString()
  return {
    query: `
      INSERT INTO activity_entries
        (id, kind, scope_kind, organization_id, location_id, actor_kind, actor_user_id,
         event_name, body, payload_json, occurred_at, created_at, dedupe_key)
      SELECT ?, 'audit', 'organization', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      ${event.onlyIfPreviousChangedOneRow ? 'WHERE changes() = 1' : ''}
    `,
    params: [id, organizationId, locationId ?? null,
      actorKind, actorId ?? null, eventType, message ?? null,
      JSON.stringify({ entityType: entityType ?? null, entityId: entityId ?? null, actorType: actorType ?? actorKind,
        beforeState: beforeState ?? null, afterState: afterState ?? null, metadata: metadata ?? null }),
      now, now, 'audit:' + id],
  }
}
