import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { queryFirst } from '~/server/db'
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
  const db = env.DB
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
  const site = await queryFirst<SiteAccessRow>(db, `
    SELECT s.id, s.organization_id
    FROM sites s
    JOIN member om ON s.organization_id = om.organizationId
    WHERE s.id = ? AND om.userId = ? AND om.role IN (${placeholders})
    LIMIT 1
  `, [siteId, session.user.id, ...roles])

  if (!site) {
    throw createError({ statusCode: 404, message: 'Site not found or access denied' })
  }

  const location = await queryFirst<LocationAccessRow>(db, `
    SELECT id
    FROM business_locations
    WHERE id = ? AND organization_id = ? AND site_id = ?
    LIMIT 1
  `, [locationId, site.organization_id, siteId])

  if (!location) {
    throw createError({ statusCode: 404, message: 'Location not found' })
  }

  return { env, db, session, site, location }
}

export async function requireSiteAccess(
  event: H3Event,
  siteId: string,
  roles = ['owner', 'admin', 'editor']
) {
  const env = cloudflareEnv(event)
  const db = env.DB
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
  const site = await queryFirst<SiteAccessRow>(db, `
    SELECT s.id, s.organization_id
    FROM sites s
    JOIN member om ON s.organization_id = om.organizationId
    WHERE s.id = ? AND om.userId = ? AND om.role IN (${placeholders})
    LIMIT 1
  `, [siteId, session.user.id, ...roles])

  if (!site) {
    throw createError({ statusCode: 404, message: 'Site not found or access denied' })
  }

  return { env, db, session, site }
}
