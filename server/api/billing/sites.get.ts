// GET /api/billing/sites
// Lists every site under the caller's organization with its own subscription
// status, so the org billing page can show per-site plans under one Stripe customer.
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'

interface SiteBillingRow {
  id: string
  brand_name: string | null
  subdomain: string | null
  plan: string
  status: string | null
  current_period_end: string | null
  cancel_at_period_end: number | null
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const query = getQuery(event)
  let organizationId = query.organizationId as string

  if (!organizationId) {
    const sessionRecord = session.session as typeof session.session & { activeOrganizationId?: string }
    const activeOrganizationId = typeof sessionRecord.activeOrganizationId === 'string' ? sessionRecord.activeOrganizationId : ''
    const userOrg = await db.prepare(`
      SELECT o.id FROM organization o
      JOIN member m ON o.id = m.organizationId
      WHERE m.userId = ?
      ORDER BY CASE WHEN o.id = ? THEN 0 ELSE 1 END, o.createdAt ASC
      LIMIT 1
    `).bind(session.user.id, activeOrganizationId).first<{ id: string }>()
    if (!userOrg) return jsonResponse({ error: 'No organization found' }, { status: 404 })
    organizationId = userOrg.id
  }

  const membership = await db.prepare(`SELECT role FROM member WHERE organizationId = ? AND userId = ? LIMIT 1`)
    .bind(organizationId, session.user.id).first()
  if (!membership) return jsonResponse({ error: 'Access denied' }, { status: 403 })

  const rows = await db.prepare(`
    SELECT s.id, s.brand_name, s.subdomain,
           COALESCE(sb.plan, 'free') AS plan, sb.status, sb.current_period_end, sb.cancel_at_period_end
    FROM sites s
    LEFT JOIN site_billing sb ON sb.site_id = s.id
    WHERE s.organization_id = ?
    ORDER BY s.created_at ASC
  `).bind(organizationId).all<SiteBillingRow>()

  return jsonResponse({
    success: true,
    sites: (rows.results ?? []).map(row => ({
      siteId: row.id,
      brandName: row.brand_name,
      subdomain: row.subdomain,
      plan: row.plan,
      subscriptionStatus: row.status ?? undefined,
      currentPeriodEnd: row.current_period_end ?? undefined,
      cancelAtPeriodEnd: row.cancel_at_period_end ? Boolean(row.cancel_at_period_end) : undefined,
    })),
  })
})
