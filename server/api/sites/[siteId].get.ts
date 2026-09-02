// Get single site details
import { jsonResponse } from '../../utils/api-response'
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
import { queryFirst } from '~/server/db'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')

  if (!siteId) {
    return jsonResponse({
      error: 'Site ID is required'
    }, { status: 400 })
  }

  try {
    const { db } = await requireSiteAccess(event, siteId, 'context')
    const site = await queryFirst<{ organization_id: string }>(db, `
      SELECT id, organization_id, theme_id, vertical, brand_name, slug, subdomain,
             custom_domain, status, created_at, updated_at,
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

    return jsonResponse(site)

  } catch (error) {
    console.error('Failed to fetch site:', error)
    return jsonResponse({
      error: 'Failed to fetch site'
    }, { status: 500 })
  }
})
