// GET menus for site with optional location filter
import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { assertResourceAccess } from '~/server/utils/member-access'
import { getMenus } from '~/server/utils/menu-management'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getQuery(event).locationId as string | undefined
  
  if (!siteId) {
    return jsonResponse({ 
      error: 'Site ID is required' 
    }, { status: 400 })
  }

  try {
    const { env, db, site } = await requireSiteAccess(event, siteId, 'context')

    await assertResourceAccess(db, {
      env,
      memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId, resourceLocationId: locationId ?? null, })

    const menus = await getMenus(db, site.organization_id, siteId, locationId)
    
    return jsonResponse({
      success: true, menus, siteId, locationId
    })
    
  } catch (error) {
    rethrowHttpError(error)
    console.error('Failed to get menus:', error)
    return jsonResponse({ 
      error: 'Failed to get menus' 
    }, { status: 500 })
  }
})
import { defineHandler } from 'nitro';
import { getQuery, getRouterParam  } from 'nitro/h3';
