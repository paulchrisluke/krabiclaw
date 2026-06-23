// GET /api/ai/[siteId]/credits — returns the org's current AI credit balance
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getOrCreateCredits } from '~/server/utils/ai-credits'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await queryFirst<{ organization_id: string }>(db, `
    SELECT s.organization_id FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member m ON o.id = m.organizationId
    WHERE s.id = ? AND m.userId = ? LIMIT 1
  `, [siteId, session.user.id])
  if (!site) return jsonResponse({ error: 'Not found' }, { status: 404 })

  const credits = await getOrCreateCredits(db, site.organization_id)
  const total = credits.balance + credits.lifetime_used
  return jsonResponse({ balance: credits.balance, lifetime_used: credits.lifetime_used, total })
})
