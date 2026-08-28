import { defineHandler } from 'nitro'
import { getQuery, getRouterParam } from 'nitro/h3'

import { queryFirst } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { resolveLocalizedPublicRoute } from '~/server/utils/localization'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const path = getQuery(event).path
  if (!siteId || typeof path !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Site ID and localized path are required' })
  }
  const db = cloudflareEnv(event).db
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable' })
  const site = await queryFirst<{ organization_id: string }>(db, `
    SELECT organization_id FROM sites WHERE id = ? AND status = 'active' LIMIT 1
  `, [siteId])
  if (!site) throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  return { route: await resolveLocalizedPublicRoute(db, site.organization_id, siteId, path) }
})
