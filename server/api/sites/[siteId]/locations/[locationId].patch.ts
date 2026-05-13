// Update a business location for a site
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'

interface UpdateLocationBody {
  title?: string
  slug?: string
  address?: unknown
  city?: string
  phone?: string
  email?: string
  image_url?: string
  website_url?: string
  maps_url?: string
  opening_hours?: unknown
  special_hours?: unknown
  description?: string
  short_description?: string
  price_level?: string
  attributes?: unknown
  facebook_url?: string
  instagram_url?: string
  tiktok_url?: string
  google_place_id?: string
  is_primary?: boolean
  status?: 'active' | 'inactive' | 'sync_error'
}

interface SiteRow {
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
  image_url: string | null
  website_url: string | null
  maps_url: string | null
  opening_hours: string | null
  is_primary: number | boolean
  status: string
  created_at: string
  updated_at: string
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  const body = await readBody(event) as UpdateLocationBody

  if (!siteId || !locationId) {
    return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  }

  if (Object.keys(body).length === 0) {
    return jsonResponse({ error: 'No update fields provided' }, { status: 400 })
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
    `).bind(siteId, session.user.id).first() as SiteRow | null

    if (!site) {
      return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
    }

    const existingLocation = await db.prepare(`
      SELECT id
      FROM business_locations
      WHERE id = ? AND organization_id = ? AND site_id = ?
      LIMIT 1
    `).bind(locationId, site.organization_id, siteId).first()

    if (!existingLocation) {
      return jsonResponse({ error: 'Location not found' }, { status: 404 })
    }

    const setParts: string[] = []
    const params: unknown[] = []

    if (body.title !== undefined) {
      if (!body.title.trim()) {
        return jsonResponse({ error: 'Location title is required' }, { status: 400 })
      }
      setParts.push('title = ?')
      params.push(body.title.trim())
    }

    if (body.slug !== undefined) {
      const slug = slugify(body.slug)
      if (!slug) {
        return jsonResponse({ error: 'Location slug is required' }, { status: 400 })
      }

      const duplicate = await db.prepare(`
        SELECT id FROM business_locations
        WHERE organization_id = ? AND site_id = ? AND slug = ? AND id != ?
        LIMIT 1
      `).bind(site.organization_id, siteId, slug, locationId).first()

      if (duplicate) {
        return jsonResponse({ error: 'Location slug already exists' }, { status: 409 })
      }

      setParts.push('slug = ?')
      params.push(slug)
    }

    if (body.address !== undefined) {
      setParts.push('address = ?')
      params.push(body.address ? JSON.stringify(body.address) : null)
    }
    if (body.city !== undefined) {
      setParts.push('city = ?')
      params.push(body.city || null)
    }
    if (body.phone !== undefined) {
      setParts.push('phone = ?')
      params.push(body.phone || null)
    }
    if (body.image_url !== undefined) {
      setParts.push('image_url = ?')
      params.push(body.image_url || null)
    }
    if (body.website_url !== undefined) {
      setParts.push('website_url = ?')
      params.push(body.website_url || null)
    }
    if (body.maps_url !== undefined) {
      setParts.push('maps_url = ?')
      params.push(body.maps_url || null)
    }
    if (body.opening_hours !== undefined) {
      setParts.push('opening_hours = ?')
      params.push(body.opening_hours ? JSON.stringify(body.opening_hours) : null)
    }
    if (body.status !== undefined) {
      const allowedStatuses = ['active', 'inactive', 'sync_error']
      if (!allowedStatuses.includes(body.status)) {
        return jsonResponse({ error: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}` }, { status: 400 })
      }
      setParts.push('status = ?')
      params.push(body.status)
    }

    const simpleFields: Array<[keyof UpdateLocationBody, string?]> = [
      ['email'], ['description'], ['short_description'], ['price_level'],
      ['facebook_url'], ['instagram_url'], ['tiktok_url'], ['google_place_id'],
    ]
    for (const [field] of simpleFields) {
      if (body[field] !== undefined) {
        setParts.push(`${field} = ?`)
        params.push((body[field] as string) || null)
      }
    }
    if (body.special_hours !== undefined) {
      setParts.push('special_hours = ?')
      params.push(body.special_hours ? JSON.stringify(body.special_hours) : null)
    }
    if (body.attributes !== undefined) {
      setParts.push('attributes = ?')
      params.push(body.attributes ? JSON.stringify(body.attributes) : null)
    }

    const now = new Date().toISOString()
    setParts.push('updated_at = ?')
    params.push(now)

    const statements = []
    if (body.is_primary === true) {
      statements.push(db.prepare(`
        UPDATE business_locations
        SET is_primary = 0, updated_at = ?
        WHERE organization_id = ? AND site_id = ?
      `).bind(now, site.organization_id, siteId))

      setParts.push('is_primary = 1')

      statements.push(db.prepare(`
        UPDATE sites
        SET primary_location_id = ?, updated_at = ?, updated_by = ?
        WHERE id = ? AND organization_id = ?
      `).bind(locationId, now, session.user.id, siteId, site.organization_id))
    } else if (body.is_primary === false) {
      setParts.push('is_primary = 0')
      statements.push(db.prepare(`
        UPDATE sites
        SET primary_location_id = NULL, updated_at = ?, updated_by = ?
        WHERE id = ? AND organization_id = ? AND primary_location_id = ?
      `).bind(now, session.user.id, siteId, site.organization_id, locationId))
    }

    statements.push(db.prepare(`
      UPDATE business_locations
      SET ${setParts.join(', ')}
      WHERE id = ? AND organization_id = ? AND site_id = ?
    `).bind(...params, locationId, site.organization_id, siteId))

    await db.batch(statements)

    const location = await db.prepare(`
      SELECT id, slug, title, address, city, phone, image_url, website_url,
             maps_url, opening_hours, is_primary, status, created_at, updated_at
      FROM business_locations
      WHERE id = ? AND organization_id = ? AND site_id = ?
      LIMIT 1
    `).bind(locationId, site.organization_id, siteId).first() as LocationRow | null

    if (!location) {
      return jsonResponse({ error: 'Updated location could not be loaded' }, { status: 500 })
    }

    return jsonResponse({
      success: true,
      location: {
        ...location,
        address: (() => { try { return location.address ? JSON.parse(location.address) : null } catch { return null } })(),
        opening_hours: (() => { try { return location.opening_hours ? JSON.parse(location.opening_hours) : null } catch { return null } })(),
        is_primary: Boolean(location.is_primary)
      }
    })
  } catch (error) {
    console.error('Failed to update business location:', error)
    return jsonResponse({ error: 'Failed to update business location' }, { status: 500 })
  }
})
