// PATCH update site settings
import { jsonResponse } from '~/server/utils/api-response'
import { isDemoOrg } from '~/server/utils/demo'
import { updateSiteSettingsFields } from '~/server/utils/site-settings'
import type { UpdateSiteSettingsRequest } from '~/server/types/site'
import { createError, getHeader, getRouterParam, readBody } from 'h3'
import { requireSiteAccess } from '~/server/utils/location-access'
import { hasPlatformEventPermission } from '~/server/utils/platform-admin-users'

function timingSafeEqualText(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  if (left.length !== right.length) {
    let _noop = 0
    for (let i = 0; i < left.length; i += 1) _noop |= left[i]!
    return false
  }
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= left[i]! ^ right[i]!
  return diff === 0
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const body = await readBody(event) as UpdateSiteSettingsRequest
  const forceSubdomainRegistrationFailure = getHeader(event, 'x-e2e-force-subdomain-failure') === 'true'
  
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

  if (forceSubdomainRegistrationFailure) {
    const e2eOverride = process.env.E2E_ALLOW_DEV_ROUTES === 'true'
    const expectedSecret = process.env.E2E_DEV_ROUTE_SECRET || ''
    const providedSecret = getHeader(event, 'x-dev-route-secret') || ''
    if (!e2eOverride || !expectedSecret || !providedSecret || !timingSafeEqualText(providedSecret, expectedSecret)) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    }
  }

  try {
    // Demo org is read-only for everyone except platform admins
    const isPlatformAdmin = await hasPlatformEventPermission(event, env, { platform: ['access'] })
    if (isDemoOrg(site.organization_id) && !isPlatformAdmin) {
      return jsonResponse({ error: 'Demo site is read-only' }, { status: 403 })
    }

    const result = await updateSiteSettingsFields(
      db,
      env,
      siteId,
      site.organization_id,
      body,
      session.user.id,
      { forceSubdomainRegistrationFailure }
    )

    return jsonResponse(result.data, { status: result.status })
    
  } catch (error) {
    console.error('Failed to update site settings:', error)
    return jsonResponse({ 
      error: 'Failed to update site settings' 
    }, { status: 500 })
  }
})
