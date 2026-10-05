import { defineHandler, HTTPError } from 'nitro'
import { getQuery } from 'nitro/h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getOrganizationBillingStatus } from '~/server/utils/billing'
import { resolveRequestedOrganization } from '~/server/utils/dashboard-context'
import { createStripeClient } from '~/server/utils/stripe-client'

export interface BillingInvoiceRow { id: string; number: string | null; created_at: string; status: string; total: number; currency: string; description: string; url: string | null }

/**
 * What the business has paid the platform, as Airbnb's "Your payments" lists
 * it. Stripe owns the invoices; Better Auth owns the customer and the subscription.
 */
export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) throw new HTTPError({ statusCode: 401, statusMessage: 'Authentication required' })
  const query = getQuery(event)
  const organization = await resolveRequestedOrganization(event, env.DB, session.user.id, { explicitOrganizationId: typeof query.organizationId === 'string' ? query.organizationId : null })
  if (!organization) throw new HTTPError({ statusCode: 404, statusMessage: 'No organization found' })
  const billing = await getOrganizationBillingStatus(env, env.DB, organization.id)
  if (!billing.stripeCustomerId) return jsonResponse({ configured: false, invoices: [] as BillingInvoiceRow[] })
  if (!env.STRIPE_SECRET_KEY) throw new HTTPError({ statusCode: 503, statusMessage: 'Stripe is not configured' })
  const stripe = createStripeClient(env.STRIPE_SECRET_KEY)
  const invoices = await stripe.invoices.list({ customer: billing.stripeCustomerId, limit: 24 })
  return jsonResponse({
    configured: true,
    invoices: invoices.data.filter(invoice => invoice.status !== 'draft' && invoice.status !== 'void').map((invoice): BillingInvoiceRow => ({
      id: invoice.id, number: invoice.number ?? null, created_at: new Date(invoice.created * 1000).toISOString(), status: invoice.status ?? 'open',
      total: invoice.total, currency: invoice.currency.toUpperCase(),
      description: (invoice.lines.data[0]?.description ?? invoice.description ?? 'Invoice').replace(/^1 × /, '').replace(/ \(at .*\)$/, ''),
      url: invoice.hosted_invoice_url ?? null,
    })),
  }, { headers: { 'cache-control': 'private, no-store' } })
})
