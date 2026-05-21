// GET /api/public/sites/[siteId]/locations/[slug]/media
// Returns active media assets for a location. Used by public-facing Saya pages.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { listMediaAssets } from '~/server/utils/media-asset-manager'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  if (!siteId || !slug) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const location = await db.prepare(
    `SELECT id FROM business_locations WHERE site_id = ? AND slug = ? AND status = 'active' LIMIT 1`
  ).bind(siteId, slug).first<{ id: string }>()
  if (!location) return jsonResponse({ error: 'Location not found' }, { status: 404 })

  const query = getQuery(event)
  const kind = typeof query.kind === 'string' ? query.kind : undefined

  const assets = await listMediaAssets(db, siteId, { locationId: location.id, kind, limit: 100 })
  return jsonResponse({ media: assets })
})
