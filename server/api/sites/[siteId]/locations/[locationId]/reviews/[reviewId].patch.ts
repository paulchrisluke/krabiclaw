import { cleanString, jsonResponse } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  const reviewId = getRouterParam(event, 'reviewId')

  if (!siteId || !locationId || !reviewId) {
    return jsonResponse({ error: 'Site ID, location ID, and review ID are required' }, { status: 400 })
  }

  const body = await readBody(event) as ApiRecord
  const { db } = await requireLocationAccess(event, siteId, locationId, ['owner', 'admin'])

  const setParts: string[] = []
  const params: ApiValue[] = []

  if (body.author_name !== undefined) {
    const authorName = cleanString(body.author_name, 120)
    if (!authorName) return jsonResponse({ error: 'Author name is required' }, { status: 400 })
    setParts.push('author_name = ?')
    params.push(authorName)
  }
  if (body.title !== undefined) {
    setParts.push('title = ?')
    params.push(cleanString(body.title, 160) || null)
  }
  if (body.content !== undefined) {
    const content = cleanString(body.content, 2000)
    if (!content) return jsonResponse({ error: 'Review content is required' }, { status: 400 })
    setParts.push('content = ?')
    params.push(content)
  }
  if (body.rating !== undefined) {
    const rating = Number(body.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return jsonResponse({ error: 'Rating must be between 1 and 5' }, { status: 400 })
    }
    setParts.push('rating = ?')
    params.push(rating)
  }
  if (body.status !== undefined) {
    const status = cleanString(body.status, 20)
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return jsonResponse({ error: 'Invalid review status' }, { status: 400 })
    }
    setParts.push('status = ?')
    params.push(status)
  }
  if (body.created_at !== undefined) {
    setParts.push('created_at = ?')
    params.push(cleanString(body.created_at, 40) || new Date().toISOString())
  }

  if (!setParts.length) {
    return jsonResponse({ error: 'No update fields provided' }, { status: 400 })
  }

  const now = new Date().toISOString()
  setParts.push('updated_at = ?')
  params.push(now)

  const result = await db.prepare(`
    UPDATE reviews
    SET ${setParts.join(', ')}
    WHERE id = ? AND site_id = ? AND location_id = ?
  `).bind(...params, reviewId, siteId, locationId).run()

  if (!result.meta.changes) {
    return jsonResponse({ error: 'Review not found' }, { status: 404 })
  }

  const review = await db.prepare(`
    SELECT id, author_name, reviewer_photo_url, rating, title, content, owner_reply,
           owner_reply_at, photo_urls, source, status, created_at, updated_at
    FROM reviews
    WHERE id = ? AND site_id = ? AND location_id = ?
    LIMIT 1
  `).bind(reviewId, siteId, locationId).first()

  return jsonResponse({ success: true, review })
})

