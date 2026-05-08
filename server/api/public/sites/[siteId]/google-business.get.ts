// Get tenant-scoped Google Business data from audited schema
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'

const emptyData = {
  business: null,
  reviews: [],
  media: [],
  posts: [],
  errors: [],
  syncedAt: null
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'public, max-age=300') // 5 minutes cache

  const siteId = getRouterParam(event, 'siteId')
  
  if (!siteId) {
    return jsonResponse({ 
      error: 'Site ID is required' 
    }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB

  if (!env.REVIEWS_DB) throw createError({ statusCode: 503, message: 'Database unavailable' })

  try {
    // Get primary location for this site
    const location = await db.prepare(`
      SELECT * FROM business_locations 
      WHERE site_id = ? AND status = 'active'
      ORDER BY is_primary DESC, created_at ASC
      LIMIT 1
    `).bind(siteId).first() as any
    
    if (!location) {
      return jsonResponse({
        ...emptyData,
        errors: [{ source: 'db', message: 'No business location data available. Connect Google Business from admin.' }]
      })
    }

    // Get reviews for this site/location
    const reviews = await db.prepare(`
      SELECT author_name AS author, rating, COALESCE(content, comment) AS content, created_at AS date
      FROM reviews
      WHERE site_id = ? AND (location_id = ? OR location_id IS NULL) AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 10
    `).bind(siteId, location.id).all()

    // Map business info from business_locations columns
    const business = {
      title: location.title,
      storefrontAddress: location.address ? JSON.parse(location.address) : null,
      phoneNumbers: location.phone ? [{ phoneNumber: location.phone }] : [],
      websiteUri: location.website_url,
      latlng: location.latitude && location.longitude ? { latitude: location.latitude, longitude: location.longitude } : null,
      categories: location.categories ? JSON.parse(location.categories) : [],
      reviewSummary: {
        averageRating: location.rating,
        totalReviewCount: location.review_count
      }
    }
    
    return jsonResponse({
      business,
      reviews: reviews.results ?? [],
      media: [], // Media and posts are currently not stored in specific columns
      posts: [],
      syncedAt: location.last_synced_at
    })
    
  } catch (error) {
    console.error('Failed to get tenant Google Business data:', error)
    return jsonResponse({
      ...emptyData,
      errors: [{ source: 'api', message: error instanceof Error ? error.message : String(error) }]
    }, { status: 500 })
  }
})
