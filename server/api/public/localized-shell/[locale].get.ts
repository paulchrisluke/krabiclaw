import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

import { jsonResponse } from '~/server/utils/api-response'
import { loadPublicShell } from '~/server/utils/public-shell'
import { finalizeRequestMetrics } from '~/server/utils/request-metrics'

export default defineHandler(async (event) => {
  const organizationId = event.context.organizationId as string | null | undefined
  const locale = getRouterParam(event, 'locale')
  if (!organizationId || !locale) throw createError({ statusCode: 400, statusMessage: 'Organization ID and locale are required' })
  const payload = await loadPublicShell(event, organizationId, { locale })
  return jsonResponse(finalizeRequestMetrics(event, 'public-localized-shell', payload))
})
