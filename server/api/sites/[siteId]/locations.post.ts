import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { createLocation } from '~/server/utils/location-management'

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
  if (!siteId) {
    return jsonResponse({ error: 'Site ID is required' }, { status: 400 })
  }

  const body = await readBody<{
    title?: string
    slug?: string
    address?: ApiValue
    city?: string
    phone?: string
    hero_image_asset_id?: string
    hero_video_asset_id?: string
    website_url?: string
    maps_url?: string
    description?: string
    google_place_id?: string
    rating?: number | string | null
    review_count?: number | string | null
    opening_hours?: ApiValue
    is_primary?: boolean
  }>(event)

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

  const rating = body?.rating === undefined || body.rating === null || String(body.rating).trim() === ''
    ? null
    : Number(body.rating)
  const reviewCount = body?.review_count === undefined || body.review_count === null || String(body.review_count).trim() === ''
    ? null
    : Number(body.review_count)

  const result = await createLocation(
    env,
    db,
    site.organization_id,
    siteId,
    {
      title: body?.title ?? '',
      slug: body?.slug ?? null,
      address: body?.address ? JSON.stringify(body.address) : null,
      city: body?.city ?? null,
      phone: body?.phone ?? null,
      hero_image_asset_id: body?.hero_image_asset_id ?? null,
      hero_video_asset_id: body?.hero_video_asset_id ?? null,
      website_url: body?.website_url ?? null,
      maps_url: body?.maps_url ?? null,
      description: body?.description ?? null,
      google_place_id: body?.google_place_id ?? null,
      rating,
      review_count: reviewCount,
      opening_hours: body?.opening_hours ? JSON.stringify(body.opening_hours) : null,
      is_primary: body?.is_primary === true,
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
