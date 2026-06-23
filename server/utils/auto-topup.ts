import type Stripe from 'stripe'
import { getStripe } from '~/server/utils/billing'
import type { BillingEnv } from '~/server/utils/billing'
import { BUNDLE_AMOUNTS } from '~/shared/creditBundles'
import { execute, queryFirst, type DbClient } from '~/server/db'

// Minimum gap between auto top-ups for the same org to prevent concurrent charges.
const AUTO_TOPUP_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes

interface AutoTopupRow {
  auto_topup_enabled: number
  auto_topup_bundle: number
  auto_topup_threshold: number
  stripe_customer_id: string | null
}

interface CreditsRow {
  last_topped_up_at: string | null
}

/**
 * Fire-and-forget: if balance drops below the org's configured threshold and auto top-up
 * is enabled, charge the saved card and credit the account. Never throws — errors logged only.
 */
export async function triggerAutoTopupIfNeeded(
  db: DbClient,
  env: BillingEnv,
  organizationId: string,
  newBalance: number
): Promise<void> {
  if (!env.STRIPE_SECRET_KEY) return

  try {
    const billing = await queryFirst<AutoTopupRow>(db,
      `SELECT auto_topup_enabled, auto_topup_bundle, auto_topup_threshold, stripe_customer_id
       FROM organization_billing WHERE organization_id = ? LIMIT 1`,
      [organizationId],
    )

    const threshold = billing?.auto_topup_threshold ?? 100
    if (newBalance >= threshold) return

    if (!billing?.auto_topup_enabled || !billing.stripe_customer_id) return

    const bundle = billing.auto_topup_bundle ?? 500
    const amount = BUNDLE_AMOUNTS[bundle]
    if (!amount) return

    // Cooldown check — prevents concurrent/duplicate charges using last_topped_up_at.
    const credits = await queryFirst<CreditsRow>(
      db, 'SELECT last_topped_up_at FROM ai_credits WHERE organization_id = ? LIMIT 1', [organizationId],
    )

    if (credits?.last_topped_up_at) {
      const lastCharged = new Date(credits.last_topped_up_at).getTime()
      if (!Number.isNaN(lastCharged) && Date.now() - lastCharged < AUTO_TOPUP_COOLDOWN_MS) return
    }

    const stripe = getStripe(env)
    const customer = await stripe.customers.retrieve(billing.stripe_customer_id, {
      expand: ['invoice_settings.default_payment_method'],
    }) as Stripe.Customer

    const pm = customer.invoice_settings?.default_payment_method
    const pmId = typeof pm === 'string' ? pm : pm?.id
    if (!pmId) return

    // Idempotency key scoped to org + UTC date — Stripe deduplicates within 24 h.
    const dateKey = new Date().toISOString().slice(0, 10)
    const idempotencyKey = `auto_topup:${organizationId}:${dateKey}`

    const intent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      customer: billing.stripe_customer_id,
      payment_method: pmId,
      confirm: true,
      off_session: true,
      metadata: { organization_id: organizationId, type: 'auto_topup', credits: String(bundle) },
    }, { idempotencyKey })

    if (intent.status !== 'succeeded') return

    const now = new Date().toISOString()
    await execute(db,
      `INSERT INTO ai_credits (organization_id, balance, lifetime_used, last_topped_up_at, updated_at)
       VALUES (?, ?, 0, ?, ?)
       ON CONFLICT(organization_id) DO UPDATE SET
         balance = balance + excluded.balance,
         last_topped_up_at = excluded.last_topped_up_at,
         updated_at = excluded.updated_at`,
      [organizationId, bundle, now, now],
    )
  } catch (err) {
    console.error('auto_topup_failed', { organizationId, newBalance, error: err })
  }
}
