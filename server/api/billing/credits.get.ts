// GET /api/billing/credits — org AI credit balance + recent usage log
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getOrCreateCredits } from '~/server/utils/ai-credits'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const member = await db.prepare(
    'SELECT organizationId FROM member WHERE userId = ? LIMIT 1'
  ).bind(session.user.id).first()
  if (!member) return jsonResponse({ error: 'No Organization found' }, { status: 404 })

  const orgId = member.organizationId as string
  const credits = await getOrCreateCredits(db, orgId)

  const usageRows = await db.prepare(`
    SELECT u.action, u.model, u.input_tokens, u.output_tokens, u.credits_charged,
           u.created_at, s.brand_name as site_name
    FROM ai_usage_log u
    LEFT JOIN sites s ON u.site_id = s.id
    WHERE u.organization_id = ?
    ORDER BY u.created_at DESC
    LIMIT 50
  `).bind(orgId).all()

  const byAction = await db.prepare(`
    SELECT action, SUM(credits_charged) as total_credits, COUNT(*) as calls
    FROM ai_usage_log
    WHERE organization_id = ?
    GROUP BY action
    ORDER BY total_credits DESC
  `).bind(orgId).all()

  return jsonResponse({
    balance: credits.balance,
    lifetime_used: credits.lifetime_used,
    usage: usageRows.results ?? [],
    by_action: byAction.results ?? [],
  })
})
