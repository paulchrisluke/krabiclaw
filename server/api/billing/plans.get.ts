import Stripe from 'stripe'
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'

export interface PlanPrice {
  id: string
  amount: number // cents
  currency: string
  interval: 'month' | 'year'
}

export interface PlanLimits {
  locations: number | 'unlimited'
  sites: number | 'unlimited'
  aiCredits: number | 'unlimited'
  customDomain: boolean
  googleBusiness: boolean
  advancedSeo: boolean
  whiteLabel: boolean
  apiAccess: boolean
  support: string
}

export interface Plan {
  id: string
  name: string
  tagline: string
  highlighted: boolean
  badge?: string
  image?: string
  prices: PlanPrice[]
  features: string[]
  limits: PlanLimits
  cta: { label: string; href: string }
}

interface MarketingFeature {
  name: string
}

// Starter has no Stripe product — it is genuinely free with no subscription.
const STARTER_PLAN: Plan = {
  id: 'free',
  name: 'Starter',
  tagline: 'Get your restaurant online for free',
  highlighted: false,
  prices: [],
  features: [],
  limits: {
    locations: 1, sites: 1, aiCredits: 500,
    customDomain: false, googleBusiness: false, advancedSeo: false,
    whiteLabel: false, apiAccess: false, support: 'Community',
  },
  image: '/krabi-claw-free.png',
  cta: { label: 'Start Free', href: '/signup' },
}

// CTA labels and hrefs are app config — not Stripe data.
const PLAN_CTA: Record<string, { label: string; href: string }> = {
  growth:          { label: 'Get Growth',          href: '/signup?plan=growth' },
  managed:         { label: 'Get Managed',          href: '/signup?plan=managed' },
  seo_accelerator: { label: 'Get SEO Accelerator',  href: '/signup?plan=seo_accelerator' },
}

const DEFAULT_PLAN_LIMITS: PlanLimits = {
  locations: 1, sites: 1, aiCredits: 0,
  customDomain: false, googleBusiness: false, advancedSeo: false,
  whiteLabel: false, apiAccess: false, support: 'Community',
}

function parseOptionalInt(value?: string): number | undefined {
  if (!value) return undefined
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseLimits(metadata: Record<string, string>): Partial<PlanLimits> {
  const result: Partial<PlanLimits> = {}
  if ('max_locations' in metadata) {
    result.locations = metadata.max_locations === 'unlimited' ? 'unlimited' : parseOptionalInt(metadata.max_locations)
  }
  if ('max_sites' in metadata) {
    result.sites = metadata.max_sites === 'unlimited' ? 'unlimited' : parseOptionalInt(metadata.max_sites)
  }
  if ('ai_credits' in metadata) {
    result.aiCredits = metadata.ai_credits === 'unlimited' || metadata.ai_credits === '-1' ? 'unlimited' : parseOptionalInt(metadata.ai_credits)
  }
  if ('custom_domain' in metadata || 'custom_domains' in metadata) {
    result.customDomain = metadata.custom_domain === 'true' || metadata.custom_domains === 'true'
  }
  if ('google_business' in metadata) {
    result.googleBusiness = metadata.google_business === 'true'
  }
  if ('advanced_seo' in metadata) {
    result.advancedSeo = metadata.advanced_seo === 'true'
  }
  if ('white_label' in metadata) {
    result.whiteLabel = metadata.white_label === 'true'
  }
  if ('api_access' in metadata) {
    result.apiAccess = metadata.api_access === 'true'
  }
  if ('support' in metadata) {
    result.support = metadata.support
  }
  return result
}

function isMarketingFeatureArray(value: ApiValue): value is MarketingFeature[] {
  return Array.isArray(value)
    && value.every(item => typeof item === 'object' && item !== null && typeof (item as MarketingFeature).name === 'string')
}

async function fetchStripeProducts(env: Record<string, string | undefined>): Promise<Plan[]> {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY!)

  // Paginate all products
  let products: Stripe.Product[] = []
  let prodStartingAfter: string | undefined
  do {
    const page = await stripe.products.list({ active: true, limit: 100, expand: ['data.default_price'], ...(prodStartingAfter ? { starting_after: prodStartingAfter } : {}) })
    products = products.concat(page.data)
    prodStartingAfter = page.has_more && page.data.length > 0 ? page.data[page.data.length - 1].id : undefined
  } while (prodStartingAfter)

  // Paginate all prices
  const priceLookup: Record<string, PlanPrice[]> = {}
  let startingAfter: string | undefined
  while (true) {
    const prices = await stripe.prices.list({ active: true, limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) })
    for (const price of prices.data) {
      if (!price.unit_amount || price.type !== 'recurring') continue
      const interval = price.recurring?.interval
      if (interval !== 'month' && interval !== 'year') continue
      const pid = typeof price.product === 'string' ? price.product : price.product.id
      if (!priceLookup[pid]) priceLookup[pid] = []
      priceLookup[pid].push({ id: price.id, amount: price.unit_amount, currency: price.currency, interval })
    }
    if (!prices.has_more || prices.data.length === 0) break
    startingAfter = prices.data[prices.data.length - 1]?.id
  }

  const plans: Plan[] = []

  for (const product of products) {
    const meta = (product.metadata ?? {}) as Record<string, string>
    const planId = meta.plan_id
    if (!planId || planId === 'free') continue

    const productWithMarketing = product as Stripe.Product & { marketing_features?: ApiValue }
    const features = isMarketingFeatureArray(productWithMarketing.marketing_features)
      ? productWithMarketing.marketing_features.map(f => f.name)
      : []

    plans.push({
      id: planId,
      name: product.name,
      tagline: product.description ?? '',
      highlighted: meta.highlighted === 'true',
      badge: meta.badge || undefined,
      image: product.images?.[0] ?? undefined,
      prices: (priceLookup[product.id] ?? []).sort((a, b) => {
        const rank: Record<string, number> = { month: 0, year: 1 }
        return (rank[a.interval] ?? 0) - (rank[b.interval] ?? 0)
      }),
      features,
      limits: { ...DEFAULT_PLAN_LIMITS, ...parseLimits(meta) },
      cta: PLAN_CTA[planId] ?? { label: 'Get started', href: '/signup' },
    })
  }

  plans.sort((a, b) => {
    const aPrice = a.prices.find(p => p.interval === 'month')?.amount ?? 0
    const bPrice = b.prices.find(p => p.interval === 'month')?.amount ?? 0
    return aPrice - bPrice
  })

  return [STARTER_PLAN, ...plans]
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)

  if (!env.STRIPE_SECRET_KEY) {
    throw createError({ statusCode: 503, message: 'Billing not configured' })
  }

  setHeader(event, 'Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')

  const plans = await fetchStripeProducts(env as Record<string, string | undefined>)
  return jsonResponse(plans)
})
