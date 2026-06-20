// PATCH /api/dashboard/locations/[id] — Update a location
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { updateLocation } from '~/server/utils/location-management'
import { parseLocationPayload } from './location-helpers'

export default defineEventHandler(async (event) => {
  const locationId = getRouterParam(event, 'id')
  if (!locationId) return jsonResponse({ error: 'Location ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const dashboard = await getDashboardContext(event, { requireRestaurant: true })
  if (!dashboard?.restaurant) {
    return jsonResponse({ error: 'No site found' }, { status: 400 })
  }

  const { organization, restaurant } = dashboard
  const organizationId = organization?.id as string
  const siteId = restaurant.id as string

  const body = await readBody<Record<string, unknown>>(event)
  if (typeof body !== 'object' || body === null) {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  const rating = body.rating === undefined || body.rating === null || String(body.rating).trim() === ''
    ? undefined
    : (() => { const n = Number(body.rating); return Number.isFinite(n) ? n : undefined })()
  const reviewCount = body.review_count === undefined || body.review_count === null || String(body.review_count).trim() === ''
    ? undefined
    : (() => { const n = Number(body.review_count); return Number.isFinite(n) ? n : undefined })()

  const result = await updateLocation(
    db,
    organizationId,
    siteId,
    locationId,
    {
      title: typeof body.title === 'string' ? body.title : undefined,
      slug: typeof body.slug === 'string' ? body.slug : undefined,
      address: body.address === undefined
        ? undefined
        : body.address === null
          ? null
          : typeof body.address === 'string'
            ? body.address
            : JSON.stringify(body.address),
      city: typeof body.city === 'string' ? body.city : body.city === null ? null : undefined,
      neighborhood: typeof body.neighborhood === 'string' ? body.neighborhood : body.neighborhood === null ? null : undefined,
      phone: typeof body.phone === 'string' ? body.phone : body.phone === null ? null : undefined,
      email: typeof body.email === 'string' ? body.email : body.email === null ? null : undefined,
      hero_image_asset_id: typeof body.hero_image_asset_id === 'string' ? body.hero_image_asset_id : body.hero_image_asset_id === null ? null : undefined,
      hero_video_asset_id: typeof body.hero_video_asset_id === 'string' ? body.hero_video_asset_id : body.hero_video_asset_id === null ? null : undefined,
      website_url: typeof body.website_url === 'string' ? body.website_url : body.website_url === null ? null : undefined,
      maps_url: typeof body.maps_url === 'string' ? body.maps_url : body.maps_url === null ? null : undefined,
      opening_hours: body.opening_hours === undefined
        ? undefined
        : body.opening_hours === null
          ? null
          : typeof body.opening_hours === 'string'
            ? body.opening_hours
            : JSON.stringify(body.opening_hours),
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
      notification_phone: typeof body.notification_phone === 'string' ? body.notification_phone.trim() || null : body.notification_phone === null ? null : undefined,
      timezone: typeof body.timezone === 'string' ? body.timezone.trim() || null : body.timezone === null ? null : undefined,
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
