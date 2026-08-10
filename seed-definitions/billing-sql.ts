import { getPlanEntitlements } from '../server/utils/billing-entitlements.ts'

export interface SeedBillingState {
  status: string
  plan: string
}

export interface SeedAiCreditsState {
  balance: number
  lifetimeUsed: number
}

type SqlValue = (_value: string | number | boolean | null) => string

function entitlementValuesForPlan(plan: string): Record<string, string | number | boolean> {
  return getPlanEntitlements(plan)
}

function isPaidBillingState(billing: SeedBillingState): boolean {
  return billing.plan !== 'free' && billing.status !== 'free'
}

function finitePlanCreditAllowance(plan: string): number {
  const allowance = entitlementValuesForPlan(plan).ai_credits
  return typeof allowance === 'number' ? allowance : 0
}

/**
 * SQLite expressions for the current UTC Monday window. `weekday 1` is not
 * sufficient here because SQLite advances a Monday to the following Monday;
 * calculating the offset from `%w` keeps Monday itself in the active week.
 */
function currentUtcWeekSql() {
  const weekKey = `date('now', printf('-%d days', (CAST(strftime('%w', 'now') AS INTEGER) + 6) % 7))`
  return {
    weekKey,
    periodStart: `strftime('%Y-%m-%dT00:00:00.000Z', ${weekKey})`,
    periodEnd: `strftime('%Y-%m-%dT00:00:00.000Z', date(${weekKey}, '+7 days'))`,
  }
}

/**
 * Render the append-only weekly quota baseline alongside the legacy balance
 * projection. Curated fixtures must start from the same plan allowance and
 * current-week identity that runtime quota enforcement resolves.
 */
export function renderAiCreditsSql(
  organizationId: string,
  billing: SeedBillingState | null | undefined,
  aiCredits: SeedAiCreditsState | null | undefined,
  sqlValue: SqlValue,
) {
  if (!billing || !aiCredits) return ''

  const expectedBalance = finitePlanCreditAllowance(billing.plan)
  if (!Number.isSafeInteger(aiCredits.balance) || aiCredits.balance < 0) {
    throw new Error(`Seed AI balance for ${organizationId} must be a non-negative safe integer`)
  }
  if (aiCredits.balance !== expectedBalance) {
    throw new Error(
      `Seed AI balance for ${organizationId} (${aiCredits.balance}) must match ${billing.plan} allowance (${expectedBalance})`,
    )
  }
  if (!Number.isSafeInteger(aiCredits.lifetimeUsed) || aiCredits.lifetimeUsed < 0) {
    throw new Error(`Seed AI lifetime usage for ${organizationId} must be a non-negative safe integer`)
  }

  const { weekKey, periodStart, periodEnd } = currentUtcWeekSql()
  const periodKey = `('week:' || ${weekKey} || ':plan:' || ${sqlValue(billing.plan)} || ':version:seed')`
  const grantId = `('seed-plan-' || ${sqlValue(organizationId)} || ':' || ${weekKey} || ':' || ${sqlValue(billing.plan)})`
  const idempotencyKey = `('seed-plan:' || ${sqlValue(organizationId)} || ':' || ${weekKey} || ':' || ${sqlValue(billing.plan)})`
  const nowIso = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`

  return `INSERT OR REPLACE INTO ai_credits
  (organization_id, balance, lifetime_used, balance_period_key, updated_at)
VALUES
  (${sqlValue(organizationId)}, ${aiCredits.balance}, ${aiCredits.lifetimeUsed}, ${weekKey}, ${nowIso});

INSERT OR IGNORE INTO usage_quota_grants
  (id, organization_id, resource, quantity, unit, period_key, period_start,
   period_end, grant_type, reason, created_by, idempotency_key, applied_at, created_at)
VALUES
  (${grantId}, ${sqlValue(organizationId)},
   'ai_inference', ${aiCredits.balance}, 'credit', ${periodKey},
   ${periodStart}, ${periodEnd}, 'plan',
   ${sqlValue(`Seeded weekly ${billing.plan} plan quota`)}, NULL,
   ${idempotencyKey}, ${nowIso}, ${nowIso});`
}

function basePlanPriceId(plan: string): string {
  return `price_${plan}_month`
}

/**
 * Render the canonical organization billing authority used by curated local,
 * preview, and locked staging fixtures. The IDs are deterministic, while
 * period timestamps are relative to the seed execution time so a fixture does
 * not expire simply because it was regenerated months later.
 */
export function renderOrganizationBillingSql(
  organizationId: string,
  billing: SeedBillingState | null | undefined,
  sqlValue: SqlValue,
) {
  if (!billing) return ''

  const paid = isPaidBillingState(billing)
  const customerId = paid ? `cus-${organizationId}` : null
  const stripeSubscriptionId = paid ? `stripe-${organizationId}` : null
  const stripeSubscriptionItemId = paid ? `si-${organizationId}` : null
  const subscriptionId = `sub-${organizationId}`
  const invoiceId = `in-${organizationId}`
  const eventId = `evt-${organizationId}`
  const basePriceId = paid ? basePlanPriceId(billing.plan) : null
  const entitlementValues = entitlementValuesForPlan(billing.plan)
  const entitlementEntries = Object.entries(entitlementValues)
  const entitlementKeys = entitlementEntries.map(([key]) => key)
  const periodStart = `CAST(strftime('%s', 'now', '-1 day') AS INTEGER)`
  const periodStartIso = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')`
  const periodEnd = `CAST(strftime('%s', 'now', '+30 days') AS INTEGER)`
  const periodEndIso = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 days')`
  const nowIso = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
  const paymentStatus = paid ? 'paid' : 'unknown'

  const statements = [
    `DELETE FROM subscription WHERE referenceId = ${sqlValue(organizationId)};`,
    `DELETE FROM stripe_invoice_payments WHERE organization_id = ${sqlValue(organizationId)};`,
    `UPDATE organization
SET stripeCustomerId = ${sqlValue(customerId)}
WHERE id = ${sqlValue(organizationId)};`,
  ]

  if (paid) {
    statements.push(`INSERT OR REPLACE INTO subscription
  (id, plan, referenceId, stripeCustomerId, stripeSubscriptionId, status,
   periodStart, periodEnd, cancelAtPeriodEnd, seats, billingInterval, createdAt, updatedAt)
VALUES
  (${sqlValue(subscriptionId)}, ${sqlValue(billing.plan)}, ${sqlValue(organizationId)},
   ${sqlValue(customerId)}, ${sqlValue(stripeSubscriptionId)}, ${sqlValue(billing.status)},
   ${periodStart}, ${periodEnd}, 0, 1, 'month', unixepoch(), unixepoch());`)
  }

  statements.push(`INSERT OR REPLACE INTO organization_billing
  (id, organization_id, stripe_customer_id, stripe_subscription_id,
   stripe_subscription_item_id, status, plan, payment_status, paid_through,
   past_due_since, last_paid_invoice_id, last_payment_event_created,
   last_payment_event_id, current_period_end, cancel_at_period_end, updated_at)
VALUES
  (${sqlValue(`ob-${organizationId}`)}, ${sqlValue(organizationId)},
   ${sqlValue(customerId)}, ${sqlValue(stripeSubscriptionId)},
   ${sqlValue(stripeSubscriptionItemId)}, ${sqlValue(billing.status)},
   ${sqlValue(billing.plan)}, ${sqlValue(paymentStatus)},
   ${paid ? periodEndIso : 'NULL'}, NULL,
   ${paid ? sqlValue(invoiceId) : 'NULL'},
   ${paid ? `CAST(strftime('%s', 'now') AS INTEGER)` : 'NULL'},
   ${paid ? sqlValue(eventId) : 'NULL'},
   ${paid ? periodEndIso : 'NULL'}, 0, ${nowIso});`)

  if (paid) {
    statements.push(`INSERT OR REPLACE INTO stripe_invoice_payments
  (stripe_invoice_id, organization_id, stripe_subscription_id, base_plan_price_id,
   status, period_start, period_end, past_due_since, last_event_created,
   last_event_id, updated_at)
SELECT
  ${sqlValue(invoiceId)}, organization_id, stripe_subscription_id, ${sqlValue(basePriceId)},
  'paid',
  ${periodStartIso}, paid_through, NULL,
  last_payment_event_created, last_payment_event_id, ${nowIso}
FROM organization_billing
WHERE organization_id = ${sqlValue(organizationId)};`)
  }

  const organizationEntitlementRows = entitlementEntries
    .map(([key, value]) => `  (${[
      sqlValue(`org-${organizationId}-${key}`),
      sqlValue(organizationId),
      sqlValue(key),
      sqlValue(String(value)),
      sqlValue('better-auth-stripe'),
      nowIso,
      nowIso,
    ].join(', ')})`)
    .join(',\n')
  statements.push(`INSERT OR REPLACE INTO organization_entitlements
  (id, organization_id, key, value, source, created_at, updated_at)
VALUES
${organizationEntitlementRows};`)
  statements.push(`DELETE FROM organization_entitlements
WHERE organization_id = ${sqlValue(organizationId)}
  AND source = 'better-auth-stripe'
  AND key NOT IN (${entitlementKeys.map(key => sqlValue(key)).join(', ')});`)

  return statements.join('\n\n')
}

export function renderCanonicalBillingSql(
  siteId: string,
  organizationId: string,
  billing: SeedBillingState | null | undefined,
  sqlValue: SqlValue,
  aiCredits?: SeedAiCreditsState | null,
) {
  if (!billing) return ''
  return [
    renderAiCreditsSql(organizationId, billing, aiCredits, sqlValue),
    renderOrganizationBillingSql(organizationId, billing, sqlValue),
    renderSiteBillingSql(siteId, organizationId, billing, sqlValue),
    renderSiteEntitlementsSql(siteId, organizationId, billing.plan, sqlValue),
  ].filter(Boolean).join('\n\n')
}

export function renderSiteEntitlementsSql(
  siteId: string,
  organizationId: string,
  plan: string,
  sqlValue: SqlValue,
) {
  const rows = Object.entries(entitlementValuesForPlan(plan))
    .map(([key, value]) => `  (${[
      sqlValue(`sent-${siteId}-${key}`),
      sqlValue(siteId),
      sqlValue(organizationId),
      sqlValue(key),
      sqlValue(String(value)),
      sqlValue('better-auth-stripe'),
      `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    ].join(', ')})`)
    .join(',\n')

  return `INSERT OR REPLACE INTO site_entitlements
  (id, site_id, organization_id, key, value, source, created_at, updated_at)
VALUES
${rows};`
}

export function renderSiteBillingSql(
  siteId: string,
  organizationId: string,
  billing: SeedBillingState | null | undefined,
  sqlValue: SqlValue,
) {
  if (!billing) return ''
  const paid = isPaidBillingState(billing)
  const customerId = paid ? `cus-${organizationId}` : null
  const nowIso = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
  const paidThrough = paid
    ? `(SELECT paid_through FROM organization_billing WHERE organization_id = ${sqlValue(organizationId)})`
    : 'NULL'
  const paymentEventCreated = paid
    ? `(SELECT last_payment_event_created FROM organization_billing WHERE organization_id = ${sqlValue(organizationId)})`
    : 'NULL'
  const paymentEventId = paid
    ? `(SELECT last_payment_event_id FROM organization_billing WHERE organization_id = ${sqlValue(organizationId)})`
    : 'NULL'
  return `INSERT OR REPLACE INTO site_billing
  (id, site_id, organization_id, stripe_subscription_id,
   stripe_subscription_item_id, plan, status, current_period_end,
   payment_status, paid_through, past_due_since, last_paid_invoice_id,
   last_payment_event_created, last_payment_event_id, cancel_at_period_end,
   updated_at, stripe_customer_id)
VALUES
  (${sqlValue(`sb-${siteId}`)}, ${sqlValue(siteId)}, ${sqlValue(organizationId)},
   NULL, NULL, ${sqlValue(billing.plan)}, ${sqlValue(billing.status)},
   ${paidThrough}, ${sqlValue(paid ? 'paid' : 'unknown')},
   ${paidThrough}, NULL,
   ${paid ? sqlValue(`in-${organizationId}`) : 'NULL'},
   ${paymentEventCreated}, ${paymentEventId}, 0,
   ${nowIso}, ${sqlValue(customerId)});`
}
