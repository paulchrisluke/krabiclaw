// GET /api/billing/sites
// Lists every site under the caller's organization with its own subscription
// status, so the org billing page can show per-site plans under one Stripe customer.
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { resolveRequestedOrganization } from '~/server/utils/dashboard-context'
import { queryAll } from '~/server/db'

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
  const organization = await resolveRequestedOrganization(event, db, session.user.id, {
    explicitOrganizationId: typeof query.organizationId === 'string' ? query.organizationId : null,
  })
  if (!organization) return jsonResponse({ error: 'No organization found' }, { status: 404 })
  const organizationId = organization.id

  const rows = await queryAll<SiteBillingRow>(db, `
    SELECT s.id, s.brand_name, s.subdomain,
           COALESCE(sb.plan, 'free') AS plan, sb.status, sb.current_period_end, sb.cancel_at_period_end
    FROM sites s
    LEFT JOIN site_billing sb ON sb.site_id = s.id
    WHERE s.organization_id = ?
    ORDER BY s.created_at ASC
  `, [organizationId])

  return jsonResponse({
    success: true,
    sites: (rows ?? []).map(row => ({
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
