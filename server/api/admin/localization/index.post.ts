import { defineHandler } from 'nitro'

import { cloudflareEnv, readRequiredBody } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { requirePlatformEventPermission } from '~/server/utils/platform-admin-users'
import { registerPlatformLocaleCatalog } from '~/server/utils/localization'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  if (!env.DB) throw createError({ statusCode: 503, statusMessage: 'Database unavailable' })
  await requirePlatformEventPermission(event, env, { platform: ['content'] })
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  const body = await readRequiredBody<{ locale?: unknown; label?: unknown; direction?: unknown }>(event)
  return { catalog: await registerPlatformLocaleCatalog(env.DB, {
    locale: body.locale,
    label: body.label,
    direction: body.direction,
  }, session.user.id) }
})
