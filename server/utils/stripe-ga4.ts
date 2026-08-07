import type Stripe from 'stripe'
import type { DbClient } from '~/server/db'
import { queryFirst } from '~/server/db'
import type { CloudflareEnv } from '~/server/utils/auth'
import { invoiceSubscriptionId } from '~/server/utils/better-auth-stripe'
import {
  invoiceLineIsProration,
  invoiceLineIsSubscription,
  invoiceLinePrice,
  invoiceLineQuantity,
  invoiceLineSubscriptionId,
  invoiceLineUnitAmount,
  loadStripeInvoiceLines,
  type StripeInvoiceLine,
} from '~/server/utils/stripe-invoice-lines'
import {
  consumeStripeGa4Intent,
  findConsumedStripeGa4CancellationIntent,
  findPendingInitialStripeGa4Intent,
  findPendingStripeGa4Intent,
  getPersistedStripeGa4Attribution,
  markStripeGa4IntentLifecycleSent,
  persistStripeGa4Attribution,
  attachStripeGa4IntentToSubscription,
  type StripeGa4Intent,
} from '~/server/utils/stripe-ga4-intents'
import { sendGa4Event, type Ga4Event, type Ga4Item } from '~/server/utils/ga4-measurement-protocol'
import type { StripeGa4PurchaseType } from '~/shared/stripe-ga4'

const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg',
  'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
])
const THREE_DECIMAL_CURRENCIES = new Set(['bhd', 'jod', 'kwd', 'omr', 'tnd'])

type StripeInvoiceWithSubscription = Stripe.Invoice & {
  subscription?: string | { id: string } | null
}

interface StripeGa4PurchaseEventInput {
  invoiceId: string
  amountPaid: number
  currency: string
  purchaseType: StripeGa4PurchaseType
  subscriptionId: string
  lines: StripeInvoiceLine[]
  fallbackItems?: Ga4Item[]
}

export interface StripeGa4RefundEventInput {
  invoiceId: string
  refundId: string
  amount: number
  currency: string
  subscriptionId: string
  lines: StripeInvoiceLine[]
  purchaseType?: StripeGa4PurchaseType
}

function currencyDivisor(currency: string): number {
  const normalized = currency.toLowerCase()
  if (ZERO_DECIMAL_CURRENCIES.has(normalized)) return 1
  if (THREE_DECIMAL_CURRENCIES.has(normalized)) return 1000
  return 100
}

export function stripeMinorToMajor(amount: number, currency: string): number {
  return amount / currencyDivisor(currency)
}

function stripeMetadataValue(metadata: Stripe.Metadata | null | undefined, ...keys: string[]): string | null {
  if (!metadata) return null
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function stripeMetadataNumber(metadata: Stripe.Metadata | null | undefined, ...keys: string[]): number | null {
  const value = stripeMetadataValue(metadata, ...keys)
  if (!value) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function customerIdValue(customer: Stripe.Subscription['customer'] | Stripe.Invoice['customer']): string | null {
  if (!customer) return null
  return typeof customer === 'string' ? customer : customer.id
}

function itemFromInvoiceLine(line: StripeInvoiceLine, currency: string): Ga4Item | null {
  const price = invoiceLinePrice(line)
  const priceObject = typeof price === 'string' || !price ? null : price
  const product = priceObject?.product
  const productName = product && typeof product !== 'string' && !product.deleted ? product.name : null
  const itemId = priceObject?.id ?? line.id
  const invoiceUnitAmount = invoiceLineUnitAmount(line)
  const unitAmount = invoiceUnitAmount === null ? null : stripeMinorToMajor(invoiceUnitAmount, currency)
  const resolvedUnitAmount = unitAmount
    ?? (typeof priceObject?.unit_amount === 'number'
      ? stripeMinorToMajor(priceObject.unit_amount, currency)
      : null)
  const quantity = invoiceLineQuantity(line)
  if (!itemId || !resolvedUnitAmount || resolvedUnitAmount <= 0) return null

  const recurring = priceObject?.recurring
  return {
    item_id: itemId,
    item_name: productName || priceObject?.nickname || line.description || 'Subscription',
    item_category: 'Subscription',
    ...(recurring?.usage_type === 'metered' ? { item_category2: 'Metered' } : {}),
    price: resolvedUnitAmount,
    quantity,
  }
}

function subscriptionFallbackItems(subscription: Stripe.Subscription, currency: string): Ga4Item[] {
  return subscription.items.data.flatMap((item) => {
    const price = typeof item.price === 'string' ? null : item.price
    if (!price) return []
    const product = price.product
    const productName = product && typeof product !== 'string' && !product.deleted ? product.name : null
    const unitAmount = typeof price.unit_amount === 'number'
      ? stripeMinorToMajor(price.unit_amount, currency)
      : null
    if (!unitAmount || unitAmount <= 0) return []
    return [{
      item_id: price.id,
      item_name: productName || price.nickname || 'Subscription',
      item_category: 'Subscription',
      ...(price.recurring?.usage_type === 'metered' ? { item_category2: 'Metered' } : {}),
      price: unitAmount,
      quantity: item.quantity ?? 1,
    }]
  })
}

function positiveSubscriptionLines(lines: StripeInvoiceLine[], subscriptionId: string): StripeInvoiceLine[] {
  return lines.filter((line) => {
    if (invoiceLineSubscriptionId(line) !== subscriptionId) return false
    if (!invoiceLineIsSubscription(line)) return false
    return typeof line.amount === 'number' && line.amount > 0
  })
}

export function buildStripeGa4PurchaseEvent(input: StripeGa4PurchaseEventInput): Ga4Event {
  const items = input.lines
    .map(line => itemFromInvoiceLine(line, input.currency))
    .filter((item): item is Ga4Item => item !== null)
  const resolvedItems = items.length > 0 ? items : (input.fallbackItems ?? [])
  if (resolvedItems.length === 0) {
    throw new Error(`Stripe invoice ${input.invoiceId} has no GA4 subscription items; retrying`)
  }
  if (!Number.isFinite(input.amountPaid) || input.amountPaid <= 0) {
    throw new Error(`Stripe invoice ${input.invoiceId} has no positive paid amount`)
  }

  return {
    name: 'purchase',
    params: {
      transaction_id: input.invoiceId,
      value: stripeMinorToMajor(input.amountPaid, input.currency),
      currency: input.currency.toUpperCase(),
      purchase_type: input.purchaseType,
      subscription_id: input.subscriptionId,
      items: resolvedItems,
    },
  }
}

export function buildStripeGa4RefundEvent(input: StripeGa4RefundEventInput): Ga4Event {
  const items = input.lines
    .map(line => itemFromInvoiceLine(line, input.currency))
    .filter((item): item is Ga4Item => item !== null)
  return {
    name: 'refund',
    params: {
      transaction_id: input.invoiceId,
      value: stripeMinorToMajor(input.amount, input.currency),
      currency: input.currency.toUpperCase(),
      refund_id: input.refundId,
      subscription_id: input.subscriptionId,
      ...(input.purchaseType ? { purchase_type: input.purchaseType } : {}),
      ...(items.length > 0 ? { items } : {}),
    },
  }
}

export function classifyStripeInvoicePurchase(
  billingReason: string | null | undefined,
  intentAction?: StripeGa4Intent['action'] | null,
  metadataAction?: string | null,
): StripeGa4PurchaseType | null {
  if (billingReason === 'subscription_create') return 'initial_subscription'
  if (billingReason === 'subscription_cycle' || billingReason === 'subscription_threshold') {
    return 'subscription_renewal'
  }
  if (billingReason !== 'subscription_update') return null
  if (intentAction === 'upgrade' || intentAction === 'downgrade') return intentAction
  if (metadataAction === 'upgrade' || metadataAction === 'downgrade') return metadataAction
  return null
}

interface StripeGa4Context {
  organizationId: string | null
  userId: string | null
  clientId: string | null
  intent: StripeGa4Intent | null
  sessionId: string | null
  sessionCapturedAt: number | null
  customerId: string | null
}

async function organizationIdForSubscription(db: DbClient, subscriptionId: string, metadata?: Stripe.Metadata): Promise<string | null> {
  return stripeMetadataValue(metadata, 'referenceId', 'organization_id')
    ?? (await queryFirst<{ organizationId: string }>(db, `
      SELECT organization_id AS organizationId
        FROM organization_billing WHERE stripe_subscription_id = ? LIMIT 1
    `, [subscriptionId]))?.organizationId
    ?? null
}

async function customerMetadata(
  stripe: Stripe,
  customerId: string | null,
): Promise<Stripe.Metadata | null> {
  if (!customerId) return null
  const customer = await stripe.customers.retrieve(customerId)
  return customer.deleted ? null : customer.metadata
}

async function resolveStripeGa4Context(
  db: DbClient,
  stripe: Stripe,
  subscription: Stripe.Subscription,
  purchaseType?: StripeGa4PurchaseType | null,
): Promise<StripeGa4Context> {
  const metadata = subscription.metadata
  const customerId = customerIdValue(subscription.customer)
  const customerMeta = await customerMetadata(stripe, customerId)
  const organizationId = await organizationIdForSubscription(db, subscription.id, metadata)

  let intent = await findPendingStripeGa4Intent(db, subscription.id)
  if (!intent && organizationId && purchaseType === 'initial_subscription') {
    intent = await findPendingInitialStripeGa4Intent(db, organizationId)
    if (intent) await attachStripeGa4IntentToSubscription(db, intent.id, subscription.id)
  }
  const persisted = organizationId
    ? await getPersistedStripeGa4Attribution(db, organizationId)
    : { clientId: null, userId: null }

  const userId = stripeMetadataValue(metadata, 'user_id', 'userId', 'pending_user_id')
    ?? stripeMetadataValue(customerMeta, 'user_id', 'userId')
    ?? intent?.userId
    ?? persisted.userId
    ?? null
  const clientId = stripeMetadataValue(metadata, 'ga_client_id', 'pending_ga_client_id')
    ?? stripeMetadataValue(customerMeta, 'ga_client_id')
    ?? intent?.clientId
    ?? persisted.clientId
    ?? null
  const interactiveAction = purchaseType === 'initial_subscription'
    || purchaseType === 'upgrade'
    || purchaseType === 'downgrade'
  const sessionId = interactiveAction
    ? intent?.sessionId
      ?? stripeMetadataValue(metadata, 'ga_session_id', 'pending_ga_session_id', 'initial_ga_session_id')
      ?? null
    : null
  const sessionCapturedAt = interactiveAction
    ? intent?.sessionCapturedAt
      ?? stripeMetadataNumber(metadata, 'ga_session_captured_at', 'pending_ga_session_captured_at', 'initial_ga_session_captured_at')
      ?? null
    : null

  return { organizationId, userId, clientId, intent, sessionId, sessionCapturedAt, customerId }
}

async function sendStripeGa4Purchase(
  env: CloudflareEnv,
  db: DbClient,
  stripe: Stripe,
  invoice: StripeInvoiceWithSubscription,
  event: Stripe.Event,
): Promise<void> {
  const subscriptionId = invoiceSubscriptionId(invoice)
  if (!subscriptionId || invoice.amount_paid <= 0) return
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price.product'],
  })
  const metadataAction = stripeMetadataValue(subscription.metadata, 'analytics_action', 'pending_change_type')
  const preliminaryPurchaseType = classifyStripeInvoicePurchase(invoice.billing_reason, null, metadataAction)
  const context = await resolveStripeGa4Context(db, stripe, subscription, preliminaryPurchaseType)
  const purchaseType = classifyStripeInvoicePurchase(
    invoice.billing_reason,
    context.intent?.action,
    metadataAction,
  )
  if (!purchaseType) return

  const lines = await loadStripeInvoiceLines(stripe, invoice)
  let candidateLines = positiveSubscriptionLines(lines, subscriptionId)
  if (purchaseType === 'initial_subscription' || purchaseType === 'subscription_renewal') {
    candidateLines = candidateLines.filter(line => !invoiceLineIsProration(line))
  }
  const eventPayload = buildStripeGa4PurchaseEvent({
    invoiceId: invoice.id,
    amountPaid: invoice.amount_paid,
    currency: invoice.currency ?? 'usd',
    purchaseType,
    subscriptionId,
    lines: candidateLines,
    fallbackItems: subscriptionFallbackItems(subscription, invoice.currency ?? 'usd'),
  })

  await sendGa4Event(env, {
    clientId: context.clientId,
    userId: context.userId,
    sessionId: context.sessionId,
    sessionCapturedAt: context.sessionCapturedAt,
    event: eventPayload,
  })

  if (context.organizationId && context.clientId) {
    await persistStripeGa4Attribution(db, context.organizationId, context.userId, context.clientId)
  }
  if (context.intent && (purchaseType === 'upgrade' || purchaseType === 'downgrade' || purchaseType === 'initial_subscription')) {
    await consumeStripeGa4Intent(db, context.intent.id, event.id)
  }
  await clearInteractiveStripeMetadata(stripe, subscription)
}

async function clearInteractiveStripeMetadata(
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<void> {
  const keys = [
    'analytics_action',
    'ga_session_id',
    'ga_session_captured_at',
    'initial_ga_session_id',
    'initial_ga_session_captured_at',
    'pending_change_type',
    'pending_ga_client_id',
    'pending_ga_session_id',
    'pending_ga_session_captured_at',
    'pending_user_id',
    'previous_price_id',
    'new_price_id',
  ]
  const metadata = { ...subscription.metadata }
  const hasEphemeralMetadata = keys.some(key => metadata[key] !== undefined)
  if (!hasEphemeralMetadata) return
  for (const key of keys) metadata[key] = ''
  try {
    await stripe.subscriptions.update(subscription.id, { metadata })
  } catch (error) {
    console.error('stripe_ga4_ephemeral_metadata_cleanup_failed', {
      subscriptionId: subscription.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function sendStripeGa4Lifecycle(
  env: CloudflareEnv,
  db: DbClient,
  stripe: Stripe,
  subscription: Stripe.Subscription,
  eventName: string,
  event: Stripe.Event,
  intent: StripeGa4Intent | null,
): Promise<void> {
  if (intent?.lifecycleSentAt) return
  const context = await resolveStripeGa4Context(db, stripe, subscription, null)
  if (!context.clientId && !context.userId) {
    console.warn('stripe_ga4_lifecycle_unattributed', { subscriptionId: subscription.id, eventName })
    return
  }
  const params: Record<string, unknown> = {
    subscription_id: subscription.id,
    ...(context.organizationId ? { organization_id: context.organizationId } : {}),
  }
  if (intent?.previousPriceId) params.previous_price_id = intent.previousPriceId
  if (intent?.newPriceId) params.new_price_id = intent.newPriceId
  if (intent?.action === 'downgrade') params.effective_timing = intent.effectiveTiming

  await sendGa4Event(env, {
    clientId: context.clientId,
    userId: context.userId,
    sessionId: intent?.sessionId,
    sessionCapturedAt: intent?.sessionCapturedAt,
    event: { name: eventName, params },
  })
  if (intent) {
    await markStripeGa4IntentLifecycleSent(db, intent.id)
    await consumeStripeGa4Intent(db, intent.id, event.id)
  }
}

async function attachCheckoutIntent(
  db: DbClient,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id ?? null
  if (!subscriptionId) return
  const organizationId = stripeMetadataValue(session.metadata, 'referenceId', 'organization_id')
  const userId = stripeMetadataValue(session.metadata, 'user_id', 'userId')
  if (!organizationId) return
  const intent = await findPendingInitialStripeGa4Intent(db, organizationId, userId)
  if (intent) await attachStripeGa4IntentToSubscription(db, intent.id, subscriptionId)
  void stripe
}

async function sendStripeGa4Refund(
  env: CloudflareEnv,
  db: DbClient,
  stripe: Stripe,
  refund: Stripe.Refund,
): Promise<void> {
  const chargeId = typeof refund.charge === 'string' ? refund.charge : refund.charge?.id ?? null
  if (refund.amount <= 0) return
  const invoiceIdFromMetadata = stripeMetadataValue(refund.metadata, 'invoice_id')
  const paymentIntentId = typeof refund.payment_intent === 'string'
    ? refund.payment_intent
    : refund.payment_intent?.id ?? null
  const invoicePayment = paymentIntentId
    ? (await stripe.invoicePayments.list({
        limit: 100,
        status: 'paid',
        payment: { type: 'payment_intent', payment_intent: paymentIntentId },
      })).data.find(payment => {
        const invoice = payment.invoice
        return Boolean(typeof invoice === 'string' ? invoice : invoice?.id)
      })
    : null
  const charge = chargeId
    ? await stripe.charges.retrieve(chargeId) as unknown as Stripe.Charge & { invoice?: string | { id: string } | null }
    : null
  const invoiceFromCharge = typeof charge?.invoice === 'string' ? charge.invoice : charge?.invoice?.id ?? null
  const invoiceFromPayment = invoicePayment
    ? (typeof invoicePayment.invoice === 'string' ? invoicePayment.invoice : invoicePayment.invoice?.id ?? null)
    : null
  const invoiceId = invoiceIdFromMetadata ?? invoiceFromPayment ?? invoiceFromCharge
  if (!invoiceId) return
  const invoice = await stripe.invoices.retrieve(invoiceId, {
    expand: ['lines.data.pricing.price_details.price'],
  }) as StripeInvoiceWithSubscription
  const subscriptionId = invoiceSubscriptionId(invoice)
  if (!subscriptionId) return
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price.product'],
  })
  const context = await resolveStripeGa4Context(db, stripe, subscription, null)
  const lines = await loadStripeInvoiceLines(stripe, invoice)
  const purchaseType = classifyStripeInvoicePurchase(invoice.billing_reason, null, null) ?? undefined
  await sendGa4Event(env, {
    clientId: context.clientId,
    userId: context.userId,
    event: buildStripeGa4RefundEvent({
      invoiceId,
      refundId: refund.id,
      amount: refund.amount,
      currency: refund.currency ?? invoice.currency ?? 'usd',
      subscriptionId,
      lines: positiveSubscriptionLines(lines, subscriptionId),
      purchaseType,
    }),
  })
}

export async function handleStripeGa4Event(
  env: CloudflareEnv,
  db: DbClient,
  stripe: Stripe,
  event: Stripe.Event,
): Promise<void> {
  if (event.type === 'checkout.session.completed') {
    await attachCheckoutIntent(db, stripe, event.data.object as Stripe.Checkout.Session)
    return
  }

  if (event.type === 'invoice.paid') {
    await sendStripeGa4Purchase(env, db, stripe, event.data.object as StripeInvoiceWithSubscription, event)
    return
  }

  if (event.type === 'refund.created') {
    await sendStripeGa4Refund(env, db, stripe, event.data.object as Stripe.Refund)
    return
  }

  if (!event.type.startsWith('customer.subscription.')) return
  const subscription = event.data.object as Stripe.Subscription
  const intent = await findPendingStripeGa4Intent(db, subscription.id)

  if (event.type === 'customer.subscription.updated' && intent?.action === 'downgrade' && intent.effectiveTiming === 'period_end') {
    const lifecycleEvent = intent.newPriceId ? 'subscription_downgrade' : 'subscription_cancelled'
    await sendStripeGa4Lifecycle(env, db, stripe, subscription, lifecycleEvent, event, intent)
    return
  }
  if (event.type === 'customer.subscription.updated' && intent?.action === 'upgrade' && intent.source !== 'browser') {
    await sendStripeGa4Lifecycle(env, db, stripe, subscription, 'subscription_upgrade', event, intent)
    return
  }
  if (event.type === 'customer.subscription.deleted') {
    if (!intent && await findConsumedStripeGa4CancellationIntent(db, subscription.id)) return
    await sendStripeGa4Lifecycle(env, db, stripe, subscription, 'subscription_cancelled', event, intent)
  }
}
