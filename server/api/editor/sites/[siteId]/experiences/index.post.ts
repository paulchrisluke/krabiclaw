import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { createExperience } from '~/server/utils/experiences'
import { InvalidFieldError, stringArrayOrNull } from '~/server/utils/validation-helpers'
import { queryFirst } from '~/server/db'

const optionalInteger = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && Number.isInteger(parsed) ? parsed : null
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await queryFirst<{ id: string; organization_id: string; primary_location_id: string | null }>(
    db,
    `SELECT s.id, s.organization_id, s.primary_location_id FROM sites s
       JOIN member m ON m.organizationId = s.organization_id
       WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner','admin') LIMIT 1`,
    [siteId, session.user.id],
  )

  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  let body: Record<string, ApiValue>
  try { body = await readBody(event) } catch { return jsonResponse({ error: 'Invalid request body' }, { status: 400 }) }

  const title = String(body.title ?? '').trim()
  if (!title) return jsonResponse({ error: 'title is required' }, { status: 400 })

  const locationId = ('location_id' in body && body.location_id !== undefined && body.location_id !== null)
    ? String(body.location_id)
    : site.primary_location_id
  if (!locationId) {
    return jsonResponse({ error: 'location_id is required' }, { status: 400 })
  }
  const location = await queryFirst<{ id: string }>(db, `SELECT id FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1`, [locationId, siteId])
  if (!location) return jsonResponse({ error: 'location_id must reference a location on this site' }, { status: 400 })

  // Validate featured and featured_sort_order when explicitly provided
  if ('featured' in body && typeof body.featured !== 'boolean') {
    return jsonResponse({ error: 'featured must be a boolean' }, { status: 400 })
  }
  if ('featured_sort_order' in body) {
    const parsed = optionalInteger(body.featured_sort_order)
    if (parsed === null) return jsonResponse({ error: 'featured_sort_order must be an integer' }, { status: 400 })
  }

  let highlights: string[] | null
  let includedItems: string[] | null
  let whatToBring: string[] | null
  try {
    highlights = stringArrayOrNull(body.highlights)
    includedItems = stringArrayOrNull(body.included_items)
    whatToBring = stringArrayOrNull(body.what_to_bring)
  } catch (err) {
    if (err instanceof InvalidFieldError) return jsonResponse({ error: 'highlights, included_items, and what_to_bring must be arrays' }, { status: 400 })
    throw err
  }

  const experience = await createExperience(db, site.organization_id, siteId, {
    title,
    tagline: body.tagline ? String(body.tagline).trim() : null,
    body: body.body ? String(body.body).trim() : null,
    image_asset_id: body.image_asset_id ? String(body.image_asset_id) : null,
    video_asset_id: body.video_asset_id ? String(body.video_asset_id) : null,
    highlights,
    included_items: includedItems,
    what_to_bring: whatToBring,
    meeting_point: body.meeting_point ? String(body.meeting_point).trim() : null,
    price: body.price ? String(body.price).trim() : null,
    price_amount: body.price_amount === null || body.price_amount === undefined || body.price_amount === '' ? null : Number(body.price_amount),
    duration_minutes: optionalInteger(body.duration_minutes),
    max_capacity: optionalInteger(body.max_capacity),
    time_slots: Array.isArray(body.time_slots) ? body.time_slots.map(String) : null,
    recurring_slots: body.recurring_slots && typeof body.recurring_slots === 'object' && !Array.isArray(body.recurring_slots)
      ? (body.recurring_slots as Record<string, string[]>)
      : null,
    available_note: body.available_note ? String(body.available_note).trim() : null,
    status: (['active', 'inactive', 'sold_out'].includes(String(body.status)) ? String(body.status) : 'active') as 'active' | 'inactive' | 'sold_out',
    sort_order: optionalInteger(body.sort_order) ?? 0,
    featured: typeof body.featured === 'boolean' ? body.featured : false,
    featured_sort_order: optionalInteger(body.featured_sort_order) ?? 0,
    location_id: locationId,
    seo_title: body.seo_title ? String(body.seo_title).trim() : null,
    seo_description: body.seo_description ? String(body.seo_description).trim() : null,
  }, session.user.id)

  return jsonResponse({ experience }, { status: 201 })
})
