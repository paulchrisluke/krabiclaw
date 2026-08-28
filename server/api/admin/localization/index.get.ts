import { defineHandler } from 'nitro'

import { cloudflareEnv } from '~/server/utils/api-response'
import { requirePlatformEventPermission } from '~/server/utils/platform-admin-users'
import { listPlatformLocaleCatalogs } from '~/server/utils/localization'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  if (!env.DB) throw createError({ statusCode: 503, statusMessage: 'Database unavailable' })
  await requirePlatformEventPermission(event, env, { platform: ['content'] })
  return { catalogs: await listPlatformLocaleCatalogs(env.DB) }
})
