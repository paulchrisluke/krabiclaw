// GET /api/site-transfer/[token] — public: fetch transfer details for the accept page
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { queryFirst } from '~/server/db'
import { getStripe } from '~/server/utils/billing'
import {
  assertGrowthStripeCatalogPrices,
  resolveStripeCatalogPrice,
  selectStripeCatalogPrice,
} from '~/server/utils/stripe-catalog'
import { assertNewSalePlan, type NewSalePlanId } from '~/shared/billing-model'
import type Stripe from 'stripe'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) return jsonResponse({ error: 'Token required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const row = await queryFirst<{
    id: string
    site_id: string
    to_email: string
    status: string
    message: string | null
    invited_plan: string | null
    invited_coupon: string | null
    invited_interval: string | null
    invited_domain: string | null
    requires_payment: number
    custom_domains_removed_at: string | null
    brand_name: string | null
    slug: string
    subdomain: string | null
  }>(
    db,
    `SELECT r.id, r.site_id, r.to_email, r.status, r.message,
            r.invited_plan, r.invited_coupon, r.invited_interval, r.invited_domain,
            r.requires_payment, r.custom_domains_removed_at,
            s.brand_name, s.slug, s.subdomain
     FROM site_transfer_requests r
     JOIN sites s ON s.id = r.site_id
     WHERE r.token = ? LIMIT 1`,
    [token],
  )

  if (!row) return jsonResponse({ error: 'Transfer not found' }, { status: 404 })

  if (row.status !== 'pending') {
    return jsonResponse({ error: 'Transfer is no longer active', status: row.status }, { status: 410 })
  }

  const hasInvitedPlan = row.invited_plan !== null && row.invited_plan !== undefined
  const requiresPayment = row.requires_payment === 1 || hasInvitedPlan
  if (requiresPayment && !row.invited_plan) {
    return jsonResponse({
      error: 'This handoff is missing a supported billing plan. Ask the sender to reissue it with Growth.',
    }, { status: 409 })
  }

  let validatedPlan: NewSalePlanId | null = null
  if (hasInvitedPlan) {
    try {
      validatedPlan = assertNewSalePlan(row.invited_plan)
    } catch {
      return jsonResponse({
        error: 'This handoff uses a retired or unsupported billing plan. Ask the sender to reissue it with Growth.',
      }, { status: 409 })
    }
  }

  const invitedInterval: 'month' | 'year' = row.invited_interval === 'year' ? 'year' : 'month'

  if (validatedPlan && !env.STRIPE_SECRET_KEY) {
    return jsonResponse({ error: 'Stripe pricing is temporarily unavailable for this paid handoff.' }, { status: 503 })
  }

  // Fetch the canonical plan price and any invited coupon from Stripe. A
  // stored coupon is part of the checkout contract; never silently render the
  // undiscounted price when Stripe cannot resolve it.
  interface PricingInfo {
    base_cents: number
    discounted_cents: number | null
    coupon_duration: string | null
    coupon_duration_months: number | null
  }
  let pricing_month: PricingInfo | null = null
  let pricing_year: PricingInfo | null = null

  if (validatedPlan && env.STRIPE_SECRET_KEY) {
    const stripe = getStripe(env)
    const products: Stripe.Product[] = []
    let productsStartingAfter: string | undefined
    do {
      const page = await stripe.products.list({
        active: true,
        limit: 100,
        ...(productsStartingAfter ? { starting_after: productsStartingAfter } : {}),
      })
      products.push(...page.data)
      productsStartingAfter = page.has_more ? page.data.at(-1)?.id : undefined
    } while (productsStartingAfter)

    const prices: Stripe.Price[] = []
    let pricesStartingAfter: string | undefined
    do {
      const page = await stripe.prices.list({
        active: true,
        type: 'recurring',
        limit: 100,
        ...(pricesStartingAfter ? { starting_after: pricesStartingAfter } : {}),
      })
      prices.push(...page.data)
      pricesStartingAfter = page.has_more ? page.data.at(-1)?.id : undefined
    } while (pricesStartingAfter)

    const canonical = resolveStripeCatalogPrice(products, prices, validatedPlan, 'month')
    const monthPrice = canonical.price
    const yearPrice = selectStripeCatalogPrice(canonical.product, prices, 'year')
    assertGrowthStripeCatalogPrices(monthPrice, yearPrice)

    let coupon_duration: string | null = null
    let coupon_duration_months: number | null = null
    let coupon_percent_off: number | null = null
    let coupon_amount_off: number | null = null
    if (row.invited_coupon) {
      try {
        const coupon = await stripe.coupons.retrieve(row.invited_coupon)
        coupon_duration = coupon.duration ?? null
        coupon_duration_months = coupon.duration_in_months ?? null
        coupon_percent_off = coupon.percent_off ?? null
        coupon_amount_off = coupon.amount_off ?? null
      } catch (error) {
        if ((error as { code?: string })?.code === 'resource_missing') {
          return jsonResponse({
            error: 'This handoff discount is no longer available. Ask the sender to reissue it.',
          }, { status: 409 })
        }
        throw error
      }
    }

    const applyDiscount = (amount: number): number | null => {
      if (coupon_percent_off) return Math.round(amount * (1 - coupon_percent_off / 100))
      if (coupon_amount_off) return Math.max(0, amount - coupon_amount_off)
      return null
    }

    if (monthPrice.unit_amount) {
      pricing_month = {
        base_cents: monthPrice.unit_amount,
        discounted_cents: applyDiscount(monthPrice.unit_amount),
        coupon_duration,
        coupon_duration_months,
      }
    }

    if (yearPrice?.unit_amount) {
      pricing_year = {
        base_cents: yearPrice.unit_amount,
        discounted_cents: applyDiscount(yearPrice.unit_amount),
        coupon_duration,
        coupon_duration_months,
      }
    }
  }

  return jsonResponse({
    id: row.id,
    site_id: row.site_id,
    site_name: row.brand_name ?? row.slug,
    to_email: row.to_email,
    message: row.message,
    invited_plan: row.invited_plan,
    invited_coupon: row.invited_coupon,
    invited_interval: invitedInterval,
    pricing_month,
    pricing_year,
    invited_domain: row.invited_domain,
    domain_active: !!row.invited_domain && !row.custom_domains_removed_at,
    requires_payment: requiresPayment,
    never_expires: true,
    site_subdomain: row.subdomain,
  })
})
import { defineEventHandler } from 'h3'
import { getRouterParam } from 'h3'
