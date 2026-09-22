// GET /api/public/sites/[siteId]/locations/[slug]/photos
// Public location gallery, shaped for the Saya photos page.
import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getMediaPlacements } from '~/server/utils/media-placement'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  if (!siteId || !slug) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const location = await queryFirst<{ id: string }>(
    db, `SELECT id FROM business_locations WHERE site_id = ? AND slug = ? AND status = 'active' LIMIT 1`, [siteId, slug], )
  if (!location) return jsonResponse({ error: 'Location not found' }, { status: 404 })

  const placements = await getMediaPlacements(db, { siteId, ownerType: 'business_location', ownerIds: [location.id], slot: 'gallery' })
  return jsonResponse({ media: placements.get(location.id) ?? [] })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
