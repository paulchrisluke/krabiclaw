// GET /api/public/sites/[siteId]/locations/[slug]/media
// Returns active media assets for a location. Used by public-facing Saya pages.
import { queryAll, queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'

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

  const query = getQuery(event)
  const kind = typeof query.kind === 'string' ? query.kind : undefined

  const assets = await queryAll(db, `
    SELECT ma.* FROM media_placements mp
    JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active'
    WHERE mp.site_id = ? AND mp.owner_type = 'business_location' AND mp.owner_id = ? AND mp.slot = 'gallery' AND mp.status = 'active'
      ${kind ? 'AND ma.kind = ?' : ''}
    ORDER BY mp.sort_order LIMIT 100
  `, [siteId, location.id, ...(kind ? [kind] : [])])
  return jsonResponse({ media: assets })
})
import { defineHandler } from 'nitro';
import { getQuery } from 'nitro/h3';
import { getRouterParam } from 'nitro/h3';
