import { defineHandler, HTTPError } from 'nitro'
import { getQuery } from 'nitro/h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getOrganizationBillingStatus } from '~/server/utils/billing'
import { resolveRequestedOrganization } from '~/server/utils/dashboard-context'
import { createStripeClient } from '~/server/utils/stripe-client'

export interface BillingInvoiceRow { id: string; number: string | null; created_at: string; status: string; total: number; currency: string; description: string; url: string | null }
export interface BillingPaymentMethodRow { id: string; brand: string; last4: string; exp_month: number; exp_year: number; default: boolean }

/**
 * What the business has paid the platform and the cards it pays with, as
 * Airbnb's Payments tab lists them. Stripe owns both; Better Auth owns the
 * customer and the subscription, and this reads their customer's records.
 */
export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) throw new HTTPError({ statusCode: 401, statusMessage: 'Authentication required' })
  const query = getQuery(event)
  const organization = await resolveRequestedOrganization(event, env.DB, session.user.id, { explicitOrganizationId: typeof query.organizationId === 'string' ? query.organizationId : null })
  if (!organization) throw new HTTPError({ statusCode: 404, statusMessage: 'No organization found' })
  const billing = await getOrganizationBillingStatus(env, env.DB, organization.id)
  if (!billing.stripeCustomerId) return jsonResponse({ configured: false, invoices: [] as BillingInvoiceRow[], payment_methods: [] as BillingPaymentMethodRow[] })
  if (!env.STRIPE_SECRET_KEY) throw new HTTPError({ statusCode: 503, statusMessage: 'Stripe is not configured' })
  const stripe = createStripeClient(env.STRIPE_SECRET_KEY)
  const [invoices, methods, customer] = await Promise.all([
    stripe.invoices.list({ customer: billing.stripeCustomerId, limit: 24 }),
    stripe.customers.listPaymentMethods(billing.stripeCustomerId, { limit: 20 }),
    stripe.customers.retrieve(billing.stripeCustomerId),
  ])
  if (customer.deleted) throw new HTTPError({ statusCode: 409, statusMessage: 'The billing customer was deleted at Stripe' })
  const defaultMethod = typeof customer.invoice_settings?.default_payment_method === 'string' ? customer.invoice_settings.default_payment_method : customer.invoice_settings?.default_payment_method?.id ?? null
  return jsonResponse({
    configured: true,
    invoices: invoices.data.filter(invoice => invoice.status !== 'draft' && invoice.status !== 'void').map((invoice): BillingInvoiceRow => ({
      id: invoice.id, number: invoice.number ?? null, created_at: new Date(invoice.created * 1000).toISOString(), status: invoice.status ?? 'open',
      total: invoice.total, currency: invoice.currency.toUpperCase(),
      description: (invoice.lines.data[0]?.description ?? invoice.description ?? 'Invoice').replace(/^1 × /, '').replace(/ \(at .*\)$/, ''),
      url: invoice.hosted_invoice_url ?? null,
    })),
    payment_methods: methods.data.flatMap((method): BillingPaymentMethodRow[] => method.card
      ? [{ id: method.id, brand: method.card.brand, last4: method.card.last4, exp_month: method.card.exp_month, exp_year: method.card.exp_year, default: method.id === defaultMethod }]
      : []),
  }, { headers: { 'cache-control': 'private, no-store' } })
})
