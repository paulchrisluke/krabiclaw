import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { listSiteLocales } from '~/server/utils/site-locales'

interface PublicLocale {
  code: string
  display_name: string | null
  is_source: boolean
  status: 'published' | 'disabled'
}

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID is required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const site = await queryFirst<{ id: string; organization_id: string }>(db, `
    SELECT id, organization_id
    FROM sites
    WHERE id = ? AND status = 'active'
    LIMIT 1
  `, [siteId])

  if (!site) return jsonResponse({ error: 'Site not found or inactive' }, { status: 404 })

  const { locales } = await listSiteLocales(db, site.organization_id, siteId)
  const publicLocales: PublicLocale[] = locales
    .filter(locale => locale.is_source || locale.status === 'published')
    .map(locale => ({
      code: locale.locale, display_name: locale.label, is_source: locale.is_source, status: locale.status, }))

  return jsonResponse({
    success: true, locales: publicLocales, })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
