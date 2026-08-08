// GET /api/billing/sites
// Lists every site under the caller's organization. Billing access is owned by
// the organization subscription; site IDs remain checkout context only.
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { resolveRequestedOrganization } from '~/server/utils/dashboard-context'
import { getOrganizationBillingStatus } from '~/server/utils/billing'
import { mapOrganizationSites, type OrganizationSiteRow } from '~/server/utils/billing-site-resource'
import { queryAll } from '~/server/db'

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
  const billingStatus = await getOrganizationBillingStatus(env, db, organizationId)

  const rows = await queryAll<OrganizationSiteRow>(db, `
    SELECT s.id, s.brand_name, s.subdomain
    FROM sites s
    WHERE s.organization_id = ?
    ORDER BY s.created_at ASC
  `, [organizationId])

  return jsonResponse({
    success: true,
    sites: mapOrganizationSites(rows ?? [], billingStatus),
  })
})
