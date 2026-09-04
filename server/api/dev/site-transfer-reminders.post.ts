import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { timingSafeEqualText } from '~/server/utils/dev-route-auth'
import { processSiteTransferReminders } from '~/server/utils/site-transfer'
import { HTTPError, defineHandler  } from 'nitro';




export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const devMode = import.meta.dev
  const e2eOverride = env.E2E_ALLOW_DEV_ROUTES === 'true'
  if (!devMode && !e2eOverride) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Not found' })
  }

  if (!devMode && e2eOverride) {
    const expectedSecret = env.E2E_DEV_ROUTE_SECRET || ''
    const providedSecret = (event.req.headers.get('x-dev-route-secret')) || ''
    if (!expectedSecret || !providedSecret || !timingSafeEqualText(providedSecret, expectedSecret)) {
      throw new HTTPError({ statusCode: 403, statusMessage: 'Forbidden' })
    }
  }

  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const result = await processSiteTransferReminders(env, db, { force: true })
  return jsonResponse(result)
})
