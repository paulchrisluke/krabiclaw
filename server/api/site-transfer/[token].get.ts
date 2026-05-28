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
      `SELECT r.id, r.site_id, r.to_email, r.status, r.expires_at, r.message,
              r.invited_plan, r.invited_coupon, r.invited_domain,
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
      expires_at: string
      message: string | null
      invited_plan: string | null
      invited_coupon: string | null
      invited_domain: string | null
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

  if (new Date(row.expires_at) < new Date()) {
    await db
      .prepare(
        `UPDATE site_transfer_requests SET status = 'expired' WHERE id = ?`,
      )
      .bind(row.id)
      .run()
    return jsonResponse({ error: 'Transfer has expired', status: 'expired' }, { status: 410 })
  }

  // Fetch plan price + coupon discount from Stripe (best-effort)
  interface PricingInfo {
    base_cents: number
    discounted_cents: number | null
    coupon_duration: string | null
    coupon_duration_months: number | null
  }
  let pricing: PricingInfo | null = null

  if (row.invited_plan && env.STRIPE_SECRET_KEY) {
    try {
      const stripe = getStripe(env)
      const products = await stripe.products.list({ active: true, limit: 100 })
      const product = products.data.find((p) => p.metadata?.plan_id === row.invited_plan)
      if (product) {
        const prices = await stripe.prices.list({ active: true, product: product.id, type: 'recurring', limit: 100 })
        const price = prices.data.find((p) => p.recurring?.interval === 'month')
        if (price?.unit_amount) {
          let discounted_cents: number | null = null
          let coupon_duration: string | null = null
          let coupon_duration_months: number | null = null
          if (row.invited_coupon) {
            try {
              const coupon = await stripe.coupons.retrieve(row.invited_coupon)
              coupon_duration = coupon.duration ?? null
              coupon_duration_months = coupon.duration_in_months ?? null
              if (coupon.percent_off) {
                discounted_cents = Math.round(price.unit_amount * (1 - coupon.percent_off / 100))
              } else if (coupon.amount_off) {
                discounted_cents = Math.max(0, price.unit_amount - coupon.amount_off)
              }
            } catch {
              // Coupon not found — show base price without discount
            }
          }
          pricing = { base_cents: price.unit_amount, discounted_cents, coupon_duration, coupon_duration_months }
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
    expires_at: row.expires_at,
    message: row.message,
    invited_plan: row.invited_plan,
    invited_coupon: row.invited_coupon,
    pricing,
    invited_domain: row.invited_domain,
    site_subdomain: row.subdomain,
    initiated_by_name: row.initiated_by_name,
    // Redact the initiating email to just the domain for privacy
    initiated_by_domain: row.initiated_by_email.split('@')[1] ?? '',
  })
})
