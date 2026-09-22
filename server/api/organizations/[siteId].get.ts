// Get single site details
import { jsonResponse } from '../../utils/api-response'
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
import { queryFirst } from '~/server/db'
import { requireOrganizationAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')

  if (!organizationId) {
    return jsonResponse({
      error: 'Organization ID is required'
    }, { status: 400 })
  }

  try {
    const { db } = await requireOrganizationAccess(event, organizationId, 'context')
    const site = await queryFirst<{ organization_id: string }>(db, `
      SELECT id, organization_id, theme_id, vertical, name, slug, subdomain,
             (SELECT domain FROM organization_domains WHERE organization_id = organization.id AND role = 'canonical' AND status = 'active' AND type = 'custom') AS custom_domain, status, created_at, updated_at,
             onboarding_status
      FROM organization
      WHERE id = ?
      LIMIT 1
    `, [organizationId])

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
