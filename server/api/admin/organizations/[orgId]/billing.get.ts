// GET /api/admin/organizations/[orgId]/billing — admin billing status for a single org
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'
import { queryAll, queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, 'orgId')
  if (!orgId) return jsonResponse({ error: 'orgId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!isPlatformAdmin(session.user, env)) return jsonResponse({ error: 'Platform admin access required' }, { status: 403 })

  const sitesBilling = await queryAll<{
    site_id: string
    brand_name: string | null
    stripe_subscription_id: string | null
    plan: string | null
    status: string | null
    current_period_end: string | null
    cancel_at_period_end: number | null
    payment_method: string | null
    local_rate: number | null
    local_currency: string | null
  }>(db, `
    SELECT s.id AS site_id, s.brand_name, sb.stripe_subscription_id, sb.plan, sb.status,
           sb.current_period_end, sb.cancel_at_period_end,
           sb.payment_method, sb.local_rate, sb.local_currency
    FROM sites s
    LEFT JOIN site_billing sb ON sb.site_id = s.id
    WHERE s.organization_id = ?
  `, [orgId])

  const org = await queryFirst<{
    org_name: string
    org_slug: string | null
    stripe_customer_id: string | null
  }>(db, `
    SELECT o.name AS org_name, o.slug AS org_slug, ob.stripe_customer_id
    FROM organization o
    LEFT JOIN organization_billing ob ON ob.organization_id = o.id
    WHERE o.id = ?
    LIMIT 1
  `, [orgId])

  if (!org) return jsonResponse({ error: 'Organization not found' }, { status: 404 })

  // Pending transfer for any site owned by this org
  const transfer = await queryFirst<{
    id: string
    site_id: string
    to_email: string
    invited_plan: string | null
    invited_interval: string | null
    invited_domain: string | null
    requires_payment: number
    created_at: string
    brand_name: string | null
  }>(db, `
    SELECT r.id, r.site_id, r.to_email, r.invited_plan, r.invited_interval,
           r.invited_domain, r.requires_payment, r.created_at,
           s.brand_name
    FROM site_transfer_requests r
    JOIN sites s ON s.id = r.site_id
    WHERE r.from_organization_id = ? AND r.status = 'pending'
    ORDER BY r.created_at DESC
    LIMIT 1
  `, [orgId])

  // Check if the transfer recipient has already created an account
  let recipientReady = false
  if (transfer?.to_email) {
    const recipientUser = await queryFirst<{ id: string }>(db, `
      SELECT u.id FROM user u
      JOIN member m ON m.userId = u.id
      WHERE lower(u.email) = ? AND m.role = 'owner'
      LIMIT 1
    `, [transfer.to_email.toLowerCase()])
    recipientReady = Boolean(recipientUser)
  }

  const firstSiteBilling = (sitesBilling ?? [])[0]

  return jsonResponse({
    org_name: org.org_name,
    org_slug: org.org_slug,
    stripe_customer_id: org.stripe_customer_id,
    stripe_subscription_id: firstSiteBilling?.stripe_subscription_id ?? null,
    plan: firstSiteBilling?.plan ?? null,
    status: firstSiteBilling?.status ?? null,
    current_period_end: firstSiteBilling?.current_period_end ?? null,
    sites_billing: (sitesBilling ?? []).map(sb => ({
      site_id: sb.site_id,
      brand_name: sb.brand_name,
      stripe_subscription_id: sb.stripe_subscription_id,
      plan: sb.plan,
      status: sb.status,
      current_period_end: sb.current_period_end,
      cancel_at_period_end: Boolean(sb.cancel_at_period_end),
      payment_method: sb.payment_method ?? 'stripe',
      local_rate: sb.local_rate ?? null,
      local_currency: sb.local_currency ?? null,
    })),
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
