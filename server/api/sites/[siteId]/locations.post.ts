// Create a business location for a site
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'

interface CreateLocationBody {
  title?: string
  slug?: string
  address?: unknown
  city?: string
  phone?: string
  image_url?: string
  website_url?: string
  maps_url?: string
  opening_hours?: unknown
  is_primary?: boolean
}

const isPlainObjectOrArray = (v: unknown): v is Record<string, unknown> | unknown[] =>
  v !== null && (Array.isArray(v) || (typeof v === 'object' && Object.prototype.toString.call(v) === '[object Object]'))

const safeJsonParse = (raw: string | null | undefined, context: string): unknown => {
  if (!raw) return null
  try {
    return JSON.parse(raw)
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
  const db = env.REVIEWS_DB
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
    `).bind(siteId, session.user.id).first<{ id: string; organization_id: string }>()

    if (!site) {
      return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
    }

    const existing = await db.prepare(`
      SELECT id FROM business_locations
      WHERE organization_id = ? AND site_id = ? AND slug = ?
      LIMIT 1
    `).bind(site.organization_id, siteId, slug).first()

    if (existing) {
      return jsonResponse({ error: 'Location slug already exists' }, { status: 409 })
    }

    const activeCount = await db.prepare(`
      SELECT COUNT(*) AS count
      FROM business_locations
      WHERE organization_id = ? AND site_id = ? AND status = 'active'
    `).bind(site.organization_id, siteId).first<{ count: number }>()

    const isPrimary = body.is_primary === true || (activeCount?.count ?? 0) === 0
    const locationId = crypto.randomUUID()
    const now = new Date().toISOString()
    const statements = []

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
        image_url, website_url, maps_url, opening_hours, is_primary, status,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).bind(
      locationId,
      site.organization_id,
      siteId,
      slug,
      body.title.trim(),
      body.address ? JSON.stringify(body.address) : null,
      body.city || null,
      body.phone || null,
      body.image_url || null,
      body.website_url || null,
      body.maps_url || null,
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
      SELECT id, slug, title, address, city, phone, image_url, website_url,
             maps_url, opening_hours, is_primary, status, created_at, updated_at
      FROM business_locations
      WHERE id = ? AND organization_id = ? AND site_id = ?
      LIMIT 1
    `).bind(locationId, site.organization_id, siteId).first<any>()

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
