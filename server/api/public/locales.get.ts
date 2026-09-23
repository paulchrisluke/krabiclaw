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
  const organizationId = event.context.organizationId as string | null | undefined
  if (!organizationId) return jsonResponse({ error: 'Unknown tenant' }, { status: 404 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const site = await queryFirst<{ id: string }>(db, `
    SELECT id
    FROM organization
    WHERE id = ? AND status = 'active'
    LIMIT 1
  `, [organizationId])

  if (!site) return jsonResponse({ error: 'Site not found or inactive' }, { status: 404 })

  const { locales } = await listSiteLocales(db, site.id)
  const publicLocales: PublicLocale[] = locales
    .filter(locale => locale.is_source || locale.status === 'published')
    .map(locale => ({
      code: locale.locale, display_name: locale.label, is_source: locale.is_source, status: locale.status, }))

  return jsonResponse({
    success: true, locales: publicLocales, })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
