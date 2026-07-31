import type { H3Event } from 'h3'
import type Stripe from 'stripe'
import { queryAll, queryFirst } from '~/server/db'
import { getOrCreateCredits } from '~/server/utils/ai-credits'
import { getOrganizationBillingStatus, getStripe, requireBillingAccess } from '~/server/utils/billing'
import { getDashboardContext } from '~/server/utils/dashboard-context'

interface SiteBillingRow {
  id: string
  brand_name: string | null
  subdomain: string | null
  plan: string
  status: string | null
  current_period_end: string | null
  cancel_at_period_end: number | null
}

export async function loadDashboardBillingResource(event: H3Event) {
  const { env, db, userId, organization } = await getDashboardContext(event, { requireSite: false })
  await requireBillingAccess(env, db, organization.id, userId)
  const [billingStatus, credits, usage, byAction, siteRows, organizationBilling] = await Promise.all([
    getOrganizationBillingStatus(env, db, organization.id),
    getOrCreateCredits(db, organization.id),
    queryAll(db, `
      SELECT u.action, u.model, u.input_tokens, u.output_tokens, u.credits_charged,
             u.created_at, s.brand_name AS site_name
        FROM ai_usage_log u
        LEFT JOIN sites s ON u.site_id = s.id
       WHERE u.organization_id = ?
       ORDER BY u.created_at DESC
       LIMIT 50
    `, [organization.id]),
    queryAll(db, `
      SELECT action, SUM(credits_charged) AS total_credits, COUNT(*) AS calls
        FROM ai_usage_log
       WHERE organization_id = ?
       GROUP BY action
       ORDER BY total_credits DESC
    `, [organization.id]),
    queryAll<SiteBillingRow>(db, `
      SELECT s.id, s.brand_name, s.subdomain, COALESCE(sb.plan, 'free') AS plan,
             sb.status, sb.current_period_end, sb.cancel_at_period_end
        FROM sites s
        LEFT JOIN site_billing sb ON sb.site_id = s.id
       WHERE s.organization_id = ?
       ORDER BY s.created_at ASC
    `, [organization.id]),
    queryFirst<{ stripe_customer_id: string | null }>(
      db,
      'SELECT stripe_customer_id FROM organization_billing WHERE organization_id = ? LIMIT 1',
      [organization.id],
    ),
  ])

  let card: { brand: string; last4: string; exp_month: number; exp_year: number } | null = null
  if (organizationBilling?.stripe_customer_id) {
    const stripe = getStripe(env)
    const customer = await stripe.customers.retrieve(organizationBilling.stripe_customer_id, {
      expand: ['invoice_settings.default_payment_method'],
    }) as Stripe.Customer
    const paymentMethod = customer.invoice_settings?.default_payment_method
    if (paymentMethod && typeof paymentMethod !== 'string' && paymentMethod.type === 'card' && paymentMethod.card) {
      card = {
        brand: paymentMethod.card.brand,
        last4: paymentMethod.card.last4,
        exp_month: paymentMethod.card.exp_month,
        exp_year: paymentMethod.card.exp_year,
      }
    }
  }

  return {
    billing: {
      success: true as const,
      billing: { ...billingStatus, organizationId: organization.id },
      userRole: organization.role,
    },
    credits: {
      balance: credits.balance,
      lifetime_used: credits.lifetime_used,
      usage,
      by_action: byAction,
    },
    paymentMethod: { card },
    sites: {
      success: true as const,
      sites: siteRows.map(row => ({
        siteId: row.id,
        brandName: row.brand_name,
        subdomain: row.subdomain,
        plan: row.plan,
        subscriptionStatus: row.status ?? undefined,
        currentPeriodEnd: row.current_period_end ?? undefined,
        cancelAtPeriodEnd: row.cancel_at_period_end ? Boolean(row.cancel_at_period_end) : undefined,
      })),
    },
  }
}
