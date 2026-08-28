import { defineHandler } from 'nitro'
import { getQuery, getRouterParam } from 'nitro/h3'

import { queryFirst } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { assertSiteLanguageEntitlement } from '~/server/utils/localization'
import { getPublicTenantPageForPath } from '~/server/utils/public-tenant-pages'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locale = getRouterParam(event, 'locale')
  const path = getQuery(event).path
  if (!siteId || !locale || typeof path !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Site ID, locale, and path are required' })
  }
  const db = cloudflareEnv(event).db
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable' })
  const site = await queryFirst<{ organization_id: string }>(db, `
    SELECT organization_id FROM sites WHERE id = ? AND status = 'active' LIMIT 1
  `, [siteId])
  if (!site) throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  const entitlement = await assertSiteLanguageEntitlement(db, site.organization_id, siteId, locale)
  if (entitlement.source) throw createError({ statusCode: 404, statusMessage: 'English source routes are unprefixed' })
  const page = await getPublicTenantPageForPath(db, siteId, path, { locale })
  if (!page) throw createError({ statusCode: 404, statusMessage: 'Exact localized page was not found' })
  return { success: true as const, page }
})
