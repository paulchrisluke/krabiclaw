import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import type { H3Event } from 'h3'

interface SiteAccessRow {
  id: string
  organization_id: string
}

interface LocationAccessRow {
  id: string
}

export async function requireLocationAccess(
  event: H3Event,
  siteId: string,
  locationId: string,
  roles = ['owner', 'admin', 'editor']
) {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) {
    throw createError({ statusCode: 500, message: 'Database not available' })
  }

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) {
    throw createError({ statusCode: 401, message: 'Authentication required' })
  }

  if (roles.length === 0) {
    throw createError({ statusCode: 403, message: 'Access denied' })
  }

  const placeholders = roles.map(() => '?').join(', ')
  const site = await db.prepare(`
    SELECT s.id, s.organization_id
    FROM sites s
    JOIN member om ON s.organization_id = om.organizationId
    WHERE s.id = ? AND om.userId = ? AND om.role IN (${placeholders})
    LIMIT 1
  `).bind(siteId, session.user.id, ...roles).first() as SiteAccessRow | null

  if (!site) {
    throw createError({ statusCode: 404, message: 'Site not found or access denied' })
  }

  const location = await db.prepare(`
    SELECT id
    FROM business_locations
    WHERE id = ? AND organization_id = ? AND site_id = ?
    LIMIT 1
  `).bind(locationId, site.organization_id, siteId).first() as LocationAccessRow | null

  if (!location) {
    throw createError({ statusCode: 404, message: 'Location not found' })
  }

  return { env, db, session, site, location }
}
