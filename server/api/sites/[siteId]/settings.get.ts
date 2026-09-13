// GET site settings
import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { assertSiteWideAccess } from '~/server/utils/member-access'
import { loadMemberSiteRow } from '~/server/utils/location-access'
import { loadSettingsPayload } from '~/server/utils/site-settings'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
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

  const session = await getAuthSession(event, env)

  if (!session?.user?.id) {
    return jsonResponse({
      error: 'Authentication required'
    }, { status: 401 })
  }

  try {
    const siteAccess = await loadMemberSiteRow(db, env, siteId, session.user.id)
    if (!siteAccess) {
      return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
    }

    await assertSiteWideAccess(db, {
      env,
      memberId: siteAccess.member_id, role: siteAccess.member_role, organizationId: siteAccess.organization_id, siteId, })

    const settings = await loadSettingsPayload(db, siteAccess.organization_id, siteId)
    return jsonResponse({ success: true, settings })

  } catch (error) {
    rethrowHttpError(error)
    console.error('Failed to get site settings:', error)
    return jsonResponse({
      error: 'Failed to get site settings'
    }, { status: 500 })
  }
})
