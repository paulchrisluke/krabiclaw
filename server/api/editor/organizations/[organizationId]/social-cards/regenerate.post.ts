import { jsonResponse, readStrictBody } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { regenerateSiteSocialCards } from '~/server/utils/social-card'
import { summarizeSocialCardRefreshResults } from '~/utils/social-card-refresh'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Organization ID required' }, { status: 400 })
  const { env, db, session } = await requireSiteAccess(event, organizationId)
  const { after } = await readStrictBody<{ after?: string | null }>(event, { after: 'nullable-string' })
  const { results, next_cursor } = await regenerateSiteSocialCards({ db, env, organizationId, actorId: session.user.id, after })
  return jsonResponse({ results, next_cursor, summary: summarizeSocialCardRefreshResults(results) })
})
