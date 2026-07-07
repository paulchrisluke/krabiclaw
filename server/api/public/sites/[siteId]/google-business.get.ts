// Get tenant-scoped Google Business data from audited schema
import { queryAll, queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getPublishedPosts } from '~/server/utils/post-management'

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
interface JsonObject {
  [key: string]: JsonValue
}

interface LocationRow {
  id: string
  title: string
  city: string | null
  address: string | null
  phone: string | null
  website_url: string | null
  latitude: number | null
  longitude: number | null
  categories: string | null
  rating: number | null
  review_count: number | null
  description: string | null
  maps_url: string | null
  last_synced_at: string | null
}

interface ReviewRow {
  author: string | null
  rating: number | null
  content: string | null
  date: string | null
}

const parseJson = (raw: string | null): JsonValue => {
  if (!raw) return null
  try {
    return JSON.parse(raw) as JsonValue
  } catch {
    return null
  }
}

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
  const db = env.db

  if (!db) throw createError({ statusCode: 503, message: 'Database unavailable' })

  try {
    // Get primary location for this site
    const location = await queryFirst<LocationRow>(db, `
      SELECT * FROM business_locations 
      WHERE site_id = ? AND status = 'active'
      ORDER BY is_primary DESC, created_at ASC
      LIMIT 1
    `, [siteId])
    
    if (!location) {
      return jsonResponse({
        ...emptyData,
        errors: [{ source: 'db', message: 'No business location data available. Connect Google Business from admin.' }]
      })
    }

    // Get reviews for this site/location
    const reviewRows = await queryAll<ReviewRow>(db, `
      SELECT author_name AS author, rating, content, created_at AS date
      FROM reviews
      WHERE site_id = ? AND (location_id = ? OR location_id IS NULL) AND status = 'approved'
      ORDER BY created_at DESC
      LIMIT 10
    `, [siteId, location.id])

    // Map business info from business_locations columns
    const business = {
      title: location.title,
      city: location.city,
      storefrontAddress: parseJson(location.address),
      phoneNumbers: location.phone ? [{ phoneNumber: location.phone }] : [],
      websiteUri: location.website_url,
      mapsUri: location.maps_url,
      latlng: location.latitude && location.longitude ? { latitude: location.latitude, longitude: location.longitude } : null,
      categories: (parseJson(location.categories) as JsonValue[] | null) ?? [],
      profile: {
        description: location.description
      },
      reviewSummary:
        location.last_synced_at && location.rating != null && location.review_count != null
          ? {
              averageRating: location.rating,
              totalReviewCount: location.review_count
            }
          : null
    }
    
    const posts = await getPublishedPosts(db, siteId, env, 6)

    return jsonResponse({
      business,
      reviews: reviewRows,
      media: [],
      posts,
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
