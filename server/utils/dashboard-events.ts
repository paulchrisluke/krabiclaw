import { queryAll, type DbClient } from '~/server/db'

export interface DashboardEvent {
  id: string
  event_type: string
  site_id: string
  location_id: string | null
  entity_type: string | null
  entity_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  actor_id: string | null
  location_title: string | null
}

export interface DashboardEventsQuery {
  limit?: number
  siteId?: string
  locationId?: string
  eventType?: string
  actorId?: string
  before?: string
}

export async function listDashboardEvents(
  db: DbClient,
  organizationId: string,
  query: DashboardEventsQuery,
): Promise<{ events: DashboardEvent[]; nextCursor: string | null }> {
  const limit = Math.max(1, Math.min(query.limit || 20, 50))
  const conditions = ['e.organization_id = ?']
  const params: unknown[] = [organizationId]
  if (query.siteId) { conditions.push('e.site_id = ?'); params.push(query.siteId) }
  if (query.locationId) { conditions.push('e.location_id = ?'); params.push(query.locationId) }
  if (query.eventType) { conditions.push('e.event_type = ?'); params.push(query.eventType) }
  if (query.actorId) { conditions.push('e.actor_id = ?'); params.push(query.actorId) }
  if (query.before) {
    const separator = query.before.lastIndexOf('|')
    if (separator === -1) {
      conditions.push('e.created_at < ?')
      params.push(query.before)
    } else {
      const createdAt = query.before.slice(0, separator)
      conditions.push('(e.created_at < ? OR (e.created_at = ? AND e.id < ?))')
      params.push(createdAt, createdAt, query.before.slice(separator + 1))
    }
  }
  params.push(limit)

  const rows = await queryAll<DashboardEvent & { metadata: string | null }>(db, `
    SELECT e.id, e.event_type, e.site_id, e.location_id, e.entity_type, e.entity_id, e.metadata, e.created_at,
           e.actor_id,
           l.title AS location_title
    FROM site_events e
    LEFT JOIN business_locations l ON l.id = e.location_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT ?
  `, params)
  const last = rows[rows.length - 1]
  return {
    events: rows.map(row => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) as Record<string, unknown> : null,
    })),
    nextCursor: rows.length === limit && last ? `${last.created_at}|${last.id}` : null,
  }
}
