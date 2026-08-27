// Direct dashboard settings update handler.
// Avoids the generic dashboard proxy hop for this request path.
import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { isDemoOrg } from '~/server/utils/demo'
import { updateSiteSettingsFields } from '~/server/utils/site-settings'
import type { UpdateSiteSettingsRequest } from '~/server/types/site'
import { defineHandler } from 'nitro'
import {  readBody } from 'nitro/h3';
import { assertSiteWideAccess } from '~/server/utils/member-access'
import { hasPlatformEventPermission } from '~/server/utils/platform-admin-users'

export default defineHandler(async (event) => {
  const body = await readBody(event) as UpdateSiteSettingsRequest

  if (typeof body !== 'object' || body === null || Object.keys(body).length === 0) {
    return jsonResponse(
      { error: 'No update fields provided' }, { status: 400 }, )
  }

  const { env, db, session, organization, site } = await getDashboardContext(event, { requireSite: true })

  if (!site) {
    return jsonResponse({ error: 'Site not found' }, { status: 404 })
  }
  await assertSiteWideAccess(db, {
    env,
    memberId: organization.memberId, role: organization.role, organizationId: organization.id, siteId: site.id, })


  try {
    const isPlatformAdmin = await hasPlatformEventPermission(event, env, { platform: ['access'] })
    if (isDemoOrg(organization.id) && !isPlatformAdmin) {
      return jsonResponse({ error: 'Demo site is read-only' }, { status: 403 })
    }

    const result = await updateSiteSettingsFields(
      db, env, site.id, organization.id, body, session.user.id, )

    return jsonResponse(result.data, { status: result.status })
  } catch (error) {
    console.error('Failed to update site settings:', error)
    return jsonResponse(
      { error: 'Failed to update site settings' }, { status: 500 }, )
  }
})
