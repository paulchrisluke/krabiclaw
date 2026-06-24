import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { normalizeLocale } from '~/server/utils/site-i18n'
import { upsertSiteLocale, type SiteLocaleInput } from '~/server/utils/site-locales'
import { isDemoOrg } from '~/server/utils/demo'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const localeParam = getRouterParam(event, 'locale')
  const locale = normalizeLocale(localeParam)
  if (!siteId || !locale) return jsonResponse({ error: 'Site ID and locale are required' }, { status: 400 })

  const body = await readBody(event) as Omit<SiteLocaleInput, 'locale'>
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

  const isPlatformAdmin = (session.user as { role?: string }).role === 'admin'
  if (isDemoOrg(site.organization_id) && !isPlatformAdmin) {
    return jsonResponse({ error: 'Demo site is read-only' }, { status: 403 })
  }

  try {
    const saved = await upsertSiteLocale(db, site.organization_id, siteId, { ...body, locale })
    return jsonResponse({ success: true, locale: saved })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to update locale' }, { status: 400 })
  }
})
