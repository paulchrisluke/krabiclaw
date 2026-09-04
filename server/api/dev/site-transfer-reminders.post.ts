import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { assertDevRouteAllowed } from '~/server/utils/dev-route-auth'
import { processSiteTransferReminders } from '~/server/utils/site-transfer'
import { defineHandler } from 'nitro'

export default defineHandler(async (event) => {
  assertDevRouteAllowed(event)
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const result = await processSiteTransferReminders(env, db, { force: true })
  return jsonResponse(result)
})
