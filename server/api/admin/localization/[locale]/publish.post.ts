import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

import { cloudflareEnv, readRequiredBody } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { requirePlatformEventPermission } from '~/server/utils/platform-admin-users'
import { publishPlatformLocaleCatalog } from '~/server/utils/localization'

export default defineHandler(async (event) => {
  const locale = getRouterParam(event, 'locale')
  const env = cloudflareEnv(event)
  if (!env.DB) throw createError({ statusCode: 503, statusMessage: 'Database unavailable' })
  await requirePlatformEventPermission(event, env, { platform: ['content'] })
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  const body = await readRequiredBody<{ messages?: unknown }>(event)
  return { catalog: await publishPlatformLocaleCatalog(env.DB, locale, body.messages, session.user.id) }
})
