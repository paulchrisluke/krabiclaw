// GET /api/admin/organizations/[orgId]/billing — admin billing status for a single org
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'

export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, 'orgId')
  if (!orgId) return jsonResponse({ error: 'orgId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!isPlatformOwner(session.user.email, env)) return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })

  const billing = await db.prepare(`
    SELECT ob.stripe_customer_id, sb.stripe_subscription_id, sb.plan, sb.status,
           sb.current_period_end, sb.cancel_at_period_end,
           o.name AS org_name, o.slug AS org_slug
    FROM organization o
    LEFT JOIN organization_billing ob ON ob.organization_id = o.id
    LEFT JOIN sites s ON s.organization_id = o.id
    LEFT JOIN site_billing sb ON sb.site_id = s.id
    WHERE o.id = ?
    ORDER BY s.created_at ASC
    LIMIT 1
  `).bind(orgId).first<{
    stripe_customer_id: string | null
    stripe_subscription_id: string | null
    plan: string | null
    status: string | null
    current_period_end: string | null
    cancel_at_period_end: number | null
    org_name: string
    org_slug: string | null
  }>()

  if (!billing) return jsonResponse({ error: 'Organization not found' }, { status: 404 })

  // Pending transfer for any site owned by this org
  const transfer = await db.prepare(`
    SELECT r.id, r.site_id, r.to_email, r.invited_plan, r.invited_interval,
           r.invited_domain, r.requires_payment, r.created_at,
           s.brand_name
    FROM site_transfer_requests r
    JOIN sites s ON s.id = r.site_id
    WHERE r.from_organization_id = ? AND r.status = 'pending'
    ORDER BY r.created_at DESC
    LIMIT 1
  `).bind(orgId).first<{
    id: string
    site_id: string
    to_email: string
    invited_plan: string | null
    invited_interval: string | null
    invited_domain: string | null
    requires_payment: number
    created_at: string
    brand_name: string | null
  }>()

  // Check if the transfer recipient has already created an account
  let recipientReady = false
  if (transfer?.to_email) {
    const recipientUser = await db.prepare(`
      SELECT u.id FROM user u
      JOIN member m ON m.userId = u.id
      WHERE lower(u.email) = ? AND m.role = 'owner'
      LIMIT 1
    `).bind(transfer.to_email.toLowerCase()).first<{ id: string }>()
    recipientReady = Boolean(recipientUser)
  }

  return jsonResponse({
    org_name: billing.org_name,
    org_slug: billing.org_slug,
    stripe_customer_id: billing.stripe_customer_id,
    stripe_subscription_id: billing.stripe_subscription_id,
    plan: billing.plan,
    status: billing.status,
    current_period_end: billing.current_period_end,
    cancel_at_period_end: Boolean(billing.cancel_at_period_end),
    pending_transfer: transfer
      ? {
          id: transfer.id,
          site_id: transfer.site_id,
          to_email: transfer.to_email,
          invited_plan: transfer.invited_plan,
          invited_interval: transfer.invited_interval ?? 'month',
          invited_domain: transfer.invited_domain,
          requires_payment: Boolean(transfer.requires_payment),
          created_at: transfer.created_at,
          brand_name: transfer.brand_name,
          recipient_ready: recipientReady,
        }
      : null,
  })
})
