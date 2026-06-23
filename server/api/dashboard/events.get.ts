import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { queryAll } from '~/server/db'

export default defineEventHandler(async (event) => {
  const { db, organization } = await getDashboardContext(event, { requireSite: false })
  const query = getQuery(event)
  const limit = Math.max(1, Math.min(Number(query.limit) || 20, 50))
  const locationId = query.locationId as string | undefined

  const events = await queryAll<{
    id: string
    event_type: string
    entity_type: string | null
    entity_id: string | null
    location_id: string | null
    metadata: string | null
    created_at: string
    actor_name: string | null
    actor_image: string | null
    location_title: string | null
  }>(db, `
    SELECT
      e.id, e.event_type, e.entity_type, e.entity_id,
      e.location_id, e.metadata, e.created_at,
      u.name as actor_name, u.image as actor_image,
      l.title as location_title
    FROM site_events e
    LEFT JOIN user u ON u.id = e.actor_id
    LEFT JOIN business_locations l ON l.id = e.location_id
    WHERE e.organization_id = ?
    ${locationId ? 'AND e.location_id = ?' : ''}
    ORDER BY e.created_at DESC
    LIMIT ?
  `, (locationId
    ? [organization.id, locationId, limit]
    : [organization.id, limit]))

  return jsonResponse({
    events: events.map(e => ({
      ...e,
      metadata: e.metadata ? JSON.parse(e.metadata) : null
    }))
  })
})
