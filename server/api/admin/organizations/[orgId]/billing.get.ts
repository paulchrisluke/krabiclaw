// GET /api/admin/organizations/[orgId]/billing — admin billing status for a single org
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'
import { queryAll, queryFirst } from '~/server/db'
import { resolveTransferRecipientOrganizationsForEvent } from '~/server/utils/site-transfer-recipient'
import { createAuth } from '~/server/utils/auth'
import { getOrgAdapter } from 'better-auth/plugins'

export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, 'orgId')
  if (!orgId) return jsonResponse({ error: 'orgId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const permissionDenied = await platformPermissionJsonResponse(event, env, { platform: ['billing'] })
  if (permissionDenied) return permissionDenied

  const sitesBilling = await queryAll<{
    site_id: string
    brand_name: string | null
    stripe_subscription_id: string | null
    plan: string | null
    status: string | null
    current_period_end: string | null
    cancel_at_period_end: number | null
  }>(db, `
    SELECT s.id AS site_id, s.brand_name, ob.stripe_subscription_id, sb.plan, sb.status,
           sb.current_period_end, sb.cancel_at_period_end
    FROM sites s
    LEFT JOIN organization_billing ob ON ob.organization_id = s.organization_id
    LEFT JOIN site_billing sb ON sb.site_id = s.id
    WHERE s.organization_id = ?
  `, [orgId])

  const auth = createAuth(env)
  const authContext = await auth.$context
  const organizationAdapter = getOrgAdapter(authContext as Parameters<typeof getOrgAdapter>[0], {})
  const organization = await organizationAdapter.findOrganizationById(orgId)

  if (!organization) return jsonResponse({ error: 'Organization not found' }, { status: 404 })

  const billing = await queryFirst<{
    stripe_customer_id: string | null
    stripe_subscription_id: string | null
    plan: string | null
    status: string | null
    current_period_end: string | null
    cancel_at_period_end: number | null
  }>(db, `
    SELECT stripe_customer_id, stripe_subscription_id, plan, status,
           current_period_end, cancel_at_period_end
    FROM organization_billing
    WHERE organization_id = ?
    LIMIT 1
  `, [orgId])

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
    WHERE r.from_organization_id = ?
      AND (
        r.status = 'pending'
        OR (r.status = 'accepted' AND r.requires_payment = 1 AND r.payment_completed_at IS NULL)
      )
    ORDER BY r.created_at DESC
    LIMIT 1
  `, [orgId])

  const recipientResolution = transfer
    ? await resolveTransferRecipientOrganizationsForEvent(event, env, transfer.to_email)
    : null

  return jsonResponse({
    org_name: organization.name,
    org_slug: organization.slug,
    stripe_customer_id: billing?.stripe_customer_id ?? null,
    stripe_subscription_id: billing?.stripe_subscription_id ?? null,
    plan: billing?.plan ?? null,
    status: billing?.status ?? null,
    current_period_end: billing?.current_period_end ?? null,
    cancel_at_period_end: Boolean(billing?.cancel_at_period_end),
    sites_billing: (sitesBilling ?? []).map(sb => ({
      site_id: sb.site_id,
      brand_name: sb.brand_name,
      stripe_subscription_id: sb.stripe_subscription_id,
      plan: sb.plan,
      status: sb.status,
      current_period_end: sb.current_period_end,
      cancel_at_period_end: Boolean(sb.cancel_at_period_end),
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
          recipient_ready: recipientResolution?.status === 'ready',
          recipient_resolution: recipientResolution?.status ?? 'missing',
          recipient_organizations: recipientResolution?.organizations ?? [],
        }
      : null,
  })
})
