// Create a business location for a site
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getOrganizationEntitlements, updateSubscriptionQuantity } from '~/server/utils/billing'

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
interface JsonObject {
  [key: string]: JsonValue
}

interface CreateLocationBody {
  title?: string
  slug?: string
  address?: JsonValue
  city?: string
  phone?: string
  hero_image_asset_id?: string
  website_url?: string
  maps_url?: string
  description?: string
  google_place_id?: string
  rating?: number | string | null
  review_count?: number | string | null
  opening_hours?: JsonValue
  is_primary?: boolean
}

interface SiteRow {
  id: string
  organization_id: string
}

interface CountRow {
  count: number | string
}

interface ExistingLocationRow {
  id: string
}

interface MediaAssetRow {
  id: string
  organization_id: string
}

interface LocationRow {
  id: string
  slug: string
  title: string
  address: string | null
  city: string | null
  phone: string | null
  hero_image_asset_id: string | null
  website_url: string | null
  maps_url: string | null
  description: string | null
  google_place_id: string | null
  rating: number | null
  review_count: number | null
  opening_hours: string | null
  is_primary: number | boolean
  status: string
  created_at: string
  updated_at: string
}

const isPlainObjectOrArray = (v: JsonValue): v is JsonObject | JsonValue[] =>
  v !== null && (Array.isArray(v) || (typeof v === 'object' && Object.prototype.toString.call(v) === '[object Object]'))

const safeJsonParse = (raw: string | null | undefined, context: string): JsonValue => {
  if (!raw) return null
  try {
    return JSON.parse(raw) as JsonValue
  } catch (err) {
    console.error(`Failed to parse JSON for ${context}:`, err)
    return null
  }
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const body = await readBody(event) as CreateLocationBody

  if (!siteId) {
    return jsonResponse({ error: 'Site ID is required' }, { status: 400 })
  }

  if (!body.title?.trim()) {
    return jsonResponse({ error: 'Location title is required' }, { status: 400 })
  }

  if (body.address !== undefined && body.address !== null && !isPlainObjectOrArray(body.address)) {
    return jsonResponse({ error: 'address must be an object or array' }, { status: 400 })
  }
  if (body.opening_hours !== undefined && body.opening_hours !== null && !isPlainObjectOrArray(body.opening_hours)) {
    return jsonResponse({ error: 'opening_hours must be an object or array' }, { status: 400 })
  }

  const slug = slugify(body.slug || body.title)
  if (!slug) {
    return jsonResponse({ error: 'Location slug is required' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) {
    return jsonResponse({ error: 'Database not available' }, { status: 500 })
  }

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) {
    return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const site = await db.prepare(`
      SELECT s.id, s.organization_id
      FROM sites s
      JOIN member om ON s.organization_id = om.organizationId
      WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin')
      LIMIT 1
    `).bind(siteId, session.user.id).first() as SiteRow | null

    if (!site) {
      return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
    }

    const existing = await db.prepare(`
      SELECT id FROM business_locations
      WHERE organization_id = ? AND site_id = ? AND slug = ?
      LIMIT 1
    `).bind(site.organization_id, siteId, slug).first() as ExistingLocationRow | null

    if (existing) {
      return jsonResponse({ error: 'Location slug already exists' }, { status: 409 })
    }

    const activeCount = await db.prepare(`
      SELECT COUNT(*) AS count
      FROM business_locations
      WHERE organization_id = ? AND site_id = ? AND status = 'active'
    `).bind(site.organization_id, siteId).first() as CountRow | null

    if (!activeCount) {
      console.error('Null active location count when creating location', {
        organizationId: site.organization_id,
        siteId
      })
      return jsonResponse({ error: 'Unable to verify active locations' }, { status: 500 })
    }

    const activeLocationCount = Number(activeCount.count)
    if (!Number.isFinite(activeLocationCount)) {
      console.error('Invalid active location count when creating location', {
        count: activeCount.count,
        organizationId: site.organization_id,
        siteId
      })
      return jsonResponse({ error: 'Unable to verify active locations' }, { status: 500 })
    }

    const entitlements = await getOrganizationEntitlements(env, db, site.organization_id)
    const maxLocations = typeof entitlements.max_locations === 'number' ? entitlements.max_locations : 1
    if (maxLocations > 0 && activeLocationCount >= maxLocations) {
      return jsonResponse({
        error: 'Location limit reached. Upgrade to Pro to add more locations.',
        code: 'LOCATION_LIMIT_REACHED'
      }, { status: 402 })
    }

    // Validate hero_image_asset_id if present
    if (body.hero_image_asset_id) {
      const asset = await db.prepare(`
        SELECT id, organization_id FROM media_assets WHERE id = ? LIMIT 1
      `).bind(body.hero_image_asset_id).first() as MediaAssetRow | null
      if (!asset || asset.organization_id !== site.organization_id) {
        return jsonResponse({ error: 'Invalid or unauthorized hero_image_asset_id' }, { status: 400 })
      }
    }

    const isPrimary = body.is_primary === true || activeLocationCount === 0
    let rating: number | null = null
    const rawRating = body.rating === undefined || body.rating === null ? '' : String(body.rating).trim()
    if (rawRating !== '') {
      rating = Number(rawRating)
      if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
        return jsonResponse({ error: 'Rating must be between 0 and 5' }, { status: 400 })
      }
    }
    let reviewCount: number | null = null
    const rawReviewCount = body.review_count === undefined || body.review_count === null ? '' : String(body.review_count).trim()
    if (rawReviewCount !== '') {
      reviewCount = Number(rawReviewCount)
      if (!Number.isInteger(reviewCount) || reviewCount < 0) {
        return jsonResponse({ error: 'Review count must be a whole number greater than or equal to 0' }, { status: 400 })
      }
    }
    const locationId = crypto.randomUUID()
    const now = new Date().toISOString()
    const statements: D1PreparedStatement[] = []

    if (isPrimary) {
      statements.push(db.prepare(`
        UPDATE business_locations
        SET is_primary = 0, updated_at = ?
        WHERE organization_id = ? AND site_id = ?
      `).bind(now, site.organization_id, siteId))
    }

    statements.push(db.prepare(`
      INSERT INTO business_locations (
        id, organization_id, site_id, slug, title, address, city, phone,
        hero_image_asset_id, website_url, maps_url, description, google_place_id,
        rating, review_count, opening_hours, is_primary, status,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).bind(
      locationId,
      site.organization_id,
      siteId,
      slug,
      body.title.trim(),
      body.address ? JSON.stringify(body.address) : null,
      body.city || null,
      body.phone || null,
      body.hero_image_asset_id || null,
      body.website_url || null,
      body.maps_url || null,
      body.description || null,
      body.google_place_id || null,
      rating,
      reviewCount,
      body.opening_hours ? JSON.stringify(body.opening_hours) : null,
      isPrimary ? 1 : 0,
      now,
      now
    ))

    if (isPrimary) {
      statements.push(db.prepare(`
        UPDATE sites
        SET primary_location_id = ?, updated_at = ?, updated_by = ?
        WHERE id = ? AND organization_id = ?
      `).bind(locationId, now, session.user.id, siteId, site.organization_id))
    }

    await db.batch(statements)

    const location = await db.prepare(`
      SELECT id, slug, title, address, city, phone, hero_image_asset_id, website_url,
             maps_url, description, google_place_id, rating, review_count,
             opening_hours, is_primary, status, created_at, updated_at
      FROM business_locations
      WHERE id = ? AND organization_id = ? AND site_id = ?
      LIMIT 1
    `).bind(locationId, site.organization_id, siteId).first() as LocationRow | null

    if (!location) {
      return jsonResponse({ error: 'Created location could not be loaded' }, { status: 500 })
    }

    // Run in background when supported; otherwise await to keep sync reliable.
    const syncPromise = updateSubscriptionQuantity(env, db, site.organization_id).catch((error) => {
      const normalizedError = error instanceof Error ? error : new Error('Unknown error')
      console.error('Failed to update Stripe subscription quantity after location create:', normalizedError)
    })
    const cfCtx = event.context.cloudflare?.context
    if (cfCtx?.waitUntil) {
      cfCtx.waitUntil(syncPromise)
    } else {
      await syncPromise
    }

    return jsonResponse({
      success: true,
      location: {
        ...location,
        address: safeJsonParse(location.address, `location.address (id=${locationId})`),
        opening_hours: safeJsonParse(location.opening_hours, `location.opening_hours (id=${locationId})`),
        is_primary: Boolean(location.is_primary)
      }
    }, { status: 201 })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    if (errMsg.includes('UNIQUE') || errMsg.includes('unique')) {
      return jsonResponse({ error: 'A primary location already exists for this site' }, { status: 409 })
    }
    console.error('Failed to create business location:', error)
    return jsonResponse({ error: 'Failed to create business location' }, { status: 500 })
  }
})
