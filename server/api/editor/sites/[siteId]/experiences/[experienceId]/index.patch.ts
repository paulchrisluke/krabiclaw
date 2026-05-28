import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { updateExperience } from '~/server/utils/experiences'

const optionalNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const optionalInteger = (value: unknown) => {
  const parsed = optionalNumber(value)
  return parsed !== null && Number.isInteger(parsed) ? parsed : null
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const experienceId = getRouterParam(event, 'experienceId')
  if (!siteId || !experienceId) return jsonResponse({ error: 'siteId and experienceId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db
    .prepare(
      `SELECT s.id FROM sites s
       JOIN member m ON m.organizationId = s.organization_id
       WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner','admin') LIMIT 1`,
    )
    .bind(siteId, session.user.id)
    .first<{ id: string }>()

  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  let body: Record<string, ApiValue>
  try { body = await readBody(event) } catch { return jsonResponse({ error: 'Invalid request body' }, { status: 400 }) }

  const updates: Record<string, ApiValue> = {}
  if ('title' in body) updates.title = String(body.title).trim()
  if ('tagline' in body) updates.tagline = body.tagline ? String(body.tagline).trim() : null
  if ('body' in body) updates.body = body.body ? String(body.body).trim() : null
  if ('image_asset_id' in body) updates.image_asset_id = body.image_asset_id ? String(body.image_asset_id) : null
  if ('price' in body) updates.price = body.price ? String(body.price).trim() : null
  if ('duration_minutes' in body) updates.duration_minutes = optionalInteger(body.duration_minutes)
  if ('max_capacity' in body) updates.max_capacity = optionalInteger(body.max_capacity)
  if ('time_slots' in body) updates.time_slots = Array.isArray(body.time_slots) ? body.time_slots.map(String) : null
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
  if ('location_id' in body) updates.location_id = body.location_id ? String(body.location_id) : null
  if ('seo_title' in body) updates.seo_title = body.seo_title ? String(body.seo_title).trim() : null
  if ('seo_description' in body) updates.seo_description = body.seo_description ? String(body.seo_description).trim() : null

  const experience = await updateExperience(db, siteId, experienceId, updates as ApiValue)
  if (!experience) return jsonResponse({ error: 'Experience not found' }, { status: 404 })

  return jsonResponse({ experience })
})
