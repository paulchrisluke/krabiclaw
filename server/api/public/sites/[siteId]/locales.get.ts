import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { listSiteLocales, type SiteLocale } from '~/server/utils/site-locales'

interface PublicLocale {
  code: string
  display_name: string | null
  is_source: boolean
  status: 'draft' | 'published' | 'disabled'
  fallback_enabled: boolean
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID is required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const site = await db.prepare(`
    SELECT id, organization_id
    FROM sites
    WHERE id = ? AND status = 'active'
    LIMIT 1
  `).bind(siteId).first<{ id: string; organization_id: string }>()

  if (!site) return jsonResponse({ error: 'Site not found or inactive' }, { status: 404 })

  const { source_locale, locales } = await listSiteLocales(db, site.organization_id, siteId)
  const publicLocales: PublicLocale[] = locales
    .filter(locale => locale.is_source || locale.status === 'published')
    .map(locale => ({
      code: locale.locale,
      display_name: locale.label,
      is_source: locale.is_source,
      status: locale.status,
      fallback_enabled: locale.fallback_enabled,
    }))

  return jsonResponse({
    success: true,
    source_locale,
    locales: publicLocales,
  })
})
