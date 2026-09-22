// PATCH update site settings
import { jsonResponse } from '~/server/utils/api-response'
import { isDemoOrg } from '~/server/utils/demo'
import { updateSiteSettingsFields } from '~/server/utils/site-settings'
import type { UpdateSiteSettingsRequest } from '~/server/types/site'
import { defineHandler } from 'nitro'
import {  getRouterParam, readBody } from 'nitro/h3';
import { requireSiteAccess } from '~/server/utils/location-access'
import { hasPlatformEventPermission } from '~/server/utils/platform-admin-users'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const body = await readBody(event) as UpdateSiteSettingsRequest
  if (!organizationId) {
    return jsonResponse({ 
      error: 'Organization ID is required' 
    }, { status: 400 })
  }

  if (Object.keys(body).length === 0) {
    return jsonResponse({ 
      error: 'No update fields provided' 
    }, { status: 400 })
  }

  const { env, db, session, site } = await requireSiteAccess(event, organizationId)


  try {
    // Demo org is read-only for everyone except platform admins
    const isPlatformAdmin = await hasPlatformEventPermission(event, env, { platform: ['access'] })
    if (isDemoOrg(site.organization_id) && !isPlatformAdmin) {
      return jsonResponse({ error: 'Demo site is read-only' }, { status: 403 })
    }

    const result = await updateSiteSettingsFields(
      db, env, organizationId, site.organization_id, body, session.user.id
    )

    return jsonResponse(result.data, { status: result.status })
    
  } catch (error) {
    console.error('Failed to update site settings:', error)
    return jsonResponse({ 
      error: 'Failed to update site settings' 
    }, { status: 500 })
  }
})
