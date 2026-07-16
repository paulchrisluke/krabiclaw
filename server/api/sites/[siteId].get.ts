// Get single site details
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getAuthSession } from '../../utils/auth'
import { defineEventHandler, getRouterParam } from 'h3'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')

  if (!siteId) {
    return jsonResponse({
      error: 'Site ID is required'
    }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.DB

  if (!db) {
    return jsonResponse({
      error: 'Database not available'
    }, { status: 500 })
  }

  // Get authenticated user
  const session = await getAuthSession(event, env)

  if (!session?.user?.id) {
    return jsonResponse({
      error: 'Authentication required'
    }, { status: 401 })
  }

  try {
    const site = await queryFirst<{ organization_id: string }>(db, `
      SELECT id, organization_id, theme_id, vertical, brand_name, slug, subdomain,
             custom_domain, status, plan, created_at, updated_at,
             onboarding_status
      FROM sites
      WHERE id = ?
      LIMIT 1
    `, [siteId])

    if (!site) {
      return jsonResponse({
        error: 'Site not found'
      }, { status: 404 })
    }

    // Verify user owns this site
    const membership = await queryFirst(db, `
      SELECT 1 FROM member m
      WHERE m.organizationId = ? AND m.userId = ?
      LIMIT 1
    `, [site.organization_id, session.user.id])

    if (!membership) {
      return jsonResponse({
        error: 'Access denied'
      }, { status: 403 })
    }

    return jsonResponse(site)

  } catch (error) {
    console.error('Failed to fetch site:', error)
    return jsonResponse({
      error: 'Failed to fetch site'
    }, { status: 500 })
  }
})
