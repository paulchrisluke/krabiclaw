// POST /api/admin/sites/[siteId]/billing/mark-paid
// For cash-paying clients: finalize the outstanding draft invoice and mark it paid out-of-band.
// Called by admin after collecting cash in person.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'
import { getStripe } from '~/server/utils/billing'
import { execute, queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const permissionDenied = await platformPermissionJsonResponse(event, env, { platform: ['billing'] })
  if (permissionDenied) return permissionDenied

  if (!env.STRIPE_SECRET_KEY) return jsonResponse({ error: 'Stripe not configured' }, { status: 503 })

  const billing = await queryFirst<{
    stripe_subscription_id: string | null
    stripe_customer_id: string | null
    plan: string | null
    local_rate: number | null
    local_currency: string | null
    payment_method: string | null
  }>(db, `
    SELECT stripe_subscription_id, stripe_customer_id, plan, local_rate, local_currency, payment_method
    FROM site_billing
    WHERE site_id = ?
    LIMIT 1
  `, [siteId])

  if (!billing) return jsonResponse({ error: 'No billing record found for this site.' }, { status: 404 })
  if (billing.payment_method !== 'cash') return jsonResponse({ error: 'This endpoint is only for cash-paying sites.' }, { status: 400 })
  if (!billing.stripe_subscription_id) return jsonResponse({ error: 'No Stripe subscription found.' }, { status: 404 })

  const stripe = getStripe(env)

  // Find the latest draft or open invoice for this subscription
  const invoices = await stripe.invoices.list({
    subscription: billing.stripe_subscription_id,
    limit: 5,
  })

  const outstanding = invoices.data.find(inv => inv.status === 'draft' || inv.status === 'open')
  if (!outstanding) {
    return jsonResponse({ error: 'No outstanding invoice found. The subscription may already be current.' }, { status: 404 })
  }

  let invoice = outstanding
  if (invoice.status === 'draft') {
    invoice = await stripe.invoices.finalizeInvoice(invoice.id)
  }

  if (invoice.status !== 'open') {
    return jsonResponse({ error: `Invoice in unexpected state after finalize: ${invoice.status}` }, { status: 500 })
  }

  const paidInvoice = await stripe.invoices.pay(invoice.id, { paid_out_of_band: true }, {
    idempotencyKey: `mark-paid-invoice-${invoice.id}`,
  })

  // Advance current_period_end by one interval based on the new invoice period
  const newPeriodEnd = paidInvoice.lines.data[0]?.period?.end
    ? new Date(paidInvoice.lines.data[0].period.end * 1000).toISOString()
    : null

  await execute(db, `
    UPDATE site_billing
    SET current_period_end = ?, last_reminder_sent_at = NULL, updated_at = ?
    WHERE site_id = ?
  `, [newPeriodEnd, new Date().toISOString(), siteId])

  return jsonResponse({
    success: true,
    invoice_id: paidInvoice.id,
    invoice_status: paidInvoice.status,
    amount_paid: paidInvoice.amount_paid,
    new_period_end: newPeriodEnd,
  })
})
