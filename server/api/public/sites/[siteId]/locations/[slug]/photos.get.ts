// GET /api/public/sites/[siteId]/locations/[slug]/photos
// Public location gallery, shaped for the Saya photos page.
import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { listMediaAssets } from '~/server/utils/media-asset-manager'

const PUBLIC_CATEGORY: Record<string, string> = {
  exterior: 'EXTERIOR',
  interior: 'INTERIOR',
  food: 'FOOD',
  menu: 'MENU',
  team: 'TEAM',
  other: 'OTHER'
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  if (!siteId || !slug) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const location = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM business_locations WHERE site_id = ? AND slug = ? AND status = 'active' LIMIT 1`,
    [siteId, slug],
  )
  if (!location) return jsonResponse({ error: 'Location not found' }, { status: 404 })

  const assets = await listMediaAssets(db, siteId, { locationId: location.id, kind: 'image', limit: 100 })
  const photos = assets.map((asset, index) => ({
    id: asset.id,
    thumbnail_url: asset.thumbnail_url,
    // MediaAsset stores one canonical public URL; location galleries expose it under both legacy photo fields.
    local_url: asset.public_url,
    google_url: asset.public_url,
    description: asset.alt_text,
    category: PUBLIC_CATEGORY[asset.category || 'other'] ?? 'OTHER',
    sort_order: index
  }))

  return jsonResponse({ photos })
})
