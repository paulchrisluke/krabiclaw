import { cleanString, jsonResponse } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')

  if (!siteId || !locationId) {
    return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  }

  const body = await readBody(event) as ApiRecord
  const authorName = cleanString(body.author_name, 120)
  const title = cleanString(body.title, 160)
  const content = cleanString(body.content, 2000)
  const rating = Number(body.rating)
  const status = cleanString(body.status, 20) || 'approved'
  const createdAt = cleanString(body.created_at, 40) || new Date().toISOString()

  if (!authorName) return jsonResponse({ error: 'Author name is required' }, { status: 400 })
  if (!content) return jsonResponse({ error: 'Review content is required' }, { status: 400 })
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return jsonResponse({ error: 'Rating must be between 1 and 5' }, { status: 400 })
  }
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return jsonResponse({ error: 'Invalid review status' }, { status: 400 })
  }

  const { db, site } = await requireLocationAccess(event, siteId, locationId, ['owner', 'admin'])
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await db.prepare(`
    INSERT INTO reviews (
      id, organization_id, site_id, location_id, author_name, rating, title, content,
      status, source, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)
  `).bind(
    id,
    site.organization_id,
    siteId,
    locationId,
    authorName,
    rating,
    title || null,
    content,
    status,
    createdAt,
    now
  ).run()

  return jsonResponse({
    success: true,
    review: {
      id,
      organization_id: site.organization_id,
      site_id: siteId,
      location_id: locationId,
      author_name: authorName,
      rating,
      title: title || null,
      content,
      status,
      source: 'manual',
      created_at: createdAt,
      updated_at: now
    }
  }, { status: 201 })
})

