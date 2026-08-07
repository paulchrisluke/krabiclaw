import type Stripe from 'stripe'

export type StripeInvoiceLine = Stripe.InvoiceLineItem & {
  type?: string
  subscription?: string | Stripe.Subscription | null
  subscription_item?: string | null
  price?: string | Stripe.Price | null
  period?: { start?: number; end?: number } | null
  proration?: boolean
  pricing?: {
    type?: string
    price_details?: { price?: string | Stripe.Price | null } | null
  } | null
  parent?: {
    type?: string
    subscription_item_details?: {
      subscription?: string | null
      subscription_item?: string | null
      proration?: boolean
    } | null
    invoice_item_details?: {
      subscription?: string | null
      proration?: boolean
    } | null
  } | null
}

export function invoiceLinePrice(line: StripeInvoiceLine): string | Stripe.Price | null | undefined {
  return line.price ?? line.pricing?.price_details?.price
}

export function invoiceLineSubscriptionId(line: StripeInvoiceLine): string | null {
  const subscription = line.subscription
  return typeof subscription === 'string'
    ? subscription
    : subscription?.id
      ?? line.parent?.subscription_item_details?.subscription
      ?? line.parent?.invoice_item_details?.subscription
      ?? null
}

export function invoiceLineSubscriptionItemId(line: StripeInvoiceLine): string | null {
  return line.subscription_item
    ?? line.parent?.subscription_item_details?.subscription_item
    ?? null
}

export function invoiceLineIsProration(line: StripeInvoiceLine): boolean {
  return Boolean(line.proration)
    || Boolean(line.parent?.subscription_item_details?.proration)
    || Boolean(line.parent?.invoice_item_details?.proration)
}

export function invoiceLineIsSubscription(line: StripeInvoiceLine): boolean {
  return line.type === 'subscription'
    || line.parent?.type === 'subscription_item_details'
}

export function invoiceLineQuantity(line: StripeInvoiceLine): number {
  const quantity = line.quantity
    ?? (typeof line.quantity_decimal === 'string' ? Number(line.quantity_decimal) : null)
    ?? 1
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1
}

export function invoiceLineUnitAmount(line: StripeInvoiceLine): number | null {
  if (typeof line.amount !== 'number' || line.amount <= 0) return null
  return line.amount / invoiceLineQuantity(line)
}

export async function loadStripeInvoiceLines(
  stripe: Stripe,
  invoice: Stripe.Invoice & {
    lines?: Stripe.ApiList<Stripe.InvoiceLineItem> | null
  },
): Promise<StripeInvoiceLine[]> {
  let invoiceLines: StripeInvoiceLine[] = [...(invoice.lines?.data ?? []) as StripeInvoiceLine[]]
  let startingAfter = invoiceLines.at(-1)?.id
  const mustReloadFirstPage = invoiceLines.some(line => typeof invoiceLinePrice(line) === 'string')

  if (mustReloadFirstPage) {
    invoiceLines = []
    startingAfter = undefined
  }

  while (invoice.lines?.has_more || mustReloadFirstPage) {
    const page = await stripe.invoices.listLineItems(invoice.id, {
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
      expand: ['data.pricing.price_details.price'],
    })
    invoiceLines.push(...page.data as StripeInvoiceLine[])
    if (!page.has_more) break
    const next = page.data.at(-1)?.id
    if (!next || next === startingAfter) {
      throw new Error(`Stripe invoice ${invoice.id} line pagination did not advance; retrying`)
    }
    startingAfter = next
  }

  return await Promise.all(invoiceLines.map(async (line) => {
    const price = invoiceLinePrice(line)
    if (typeof price !== 'string') return line
    return {
      ...line,
      price: await stripe.prices.retrieve(price, { expand: ['product'] }),
    }
  }))
}
