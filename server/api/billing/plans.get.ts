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
  aiCredits: number
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

const DEFAULT_PLAN_LIMITS: PlanLimits = {
  locations: 1,
  sites: 1,
  aiCredits: 0,
  customDomain: false,
  googleBusiness: false,
  advancedSeo: false,
  whiteLabel: false,
  apiAccess: false,
  support: 'Community',
}

const STATIC_PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Get your restaurant online today',
    highlighted: false,
    prices: [],
    features: [
      'Subdomain hosting',
      'Saya restaurant theme',
      'Visual content editor',
      'Menu management',
      'Basic SEO (schema markup, sitemap)',
      'Mobile-responsive design',
      '500 AI credits / month',
      '1 location',
    ],
    limits: {
      locations: 1,
      sites: 1,
      aiCredits: 500,
      customDomain: false,
      googleBusiness: false,
      advancedSeo: false,
      whiteLabel: false,
      apiAccess: false,
      support: 'Community',
    },
    image: '/krabi-claw-free.png',
    cta: { label: 'Start Free', href: '/signup' },
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Per location, per month',
    highlighted: true,
    badge: 'Most Popular',
    prices: [
      { id: '', amount: 2900, currency: 'usd', interval: 'month' },
      { id: '', amount: 24900, currency: 'usd', interval: 'year' },
    ],
    features: [
      'Everything in Free, plus:',
      'Custom domain + free SSL',
      'Google Business Profile sync',
      'Auto-sync reviews, hours & photos',
      'Advanced SEO tools',
      '5,000 AI credits / month',
      'Unlimited locations (billed per location)',
      'Priority email support',
    ],
    limits: {
      locations: 'unlimited',
      sites: 1,
      aiCredits: 5000,
      customDomain: true,
      googleBusiness: true,
      advancedSeo: true,
      whiteLabel: false,
      apiAccess: false,
      support: 'Priority email',
    },
    cta: { label: 'Get Started', href: '/signup?plan=pro' },
  },
  {
    id: 'agency',
    name: 'Agency',
    tagline: 'Unlimited sites, one flat rate',
    highlighted: false,
    prices: [
      { id: '', amount: 9900, currency: 'usd', interval: 'month' },
      { id: '', amount: 99000, currency: 'usd', interval: 'year' },
    ],
    features: [
      'Everything in Pro, plus:',
      'Unlimited sites at one flat rate',
      'API access',
      'White-label ready',
      'Dedicated account manager',
      '50,000 AI credits / month',
      'Custom theme development on request',
    ],
    limits: {
      locations: 'unlimited',
      sites: 'unlimited',
      aiCredits: 50000,
      customDomain: true,
      googleBusiness: true,
      advancedSeo: true,
      whiteLabel: true,
      apiAccess: true,
      support: 'Dedicated',
    },
    cta: { label: 'Contact Us', href: '/contact' },
  },
]

function parseOptionalInt(value?: string): number | undefined {
  if (!value) return undefined
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseLimits(metadata: Record<string, string>): Partial<PlanLimits> {
  const loc = metadata.max_locations
  const sit = metadata.max_sites
  const credits = metadata.ai_credits

  return {
    locations: loc === 'unlimited' ? 'unlimited' : parseOptionalInt(loc),
    sites: sit === 'unlimited' ? 'unlimited' : parseOptionalInt(sit),
    aiCredits: parseOptionalInt(credits),
    customDomain: metadata.custom_domain === 'true',
    googleBusiness: metadata.google_business === 'true',
    advancedSeo: metadata.advanced_seo === 'true',
    whiteLabel: metadata.white_label === 'true',
    apiAccess: metadata.api_access === 'true',
    support: metadata.support,
  }
}

function isMarketingFeatureArray(value: ApiValue): value is MarketingFeature[] {
  return Array.isArray(value)
    && value.every(item => typeof item === 'object' && item !== null && typeof (item as MarketingFeature).name === 'string')
}

async function fetchStripeProducts(env: Record<string, string | undefined>): Promise<Plan[]> {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY!)

  const products = await stripe.products.list({
    active: true,
    expand: ['data.default_price'],
  })

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
      priceLookup[pid].push({
        id: price.id,
        amount: price.unit_amount,
        currency: price.currency,
        interval,
      })
    }

    if (!prices.has_more || prices.data.length === 0) break
    startingAfter = prices.data[prices.data.length - 1]?.id
  }

  const plans: Plan[] = []

  for (const product of products.data) {
    const meta = (product.metadata ?? {}) as Record<string, string>
    const planId = meta.plan_id
    if (!planId || planId === 'free') continue

    const staticFallback = STATIC_PLANS.find(p => p.id === planId)
    const productWithMarketing = product as Stripe.Product & { marketing_features?: ApiValue }
    const features = isMarketingFeatureArray(productWithMarketing.marketing_features)
      ? productWithMarketing.marketing_features.map(f => f.name)
      : (staticFallback?.features ?? [])

    plans.push({
      id: planId,
      name: product.name,
      tagline: product.description ?? staticFallback?.tagline ?? '',
      highlighted: meta.highlighted === 'true',
      badge: meta.badge || staticFallback?.badge,
      image: product.images?.[0] ?? staticFallback?.image,
      prices: (priceLookup[product.id] ?? []).sort((a, b) => {
        const rank: Record<string, number> = { month: 0, year: 1 }
        return (rank[a.interval] ?? 0) - (rank[b.interval] ?? 0)
      }),
      features,
      limits: {
        ...DEFAULT_PLAN_LIMITS,
        ...staticFallback?.limits,
        ...parseLimits(meta),
      },
      cta: staticFallback?.cta ?? { label: 'Get started', href: '/signup' },
    })
  }

  // Sort by price ascending
  plans.sort((a, b) => {
    const aPrice = a.prices.find(p => p.interval === 'month')?.amount ?? 0
    const bPrice = b.prices.find(p => p.interval === 'month')?.amount ?? 0
    return aPrice - bPrice
  })

  return [STATIC_PLANS[0]!, ...plans]
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)

  setHeader(event, 'Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')

  if (!env.STRIPE_SECRET_KEY) {
    return jsonResponse(STATIC_PLANS)
  }

  const plans = await fetchStripeProducts(env as Record<string, string | undefined>)
  return jsonResponse(plans)
})
