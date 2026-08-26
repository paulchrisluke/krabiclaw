import { jsonResponse } from '~/server/utils/api-response'
import { normalizeLocale } from '~/server/utils/site-i18n'
import { deleteSiteLocale } from '~/server/utils/site-locales'
import { isDemoOrg } from '~/server/utils/demo'
import { hasPlatformEventPermission } from '~/server/utils/platform-admin-users'
import { requireSiteAccess } from '~/server/utils/location-access'
import { assertOrganizationAccess } from '~/server/utils/member-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const localeParam = getRouterParam(event, 'locale')
  const locale = normalizeLocale(localeParam)
  if (!siteId || !locale) return jsonResponse({ error: 'Site ID and a valid locale are required' }, { status: 400 })

  const { env, db, site } = await requireSiteAccess(event, siteId, 'context')
  assertOrganizationAccess(site.member_role)

  const isPlatformAdmin = await hasPlatformEventPermission(event, env, { platform: ['access'] })
  if (isDemoOrg(site.organization_id) && !isPlatformAdmin) {
    return jsonResponse({ error: 'Demo site is read-only' }, { status: 403 })
  }

  try {
    const result = await deleteSiteLocale(db, site.organization_id, siteId, locale)
    return jsonResponse({ success: true, ...result })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to delete locale' }, { status: 400 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
