import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { queryAll } from '~/server/db'

export default defineEventHandler(async (event) => {
  const { db, organization } = await getDashboardContext(event, { requireSite: false })
  const query = getQuery(event)
  const limit = Math.max(1, Math.min(Number(query.limit) || 20, 50))
  const locationId = query.locationId as string | undefined
  const siteId = query.siteId as string | undefined
  const eventType = query.eventType as string | undefined
  const actorId = query.actorId as string | undefined
  const before = query.before as string | undefined

  const conditions: string[] = ['e.organization_id = ?']
  const params: unknown[] = [organization.id]
  if (siteId) { conditions.push('e.site_id = ?'); params.push(siteId) }
  if (locationId) { conditions.push('e.location_id = ?'); params.push(locationId) }
  if (eventType) { conditions.push('e.event_type = ?'); params.push(eventType) }
  if (actorId) { conditions.push('e.actor_id = ?'); params.push(actorId) }
  if (before) { conditions.push('e.created_at < ?'); params.push(before) }
  params.push(limit)

  const events = await queryAll<{
    id: string
    event_type: string
    entity_type: string | null
    entity_id: string | null
    site_id: string
    location_id: string | null
    metadata: string | null
    created_at: string
    actor_id: string | null
    actor_name: string | null
    actor_image: string | null
    location_title: string | null
  }>(db, `
    SELECT
      e.id, e.event_type, e.entity_type, e.entity_id,
      e.site_id, e.location_id, e.metadata, e.created_at,
      e.actor_id, u.name as actor_name, u.image as actor_image,
      l.title as location_title
    FROM site_events e
    LEFT JOIN user u ON u.id = e.actor_id
    LEFT JOIN business_locations l ON l.id = e.location_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY e.created_at DESC
    LIMIT ?
  `, params)

  return jsonResponse({
    events: events.map(e => ({
      ...e,
      metadata: e.metadata ? JSON.parse(e.metadata) : null
    })),
    nextCursor: events.length === limit ? events[events.length - 1]!.created_at : null
  })
})
