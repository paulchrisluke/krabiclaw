import { defineHandler } from 'nitro'
import { getQuery, getRouterParam } from 'nitro/h3'

import { queryFirst } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { resolveLocalizedPublicRoute } from '~/server/utils/localization'

export default defineHandler(async (event) => {
  const organizationId = event.context.organizationId as string | null | undefined
  const path = getQuery(event).path
  if (!organizationId || typeof path !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Site ID and localized path are required' })
  }
  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable' })
  const site = await queryFirst<{ id: string }>(db, `
    SELECT organization_id FROM organization WHERE id = ? AND status = 'active' LIMIT 1
  `, [organizationId])
  if (!site) throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  return { route: await resolveLocalizedPublicRoute(env, db, organizationId, path) }
})
