import type { H3Event } from 'h3'
import type Stripe from 'stripe'
import { HTTPError } from 'nitro'
import { execute, queryFirst, type DbClient } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession, type CloudflareEnv } from '~/server/utils/auth'
import { getOrganizationBillingStatus } from '~/server/utils/billing'
import { resolveRequestedOrganization } from '~/server/utils/dashboard-context'
import { createStripeClient } from '~/server/utils/stripe-client'

/**
 * Whose cards the Payments page shows. Better Auth's Stripe plugin keeps one
 * customer per organization (its subscription) and one per user; the Payments
 * page reads and writes cards on exactly that customer, and never a second one.
 * A business is managed by its owners and admins; an account by itself.
 */
export async function resolveBillingCustomer(event: H3Event, organizationId: string | null, options: { create?: boolean } = {}) {
  const env = cloudflareEnv(event)
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) throw new HTTPError({ statusCode: 401, statusMessage: 'Authentication required' })
  if (!env.STRIPE_SECRET_KEY) throw new HTTPError({ statusCode: 503, statusMessage: 'Stripe is not configured' })
  const stripe = createStripeClient(env.STRIPE_SECRET_KEY)
  if (organizationId) {
    const organization = await resolveRequestedOrganization(event, env.DB, session.user.id, { explicitOrganizationId: organizationId })
    if (!organization) throw new HTTPError({ statusCode: 404, statusMessage: 'No organization found' })
    if (organization.role !== 'owner' && organization.role !== 'admin') throw new HTTPError({ statusCode: 403, statusMessage: 'Only owners and admins manage billing' })
    const billing = await getOrganizationBillingStatus(env, env.DB, organization.id)
    return { stripe, customerId: billing.stripeCustomerId ?? null, label: organization.name }
  }
  const row = await queryFirst<{ stripeCustomerId: string | null; email: string; name: string | null }>(env.DB, 'SELECT "stripeCustomerId", email, name FROM user WHERE id = ?', [session.user.id])
  if (!row) throw new HTTPError({ statusCode: 404, statusMessage: 'Account not found' })
  if (row.stripeCustomerId || !options.create) return { stripe, customerId: row.stripeCustomerId, label: row.name ?? row.email }
  // The plugin creates a user's customer on sign-up or first subscription; an account that has neither gets the same customer here, in the plugin's column.
  const customer = await stripe.customers.create({ email: row.email, name: row.name ?? undefined, metadata: { userId: session.user.id } })
  await execute(env.DB, 'UPDATE user SET "stripeCustomerId" = ? WHERE id = ? AND "stripeCustomerId" IS NULL', [customer.id, session.user.id])
  const settled = await queryFirst<{ stripeCustomerId: string }>(env.DB, 'SELECT "stripeCustomerId" FROM user WHERE id = ?', [session.user.id])
  if (!settled?.stripeCustomerId) throw new Error('The account customer was not recorded')
  if (settled.stripeCustomerId !== customer.id) await stripe.customers.del(customer.id)
  return { stripe, customerId: settled.stripeCustomerId, label: row.name ?? row.email }
}

export interface PaymentMethodRow { id: string; brand: string; last4: string; exp_month: number; exp_year: number; default: boolean }

/** The customer's cards, the default first, as Stripe holds them. */
export async function listCustomerCards(stripe: Stripe, customerId: string, options: Stripe.RequestOptions = {}): Promise<PaymentMethodRow[]> {
  const [methods, customer] = await Promise.all([
    stripe.customers.listPaymentMethods(customerId, { type: 'card', limit: 20 }, options),
    stripe.customers.retrieve(customerId, {}, options),
  ])
  if (customer.deleted) throw new HTTPError({ statusCode: 409, statusMessage: 'The billing customer was deleted at Stripe' })
  const fallback = customer.invoice_settings?.default_payment_method
  const defaultId = typeof fallback === 'string' ? fallback : fallback?.id ?? null
  return methods.data.flatMap((method): PaymentMethodRow[] => method.card
    ? [{ id: method.id, brand: method.card.brand, last4: method.card.last4, exp_month: method.card.exp_month, exp_year: method.card.exp_year, default: method.id === defaultId }]
    : [])
    .sort((a, b) => Number(b.default) - Number(a.default))
}

/**
 * The buyer's Customer on a business's connected account, carrying copies of
 * the cards they keep on the platform, so that business's Checkout offers them.
 * Stripe's cloning is the documented way to pay a connected account with a
 * platform card; the only state kept here is which connected customer is theirs.
 */
export async function connectedCustomerWithSavedCards(db: DbClient, stripe: Stripe, env: CloudflareEnv, userId: string, stripeAccountId: string, livemode: boolean): Promise<{ customerId: string; savedCards: number } | null> {
  const user = await queryFirst<{ stripeCustomerId: string | null; email: string; name: string | null }>(db, 'SELECT "stripeCustomerId", email, name FROM user WHERE id = ?', [userId])
  if (!user?.stripeCustomerId) return null
  const platform = createStripeClient(env.STRIPE_SECRET_KEY!)
  const cards = await platform.customers.listPaymentMethods(user.stripeCustomerId, { type: 'card', limit: 20 })
  if (!cards.data.length) return null
  const connected = { stripeAccount: stripeAccountId }
  let mapping = await queryFirst<{ stripe_customer_id: string }>(db, 'SELECT stripe_customer_id FROM stripe_connected_customers WHERE user_id=? AND stripe_account_id=? AND livemode=?', [userId, stripeAccountId, Number(livemode)])
  if (!mapping) {
    const created = await stripe.customers.create({ email: user.email, name: user.name ?? undefined, metadata: { krabiclaw_user_id: userId } }, connected)
    await execute(db, 'INSERT INTO stripe_connected_customers(user_id,stripe_account_id,livemode,stripe_customer_id,created_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,stripe_account_id,livemode) DO NOTHING', [userId, stripeAccountId, Number(livemode), created.id, new Date().toISOString()])
    mapping = await queryFirst<{ stripe_customer_id: string }>(db, 'SELECT stripe_customer_id FROM stripe_connected_customers WHERE user_id=? AND stripe_account_id=? AND livemode=?', [userId, stripeAccountId, Number(livemode)])
    if (!mapping) throw new Error('The connected customer was not recorded')
    if (mapping.stripe_customer_id !== created.id) await stripe.customers.del(created.id, connected)
  }
  // Checkout offers a saved card only when Stripe may redisplay it, so every copy says so.
  const present = await stripe.customers.listPaymentMethods(mapping.stripe_customer_id, { type: 'card', limit: 50 }, connected)
  const fingerprints = new Set(present.data.map(method => method.card?.fingerprint).filter(Boolean))
  for (const method of present.data) if (method.allow_redisplay !== 'always') await stripe.paymentMethods.update(method.id, { allow_redisplay: 'always' }, connected)
  for (const card of cards.data) {
    if (!card.card?.fingerprint || fingerprints.has(card.card.fingerprint)) continue
    const copy = await stripe.paymentMethods.create({ customer: user.stripeCustomerId, payment_method: card.id, allow_redisplay: 'always' }, connected)
    await stripe.paymentMethods.attach(copy.id, { customer: mapping.stripe_customer_id }, connected)
    fingerprints.add(card.card.fingerprint)
  }
  return { customerId: mapping.stripe_customer_id, savedCards: fingerprints.size }
}
