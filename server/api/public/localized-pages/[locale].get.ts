import { defineHandler } from 'nitro'
import { getQuery, getRouterParam } from 'nitro/h3'

import { cloudflareEnv } from '~/server/utils/api-response'
import { getPublicTenantPageForPath } from '~/server/utils/public-tenant-pages'

export default defineHandler(async (event) => {
  const organizationId = event.context.organizationId as string | null | undefined
  const locale = getRouterParam(event, 'locale')
  const path = getQuery(event).path
  if (!organizationId || !locale || typeof path !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Site ID, locale, and path are required' })
  }
  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable' })
  const page = await getPublicTenantPageForPath(env, db, organizationId, path, { locale })
  if (!page) throw createError({ statusCode: 404, statusMessage: 'Localized page was not found' })
  return { success: true as const, page }
})
