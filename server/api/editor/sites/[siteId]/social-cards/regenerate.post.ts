import { jsonResponse } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { regenerateSiteSocialCards } from '~/server/utils/social-card'
import { getCloudflareWaitUntil } from '~/server/utils/mcp-route-helpers'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })
  const { env, db, session } = await requireSiteAccess(event, siteId)

  // The regeneration sweep iterates every location, product, experience, post,
  // offer, review, and tenant page for a site — each refresh runs multiple DB
  // queries, a render, and an upload. Awaiting that sweep inline would risk
  // Worker CPU and subrequest limits on larger sites, so it runs off the
  // request path via waitUntil when available and returns promptly. Errors are
  // logged server-side; the UI only needs the acknowledgment.
  const sweep = regenerateSiteSocialCards({ db, env, siteId, actorId: session.user.id }).catch((error: unknown) => {
    console.error('[social-card] site regeneration failed', { siteId, error: error instanceof Error ? error.message : String(error) })
  })
  const waitUntil = getCloudflareWaitUntil(event)
  if (waitUntil) {
    waitUntil(sweep)
    return jsonResponse({ backgrounded: true, siteId })
  }
  await sweep
  return jsonResponse({ backgrounded: false, siteId })
})
