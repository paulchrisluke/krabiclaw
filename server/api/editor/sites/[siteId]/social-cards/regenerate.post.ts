import { jsonResponse } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { regenerateSiteSocialCards } from '~/server/utils/social-card'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })
  const { env, db, session } = await requireSiteAccess(event, siteId)
  const results = await regenerateSiteSocialCards({ db, env, siteId, actorId: session.user.id })
  return jsonResponse({ results })
})
