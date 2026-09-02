import { jsonResponse, readRequiredBody } from '~/server/utils/api-response'
import { updateExperience } from '~/server/utils/experiences'
import { InvalidFieldError, stringArrayOrNull } from '~/server/utils/validation-helpers'
import { queryFirst } from '~/server/db'
import { requireSiteAccess } from '~/server/utils/location-access'
import { assertResourceAccess } from '~/server/utils/member-access'
import type { PriceInput } from '~/shared/prices'

const optionalNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const optionalInteger = (value: unknown) => {
  const parsed = optionalNumber(value)
  return parsed !== null && Number.isInteger(parsed) ? parsed : null
}

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const experienceId = getRouterParam(event, 'experienceId')
  if (!siteId || !experienceId) return jsonResponse({ error: 'siteId and experienceId required' }, { status: 400 })

  const { env, db, site } = await requireSiteAccess(event, siteId, 'context')
  const existing = await queryFirst<{ location_id: string }>(db, 'SELECT location_id FROM experiences WHERE id = ? AND site_id = ? LIMIT 1', [experienceId, siteId])
  if (!existing) return jsonResponse({ error: 'Experience not found' }, { status: 404 })
  const principal = {
    env,
    memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId, }
  await assertResourceAccess(db, { ...principal, resourceLocationId: existing.location_id })

  let body: Record<string, ApiValue>
  try { body = await readRequiredBody<Record<string, ApiValue>>(event) } catch { return jsonResponse({ error: 'Invalid request body' }, { status: 400 }) }
  if ('media' in body) return jsonResponse({ error: 'Experience gallery changes must use media placement attach/remove/reorder operations' }, { status: 400 })

  const updates: Record<string, ApiValue> = {}
  if ('title' in body) updates.title = String(body.title).trim()
  if ('tagline' in body) updates.tagline = body.tagline ? String(body.tagline).trim() : null
  if ('body' in body) updates.body = body.body ? String(body.body).trim() : null
  try {
    if ('highlights' in body) updates.highlights = stringArrayOrNull(body.highlights)
    if ('included_items' in body) updates.included_items = stringArrayOrNull(body.included_items)
    if ('what_to_bring' in body) updates.what_to_bring = stringArrayOrNull(body.what_to_bring)
  } catch (err) {
    if (err instanceof InvalidFieldError) return jsonResponse({ error: 'highlights, included_items, and what_to_bring must be arrays' }, { status: 400 })
    throw err
  }
  if ('meeting_point' in body) updates.meeting_point = body.meeting_point ? String(body.meeting_point).trim() : null
  if ('pricing_note' in body) updates.pricing_note = body.pricing_note ? String(body.pricing_note).trim() : null
  if ('price' in body) updates.price = body.price === null ? null : body.price as PriceInput
  if ('duration_minutes' in body) updates.duration_minutes = optionalInteger(body.duration_minutes)
  if ('max_capacity' in body) updates.max_capacity = optionalInteger(body.max_capacity)
  if ('time_slots' in body) updates.time_slots = Array.isArray(body.time_slots) ? body.time_slots.map(String) : null
  if ('recurring_slots' in body) {
    updates.recurring_slots = body.recurring_slots && typeof body.recurring_slots === 'object' && !Array.isArray(body.recurring_slots)
      ? (body.recurring_slots as Record<string, string[]>)
      : null
  }
  if ('available_note' in body) updates.available_note = body.available_note ? String(body.available_note).trim() : null
  if ('status' in body && ['active', 'inactive', 'sold_out'].includes(String(body.status))) updates.status = String(body.status)
  if ('sort_order' in body) {
    const sortOrder = optionalInteger(body.sort_order)
    if (sortOrder === null) return jsonResponse({ error: 'sort_order must be an integer' }, { status: 400 })
    updates.sort_order = sortOrder
  }
  if ('featured' in body) {
    if (typeof body.featured !== 'boolean') return jsonResponse({ error: 'featured must be a boolean' }, { status: 400 })
    updates.featured = body.featured
  }
  if ('featured_sort_order' in body) {
    const featuredSortOrder = optionalInteger(body.featured_sort_order)
    if (featuredSortOrder === null) return jsonResponse({ error: 'featured_sort_order must be an integer' }, { status: 400 })
    updates.featured_sort_order = featuredSortOrder
  }
  if ('location_id' in body) {
    if (!body.location_id) return jsonResponse({ error: 'location_id cannot be cleared' }, { status: 400 })
    const location = await queryFirst<{ id: string }>(db, `SELECT id FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1`, [String(body.location_id), siteId])
    if (!location) return jsonResponse({ error: 'location_id must reference a location on this site' }, { status: 400 })
    await assertResourceAccess(db, { ...principal, resourceLocationId: String(body.location_id) })
    updates.location_id = String(body.location_id)
  }
  if ('seo_title' in body) updates.seo_title = body.seo_title ? String(body.seo_title).trim() : null
  if ('seo_description' in body) updates.seo_description = body.seo_description ? String(body.seo_description).trim() : null

  const experience = await updateExperience(db, siteId, experienceId, updates as ApiValue, env)
  if (!experience) return jsonResponse({ error: 'Experience not found' }, { status: 404 })

  return jsonResponse({ experience })
})
import { defineHandler } from 'nitro';
import { getRouterParam  } from 'nitro/h3';
