import type Stripe from 'stripe'

export const GROWTH_MONTHLY_AMOUNT_CENTS = 4900
export const GROWTH_ANNUAL_AMOUNT_CENTS = 58800

/**
 * New-sale Growth is one fixed application offer. Stripe catalog metadata may
 * identify the product, but it cannot change this price contract.
 */
export function assertGrowthStripeCatalogPrices(
  monthly: Stripe.Price | null | undefined,
  annual?: Stripe.Price | null,
): asserts monthly is Stripe.Price {
  if (
    !monthly
    || typeof monthly.unit_amount !== 'number'
    || monthly.unit_amount !== GROWTH_MONTHLY_AMOUNT_CENTS
    || typeof monthly.currency !== 'string'
    || monthly.currency.trim().toLowerCase() !== 'usd'
  ) {
    throw new Error(`Growth monthly price must be exactly USD ${GROWTH_MONTHLY_AMOUNT_CENTS} cents`)
  }
  if (
    annual
    && (
      typeof annual.unit_amount !== 'number'
      || annual.unit_amount !== GROWTH_ANNUAL_AMOUNT_CENTS
      || typeof annual.currency !== 'string'
      || annual.currency.trim().toLowerCase() !== 'usd'
    )
  ) {
    throw new Error(`Growth annual price must be exactly USD ${GROWTH_ANNUAL_AMOUNT_CENTS} cents`)
  }
}

export function selectStripeCatalogPrice(
  product: Stripe.Product,
  prices: Stripe.Price[],
  interval: 'month' | 'year',
): Stripe.Price | null {
  const productPrices = prices.filter(price => {
    const productId = typeof price.product === 'string' ? price.product : price.product?.id
    return productId === product.id
  })
  const candidates = productPrices.filter(price =>
    price.active !== false
    && price.recurring?.interval === interval
    && price.recurring.interval_count === 1
    && typeof price.unit_amount === 'number'
    && price.unit_amount > 0
    && typeof price.currency === 'string'
    && price.currency.length > 0,
  )
  if (candidates.length === 0) return null

  const metadataKey = interval === 'month' ? 'monthly_price_id' : 'annual_price_id'
  const metadataPriceId = product.metadata?.[metadataKey]?.trim()
  if (metadataPriceId) {
    const selected = candidates.find(price => price.id === metadataPriceId)
    if (!selected) {
      throw new Error(`Stripe product ${product.id} has an invalid ${metadataKey} canonical price`)
    }
    return selected
  }

  const lookupKeyCandidates = candidates.filter(price => {
    const lookupKey = price.lookup_key?.toLowerCase() ?? ''
    return interval === 'month'
      ? lookupKey.includes('month')
      : lookupKey.includes('annual') || lookupKey.includes('year')
  })
  if (lookupKeyCandidates.length > 1) {
    throw new Error(`Stripe product ${product.id} has multiple ${interval} prices marked by lookup_key`)
  }
  if (lookupKeyCandidates.length === 1) {
    return lookupKeyCandidates[0] ?? null
  }
  if (candidates.length !== 1) {
    throw new Error(`Stripe product ${product.id} must have exactly one canonical ${interval} price`)
  }
  return candidates[0] ?? null
}

export interface StripeCatalogPriceResolution {
  product: Stripe.Product
  price: Stripe.Price
}

/**
 * Resolve the one active product and canonical recurring price for a plan.
 *
 * Product and price lists are deliberately passed in by the caller so the
 * same provider snapshot can be used by checkout, transfer previews, and the
 * Better Auth plan loader. Never choose the first matching product or price:
 * duplicate products and ambiguous prices are catalog corruption and must
 * fail closed until an operator repairs the catalog.
 */
export function resolveStripeCatalogPrice(
  products: Stripe.Product[],
  prices: Stripe.Price[],
  planId: string,
  interval: 'month' | 'year',
): StripeCatalogPriceResolution {
  const normalizedPlanId = planId.trim().toLowerCase()
  const matches = products.filter(product =>
    product.active !== false
    && product.metadata?.plan_id?.trim().toLowerCase() === normalizedPlanId,
  )
  if (matches.length === 0) {
    throw new Error(`No active Stripe product found for plan ${normalizedPlanId}`)
  }
  if (matches.length > 1) {
    const ids = matches.map(product => product.id).sort().join(', ')
    throw new Error(`Stripe has multiple active products for plan ${normalizedPlanId}: ${ids}`)
  }
  const product = matches[0]!
  const productPrices = prices.filter(price => {
    const productId = typeof price.product === 'string' ? price.product : price.product?.id
    return productId === product.id
  })
  const price = selectStripeCatalogPrice(product, productPrices, interval)
  if (!price) {
    throw new Error(`No active Stripe ${interval} price found for plan ${normalizedPlanId}`)
  }
  return { product, price }
}
