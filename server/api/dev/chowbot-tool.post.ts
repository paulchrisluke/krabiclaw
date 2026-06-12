import { defineEventHandler, readBody } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { executeChowBotToolForTest, type ChowBotIncomingMessage } from '~/server/utils/chowbot-agent'
import { getSiteForMember } from '~/server/utils/chowbot-conversations'
import { assertDevRouteAllowed } from '~/server/utils/dev-route-auth'

export default defineEventHandler(async (event) => {
  assertDevRouteAllowed(event)

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = (await readBody(event).catch(() => ({}))) as {
    siteId?: string
    toolName?: string
    input?: Record<string, unknown>
    messages?: ChowBotIncomingMessage[]
    currentPage?: string
    locationId?: string | null
    forceSubdomainRegistrationFailure?: boolean
  }

  if (!body.siteId || !body.toolName) {
    return jsonResponse({ error: 'siteId and toolName are required' }, { status: 400 })
  }

  const site = await getSiteForMember(db, body.siteId, session.user.id, ['owner', 'admin', 'editor'])
  if (!site) {
    return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
  }

  const result = await executeChowBotToolForTest(body.toolName, body.input ?? {}, {
    db,
    env,
    orgId: site.organization_id,
    siteId: body.siteId,
    userId: session.user.id,
    userRole: site.role,
    agentMessages: (body.messages ?? []) as Array<{ role: 'user' | 'assistant'; content: string }>,
    locationId: body.locationId ?? null,
    channel: 'dashboard',
    forceSubdomainRegistrationFailure: body.forceSubdomainRegistrationFailure === true,
  })

  return jsonResponse({ result }, { status: 200 })
})
