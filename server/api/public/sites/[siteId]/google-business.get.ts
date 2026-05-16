// Get tenant-scoped Google Business data from audited schema
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'

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

interface PostRow {
  id: string
  title: string | null
  body: string
  image_url: string | null
  published_at: string | null
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
  const db = env.REVIEWS_DB

  if (!env.REVIEWS_DB) throw createError({ statusCode: 503, message: 'Database unavailable' })

  try {
    // Get primary location for this site
    const location = await db.prepare(`
      SELECT * FROM business_locations 
      WHERE site_id = ? AND status = 'active'
      ORDER BY is_primary DESC, created_at ASC
      LIMIT 1
    `).bind(siteId).first() as LocationRow | null
    
    if (!location) {
      return jsonResponse({
        ...emptyData,
        errors: [{ source: 'db', message: 'No business location data available. Connect Google Business from admin.' }]
      })
    }

    // Get reviews for this site/location
    const reviews = await db.prepare(`
      SELECT author_name AS author, rating, content, created_at AS date
      FROM reviews
      WHERE site_id = ? AND (location_id = ? OR location_id IS NULL) AND status = 'approved'
      ORDER BY created_at DESC
      LIMIT 10
    `).bind(siteId, location.id).all()
    const reviewRows = (reviews.results ?? []) as unknown as ReviewRow[]

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
      reviewSummary: {
        averageRating: location.rating,
        totalReviewCount: location.review_count
      }
    }
    
    // Get published posts for this site (used for homepage highlights + /posts feed)
    const postsResult = await db.prepare(`
      SELECT p.id, p.title, p.body, p.published_at,
             ma.public_url as image_url
      FROM posts p
      LEFT JOIN media_assets ma ON p.image_asset_id = ma.id AND ma.status = 'active'
      WHERE p.site_id = ? AND p.status = 'published'
      ORDER BY p.published_at DESC
      LIMIT 6
    `).bind(siteId).all()
    const postRows = (postsResult.results ?? []) as unknown as PostRow[]

    // Shape posts to match the GMB post format the frontend expects
    const posts = postRows.map(p => ({
      name: `posts/${p.id}`,
      summary: p.body,
      title: p.title ?? '',
      createTime: p.published_at ?? '',
      media: p.image_url ? [{ googleUrl: p.image_url }] : []
    }))

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
