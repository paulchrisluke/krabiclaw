import { jsonResponse } from '~/server/utils/api-response'
import { createExperience } from '~/server/utils/experiences'
import { InvalidFieldError, stringArrayOrNull } from '~/server/utils/validation-helpers'
import { queryFirst } from '~/server/db'
import { requireSiteAccess } from '~/server/utils/location-access'
import { assertResourceAccess } from '~/server/utils/member-access'

const optionalInteger = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && Number.isInteger(parsed) ? parsed : null
}

type ExperienceMediaItem = { url: string; kind: 'image' | 'video' }
class InvalidImagesError extends Error {}

function normalizeExperienceImages(value: unknown): ExperienceMediaItem[] | undefined {
  if (value === null || value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw new InvalidImagesError()
  }
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item): ExperienceMediaItem => ({
      url: String(item.url ?? '').trim(),
      kind: item.kind === 'video' ? 'video' : 'image',
    }))
    .filter(item => item.url)
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })

  const { db, session, site } = await requireSiteAccess(event, siteId, 'context')
  const siteRecord = await queryFirst<{ primary_location_id: string | null }>(
    db,
    'SELECT primary_location_id FROM sites WHERE id = ? AND organization_id = ? LIMIT 1',
    [siteId, site.organization_id],
  )
  if (!siteRecord) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  let body: Record<string, ApiValue>
  try { body = await readBody(event) } catch { return jsonResponse({ error: 'Invalid request body' }, { status: 400 }) }

  const title = String(body.title ?? '').trim()
  if (!title) return jsonResponse({ error: 'title is required' }, { status: 400 })

  const locationId = ('location_id' in body && body.location_id !== undefined && body.location_id !== null)
    ? String(body.location_id)
    : siteRecord.primary_location_id
  if (!locationId) {
    return jsonResponse({ error: 'location_id is required' }, { status: 400 })
  }
  const location = await queryFirst<{ id: string }>(db, `SELECT id FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1`, [locationId, siteId])
  if (!location) return jsonResponse({ error: 'location_id must reference a location on this site' }, { status: 400 })
  await assertResourceAccess(db, {
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
    resourceLocationId: locationId,
  })

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
  let images: ExperienceMediaItem[] | undefined
  try {
    highlights = stringArrayOrNull(body.highlights)
    includedItems = stringArrayOrNull(body.included_items)
    whatToBring = stringArrayOrNull(body.what_to_bring)
    images = normalizeExperienceImages(body.images)
  } catch (err) {
    if (err instanceof InvalidImagesError) return jsonResponse({ error: 'images must be an array' }, { status: 400 })
    if (err instanceof InvalidFieldError) return jsonResponse({ error: 'highlights, included_items, and what_to_bring must be arrays' }, { status: 400 })
    throw err
  }

  // Validate compare_at_price_amount before object construction
  if (body.compare_at_price_amount !== null && body.compare_at_price_amount !== undefined && body.compare_at_price_amount !== '') {
    const parsed = Number(body.compare_at_price_amount)
    if (!Number.isFinite(parsed)) return jsonResponse({ error: 'compare_at_price_amount must be a valid number' }, { status: 400 })
  }

  const experience = await createExperience(db, site.organization_id, siteId, {
    title,
    tagline: body.tagline ? String(body.tagline).trim() : null,
    body: body.body ? String(body.body).trim() : null,
    image_asset_id: body.image_asset_id ? String(body.image_asset_id) : null,
    video_asset_id: body.video_asset_id ? String(body.video_asset_id) : null,
    images,
    highlights,
    included_items: includedItems,
    what_to_bring: whatToBring,
    meeting_point: body.meeting_point ? String(body.meeting_point).trim() : null,
    price: body.price ? String(body.price).trim() : null,
    price_amount: body.price_amount === null || body.price_amount === undefined || body.price_amount === '' ? null : Number(body.price_amount),
    compare_at_price_amount: body.compare_at_price_amount === null || body.compare_at_price_amount === undefined || body.compare_at_price_amount === '' ? null : Number(body.compare_at_price_amount),
    sale_starts_at: body.sale_starts_at ? String(body.sale_starts_at) : null,
    sale_ends_at: body.sale_ends_at ? String(body.sale_ends_at) : null,
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
