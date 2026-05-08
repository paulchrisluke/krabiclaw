import { cloudflareEnv } from '../../utils/api-response'
import { getAuthSession } from '../../utils/auth'
import { createError, defineEventHandler } from 'h3'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB

  if (!db) {
    throw createError({ statusCode: 503, message: 'Database unavailable' })
  }

  const session = await getAuthSession(event, env)

  if (!session?.user?.id) {
    throw createError({ statusCode: 401, message: 'Authentication required' })
  }

  const membership = await db.prepare(`
    SELECT o.id
    FROM organization o
    JOIN member m ON o.id = m.organizationId
    WHERE m.userId = ?
    LIMIT 1
  `).bind(session.user.id).first() as { id: string } | null

  if (!membership) {
    throw createError({ statusCode: 404, message: 'Organization not found' })
  }

  const site = await db.prepare(`
    SELECT id
    FROM sites
    WHERE organization_id = ? AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(membership.id).first() as { id: string } | null

  if (!site) {
    return {
      business: null,
      reviews: [],
      media: [],
      posts: [],
      errors: [{ source: 'db', message: 'No active site found for this organization.' }],
      syncedAt: null
    }
  }

  const location = await db.prepare(`
    SELECT *
    FROM business_locations
    WHERE organization_id = ? AND site_id = ? AND status = 'active'
    ORDER BY is_primary DESC, created_at ASC
    LIMIT 1
  `).bind(membership.id, site.id).first() as any

  if (!location) {
    return {
      business: null,
      reviews: [],
      media: [],
      posts: [],
      errors: [{ source: 'db', message: 'No Google Business location data available. Connect Google Business from the Connection tab.' }],
      syncedAt: null
    }
  }

  const reviews = await db.prepare(`
    SELECT id, author_name AS author, rating, content, status, source, created_at AS createdAt
    FROM reviews
    WHERE organization_id = ? AND site_id = ? AND (location_id = ? OR location_id IS NULL)
    ORDER BY created_at DESC
    LIMIT 50
  `).bind(membership.id, site.id, location.id).all()

  const business = {
    title: location.title,
    storefrontAddress: location.address ? JSON.parse(location.address) : null,
    phoneNumbers: location.phone ? [{ phoneNumber: location.phone }] : [],
    websiteUri: location.website_url,
    latlng: location.latitude && location.longitude
      ? { latitude: location.latitude, longitude: location.longitude }
      : null,
    categories: location.categories ? JSON.parse(location.categories) : [],
    reviewSummary: {
      averageRating: location.rating,
      totalReviewCount: location.review_count
    }
  }

  return {
    business,
    reviews: reviews.results,
    media: [],
    posts: [],
    errors: [],
    syncedAt: location.last_synced_at
  }
})
