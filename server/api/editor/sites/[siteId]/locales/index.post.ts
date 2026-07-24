import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { normalizeLocale } from '~/server/utils/site-i18n'
import { upsertSiteLocale, type SiteLocaleInput } from '~/server/utils/site-locales'
import { isDemoOrg } from '~/server/utils/demo'
import { queryFirst } from '~/server/db'
import { hasPlatformEventPermission } from '~/server/utils/platform-admin-users'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const body = await readBody(event) as SiteLocaleInput
  const locale = normalizeLocale(body?.locale)
  if (!locale) return jsonResponse({ error: 'A valid locale is required' }, { status: 400 })
  body.locale = locale

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await queryFirst<{ id: string; organization_id: string }>(db, `
    SELECT s.id, s.organization_id FROM sites s
    JOIN member om ON s.organization_id = om.organizationId
    WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin')
    LIMIT 1
  `, [siteId, session.user.id])

  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

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
