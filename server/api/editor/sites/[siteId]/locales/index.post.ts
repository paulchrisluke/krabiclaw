import { jsonResponse } from '~/server/utils/api-response'
import { normalizeLocale } from '~/server/utils/site-i18n'
import { upsertSiteLocale, validateSiteLocaleInput, type SiteLocaleInput } from '~/server/utils/site-locales'
import { isDemoOrg } from '~/server/utils/demo'
import { hasPlatformEventPermission } from '~/server/utils/platform-admin-users'
import { requireSiteAccess } from '~/server/utils/location-access'
import { assertOrganizationAccess } from '~/server/utils/member-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  let body: SiteLocaleInput
  try {
    body = validateSiteLocaleInput(await readBody(event) as SiteLocaleInput)
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Invalid is_source' }, { status: 400 })
  }
  const locale = normalizeLocale(body?.locale)
  if (!locale) return jsonResponse({ error: 'A valid locale is required' }, { status: 400 })
  body.locale = locale

  const { env, db, site } = await requireSiteAccess(event, siteId, 'context')
  assertOrganizationAccess(site.member_role)

  const isPlatformAdmin = await hasPlatformEventPermission(event, env, { platform: ['access'] })
  if (isDemoOrg(site.organization_id) && !isPlatformAdmin) {
    return jsonResponse({ error: 'Demo site is read-only' }, { status: 403 })
  }

  try {
    const savedLocale = await upsertSiteLocale(db, site.organization_id, siteId, body)
    return jsonResponse({ success: true, savedLocale })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to save locale' }, { status: 400 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam, readBody  } from 'nitro/h3';
