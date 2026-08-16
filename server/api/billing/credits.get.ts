// GET /api/billing/credits — organization recurring usage quota and ledger
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getOrganizationCreditsResource } from '~/server/utils/ai-credits'
import { resolveRequestedOrganization } from '~/server/utils/dashboard-context'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const organization = await resolveRequestedOrganization(event, db, session.user.id)
  if (!organization) return jsonResponse({ error: 'No Organization found' }, { status: 404 })

  const orgId = organization.id
  return jsonResponse(await getOrganizationCreditsResource(db, orgId))
})
import { defineHandler } from 'nitro';
