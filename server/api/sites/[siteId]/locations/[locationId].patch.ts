import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { updateLocation } from '~/server/utils/location-management'

function parseLocationPayload<T>(value: T) {
  const location = value as Record<string, unknown>
  const parseJson = (field: string) => {
    const raw = location[field]
    if (typeof raw !== 'string' || !raw) return raw ?? null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  return {
    ...location,
    address: parseJson('address'),
    opening_hours: parseJson('opening_hours'),
    is_primary: Boolean(location.is_primary),
  }
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) {
    return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  }

  const body = await readBody<Record<string, unknown>>(event)
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db.prepare(`
    SELECT s.id, s.organization_id
    FROM sites s
    JOIN member om ON s.organization_id = om.organizationId
    WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin')
    LIMIT 1
  `).bind(siteId, session.user.id).first<{ id: string; organization_id: string }>()

  if (!site) {
    return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
  }

  const rating = body.rating === undefined || body.rating === null || String(body.rating).trim() === ''
    ? undefined
    : Number(body.rating)
  const reviewCount = body.review_count === undefined || body.review_count === null || String(body.review_count).trim() === ''
    ? undefined
    : Number(body.review_count)

  const result = await updateLocation(
    db,
    site.organization_id,
    siteId,
    locationId,
    {
      title: typeof body.title === 'string' ? body.title : undefined,
      slug: typeof body.slug === 'string' ? body.slug : undefined,
      address: body.address === undefined ? undefined : body.address ? JSON.stringify(body.address) : null,
      city: typeof body.city === 'string' ? body.city : undefined,
      neighborhood: typeof body.neighborhood === 'string' ? body.neighborhood : undefined,
      phone: typeof body.phone === 'string' ? body.phone : undefined,
      email: typeof body.email === 'string' ? body.email : undefined,
      hero_image_asset_id: typeof body.hero_image_asset_id === 'string' ? body.hero_image_asset_id : body.hero_image_asset_id === null ? null : undefined,
      hero_video_asset_id: typeof body.hero_video_asset_id === 'string' ? body.hero_video_asset_id : body.hero_video_asset_id === null ? null : undefined,
      website_url: typeof body.website_url === 'string' ? body.website_url : body.website_url === null ? null : undefined,
      maps_url: typeof body.maps_url === 'string' ? body.maps_url : body.maps_url === null ? null : undefined,
      opening_hours: body.opening_hours === undefined ? undefined : body.opening_hours ? JSON.stringify(body.opening_hours) : null,
      description: typeof body.description === 'string' ? body.description : body.description === null ? null : undefined,
      short_description: typeof body.short_description === 'string' ? body.short_description : body.short_description === null ? null : undefined,
      price_level: typeof body.price_level === 'string' ? body.price_level : body.price_level === null ? null : undefined,
      facebook_url: typeof body.facebook_url === 'string' ? body.facebook_url : body.facebook_url === null ? null : undefined,
      instagram_url: typeof body.instagram_url === 'string' ? body.instagram_url : body.instagram_url === null ? null : undefined,
      tiktok_url: typeof body.tiktok_url === 'string' ? body.tiktok_url : body.tiktok_url === null ? null : undefined,
      grab_url: typeof body.grab_url === 'string' ? body.grab_url : body.grab_url === null ? null : undefined,
      uber_eats_url: typeof body.uber_eats_url === 'string' ? body.uber_eats_url : body.uber_eats_url === null ? null : undefined,
      foodpanda_url: typeof body.foodpanda_url === 'string' ? body.foodpanda_url : body.foodpanda_url === null ? null : undefined,
      google_place_id: typeof body.google_place_id === 'string' ? body.google_place_id : body.google_place_id === null ? null : undefined,
      rating,
      review_count: reviewCount,
      is_primary: typeof body.is_primary === 'boolean' ? body.is_primary : undefined,
      status: body.status === 'active' || body.status === 'inactive' || body.status === 'sync_error'
        ? body.status
        : undefined,
    },
    session.user.id,
  )

  if (result.status >= 400) {
    return jsonResponse(result.data, { status: result.status })
  }

  const location = (result.data as { location?: unknown }).location
  return jsonResponse({
    success: true,
    location: location ? parseLocationPayload(location) : null,
  }, { status: result.status })
})
