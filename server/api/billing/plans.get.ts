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
    name: 'Starter',
    tagline: 'Get your restaurant online for free',
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
    id: 'growth',
    name: 'Growth',
    tagline: 'We handle translations & updates — you focus on cooking',
    highlighted: false,
    prices: [
      { id: '', amount: 4900, currency: 'usd', interval: 'month' },
    ],
    features: [
      'One language translation (EN, ZH, or DE)',
      'AI-assisted menu updates via WhatsApp',
      'Monthly traffic & performance snapshot',
      'Google Business profile basics',
      '2,000 AI credits / month',
    ],
    limits: {
      locations: 1,
      sites: 1,
      aiCredits: 2000,
      customDomain: false,
      googleBusiness: true,
      advancedSeo: false,
      whiteLabel: false,
      apiAccess: false,
      support: 'WhatsApp',
    },
    cta: { label: 'Get Growth', href: '/signup?plan=growth' },
  },
  {
    id: 'managed',
    name: 'Managed',
    tagline: 'Paul & Julia run your restaurant online',
    highlighted: true,
    badge: 'Best Value',
    prices: [
      { id: '', amount: 14900, currency: 'usd', interval: 'month' },
    ],
    features: [
      'Everything in Growth, plus:',
      'Unlimited language translations',
      'Menu, posts & seasonal content managed for you',
      'Full Google Business profile management',
      'Custom domain + free SSL',
      'Monthly marketing report',
      'Priority WhatsApp support from Paul & Julia',
    ],
    limits: {
      locations: 'unlimited',
      sites: 1,
      aiCredits: -1,
      customDomain: true,
      googleBusiness: true,
      advancedSeo: true,
      whiteLabel: false,
      apiAccess: false,
      support: 'Priority WhatsApp',
    },
    cta: { label: 'Get Managed', href: '/signup?plan=managed' },
  },
  {
    id: 'seo_accelerator',
    name: 'SEO Accelerator',
    tagline: "Julia's 1M impressions/day playbook for your restaurant",
    highlighted: false,
    prices: [
      { id: '', amount: 34900, currency: 'usd', interval: 'month' },
    ],
    features: [
      'Everything in Managed, plus:',
      'Local & travel keyword targeting',
      'Google Maps authority building',
      'Monthly content cadence (blog, photos, posts)',
      'Competitive analysis & reporting',
      "The same playbook behind tiffycooks.com's 1M daily impressions",
    ],
    limits: {
      locations: 'unlimited',
      sites: 1,
      aiCredits: -1,
      customDomain: true,
      googleBusiness: true,
      advancedSeo: true,
      whiteLabel: false,
      apiAccess: false,
      support: 'Dedicated',
    },
    cta: { label: 'Get SEO Accelerator', href: '/signup?plan=seo_accelerator' },
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
    customDomain: metadata.custom_domain === 'true' || metadata.custom_domains === 'true',
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
