import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

import { cloudflareEnv } from '~/server/utils/api-response'
import { requirePlatformEventPermission } from '~/server/utils/platform-admin-users'
import { deletePlatformLocaleCatalog } from '~/server/utils/localization'

export default defineHandler(async (event) => {
  const locale = getRouterParam(event, 'locale')
  const env = cloudflareEnv(event)
  if (!env.DB) throw createError({ statusCode: 503, statusMessage: 'Database unavailable' })
  await requirePlatformEventPermission(event, env, { platform: ['content'] })
  return await deletePlatformLocaleCatalog(env.DB, locale)
})
