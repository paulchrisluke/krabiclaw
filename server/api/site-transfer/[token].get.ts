// GET /api/site-transfer/[token] — public: fetch transfer details for the accept page
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getStripe } from '~/server/utils/billing'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) return jsonResponse({ error: 'Token required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const row = await db
    .prepare(
      `SELECT r.id, r.site_id, r.to_email, r.status, r.message,
              r.invited_plan, r.invited_coupon, r.invited_interval, r.invited_domain,
              r.requires_payment, r.custom_domains_removed_at,
              s.brand_name, s.slug, s.subdomain,
              u.name AS initiated_by_name, u.email AS initiated_by_email
       FROM site_transfer_requests r
       JOIN sites s ON s.id = r.site_id
       JOIN user u ON u.id = r.initiated_by_user_id
       WHERE r.token = ? LIMIT 1`,
    )
    .bind(token)
    .first<{
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
      initiated_by_name: string
      initiated_by_email: string
    }>()

  if (!row) return jsonResponse({ error: 'Transfer not found' }, { status: 404 })

  if (row.status !== 'pending') {
    return jsonResponse({ error: 'Transfer is no longer active', status: row.status }, { status: 410 })
  }

  const requiresPayment = row.requires_payment === 1 || Boolean(row.invited_plan)
  const invitedInterval: 'month' | 'year' = row.invited_interval === 'year' ? 'year' : 'month'

  // Fetch plan price + coupon discount from Stripe (best-effort)
  interface PricingInfo {
    base_cents: number
    discounted_cents: number | null
    coupon_duration: string | null
    coupon_duration_months: number | null
  }
  let pricing_month: PricingInfo | null = null
  let pricing_year: PricingInfo | null = null

  if (row.invited_plan && env.STRIPE_SECRET_KEY) {
    try {
      const stripe = getStripe(env)
      const products = await stripe.products.list({ active: true, limit: 100 })
      const product = products.data.find((p) => p.metadata?.plan_id === row.invited_plan)
      if (product) {
        const prices = await stripe.prices.list({ active: true, product: product.id, type: 'recurring', limit: 100 })

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
          } catch {
            // Coupon not found — show base price without discount
          }
        }

        const applyDiscount = (amount: number): number | null => {
          if (coupon_percent_off) return Math.round(amount * (1 - coupon_percent_off / 100))
          if (coupon_amount_off) return Math.max(0, amount - coupon_amount_off)
          return null
        }

        const monthPrice = prices.data.find((p) => p.recurring?.interval === 'month')
        if (monthPrice?.unit_amount) {
          pricing_month = {
            base_cents: monthPrice.unit_amount,
            discounted_cents: applyDiscount(monthPrice.unit_amount),
            coupon_duration,
            coupon_duration_months,
          }
        }

        const yearPrice = prices.data.find((p) => p.recurring?.interval === 'year')
        if (yearPrice?.unit_amount) {
          pricing_year = {
            base_cents: yearPrice.unit_amount,
            discounted_cents: applyDiscount(yearPrice.unit_amount),
            coupon_duration,
            coupon_duration_months,
          }
        }
      }
    } catch (e) {
      console.error('[transfer] Stripe pricing error:', e)
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
    initiated_by_name: row.initiated_by_name,
    // Redact the initiating email to just the domain for privacy
    initiated_by_domain: row.initiated_by_email.split('@')[1] ?? '',
  })
})
