import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { queryAll, queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const { db, organization, site } = await getDashboardContext(event, { requireSite: false })

  if (!site) {
    return jsonResponse({ organization, site: null, locations: [], credits: null, events: [] })
  }

  const [locations, credits, events] = await Promise.all([
    queryAll<{
      id: string; slug: string; title: string; city: string | null
      rating: number | null; review_count: number | null
      is_primary: number; status: string; updated_at: string
      hero_url: string | null
    }>(db, `
      SELECT bl.id, bl.slug, bl.title, bl.city, bl.rating, bl.review_count,
             bl.is_primary, bl.status, bl.updated_at,
             COALESCE(ma_hero.thumbnail_url, ma_hero.public_url) as hero_url
      FROM business_locations bl
      LEFT JOIN media_assets ma_hero ON ma_hero.id = bl.hero_image_asset_id
      WHERE bl.organization_id = ? AND bl.site_id = ?
      ORDER BY bl.is_primary DESC, bl.title ASC
    `, [organization.id, site.id]),

    queryFirst<{
      balance: number; lifetime_used: number; last_topped_up_at: string | null
    }>(db, `
      SELECT balance, lifetime_used, last_topped_up_at
      FROM ai_credits WHERE organization_id = ?
    `, [organization.id]),

    queryAll<{
      id: string; event_type: string; entity_type: string | null
      entity_id: string | null; location_id: string | null
      metadata: string | null; created_at: string
      actor_name: string | null; actor_image: string | null
      location_title: string | null
    }>(db, `
      SELECT e.id, e.event_type, e.entity_type, e.entity_id,
             e.location_id, e.metadata, e.created_at,
             u.name as actor_name, u.image as actor_image,
             l.title as location_title
      FROM site_events e
      LEFT JOIN user u ON u.id = e.actor_id
      LEFT JOIN business_locations l ON l.id = e.location_id
      WHERE e.organization_id = ? AND e.site_id = ?
      ORDER BY e.created_at DESC
      LIMIT 15
    `, [organization.id, site.id]),
  ])

  return jsonResponse({
    organization,
    site,
    locations: locations.map(l => ({
      ...l,
      is_primary: Boolean(l.is_primary),
    })),
    credits,
    events: events.map(e => ({
      ...e,
      metadata: e.metadata ? JSON.parse(e.metadata) : null,
    })),
  })
})
