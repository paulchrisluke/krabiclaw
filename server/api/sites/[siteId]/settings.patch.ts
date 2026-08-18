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
  const siteId = getRouterParam(event, 'siteId')
  const body = await readBody(event) as UpdateSiteSettingsRequest
  if (!siteId) {
    return jsonResponse({ 
      error: 'Site ID is required' 
    }, { status: 400 })
  }

  if (Object.keys(body).length === 0) {
    return jsonResponse({ 
      error: 'No update fields provided' 
    }, { status: 400 })
  }

  const { env, db, session, site } = await requireSiteAccess(event, siteId)


  try {
    // Demo org is read-only for everyone except platform admins
    const isPlatformAdmin = await hasPlatformEventPermission(event, env, { platform: ['access'] })
    if (isDemoOrg(site.organization_id) && !isPlatformAdmin) {
      return jsonResponse({ error: 'Demo site is read-only' }, { status: 403 })
    }

    const result = await updateSiteSettingsFields(
      db, env, siteId, site.organization_id, body, session.user.id
    )

    return jsonResponse(result.data, { status: result.status })
    
  } catch (error) {
    console.error('Failed to update site settings:', error)
    return jsonResponse({ 
      error: 'Failed to update site settings' 
    }, { status: 500 })
  }
})
