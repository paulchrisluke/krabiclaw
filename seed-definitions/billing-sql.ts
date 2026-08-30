import { getPlanEntitlements } from '../server/utils/billing-entitlements.ts'

export interface SeedBillingState { status: string; plan: string }
export interface SeedAiCreditsState { balance: number; lifetimeUsed: number }
type SqlValue = (_value: string | number | boolean | null) => string

function paid(billing: SeedBillingState): boolean {
  return billing.plan !== 'free' && billing.status !== 'free'
}

function weekSql() {
  const key = `date('now', printf('-%d days', (CAST(strftime('%w', 'now') AS INTEGER) + 6) % 7))`
  return {
    key,
    start: `strftime('%Y-%m-%dT00:00:00.000Z', ${key})`,
    end: `strftime('%Y-%m-%dT00:00:00.000Z', date(${key}, '+7 days'))`,
  }
}

export function renderAiCreditsSql(
  organizationId: string,
  billing: SeedBillingState | null | undefined,
  credits: SeedAiCreditsState | null | undefined,
  sqlValue: SqlValue,
) {
  if (!billing || !credits) return ''
  const configured = getPlanEntitlements(billing.plan).ai_credits
  const allowance = typeof configured === 'number' ? configured : 0
  if (!Number.isSafeInteger(credits.balance) || credits.balance < 0 || credits.balance !== allowance) {
    throw new Error(`Seed AI balance for ${organizationId} must match the ${billing.plan} allowance (${allowance})`)
  }
  if (!Number.isSafeInteger(credits.lifetimeUsed) || credits.lifetimeUsed < 0) {
    throw new Error(`Seed AI lifetime usage for ${organizationId} must be a non-negative safe integer`)
  }
  const week = weekSql()
  const now = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
  const statements = [`INSERT OR IGNORE INTO usage_quota_grants
  (id, organization_id, resource, quantity, unit, period_key, period_start, period_end,
   grant_type, reason, created_by, idempotency_key, applied_at, created_at)
VALUES
  (${sqlValue(`seed-plan-${organizationId}`)}, ${sqlValue(organizationId)}, 'ai_inference', ${credits.balance}, 'credit',
   ('week:' || ${week.key} || ':plan:${billing.plan}:version:seed'), ${week.start}, ${week.end},
   'plan', ${sqlValue(`Seeded weekly ${billing.plan} plan quota`)}, NULL,
   ${sqlValue(`seed-plan:${organizationId}`)}, ${now}, ${now});`]
  if (credits.lifetimeUsed > 0) {
    statements.push(`INSERT OR IGNORE INTO usage_events
  (id, organization_id, site_id, resource, source, provider, channel, session_id,
   quantity, unit, metadata_json, idempotency_key, created_at)
VALUES
  (${sqlValue(`seed-history-${organizationId}`)}, ${sqlValue(organizationId)}, NULL,
   'ai_inference', 'seed', NULL, NULL, NULL, ${credits.lifetimeUsed}, 'credit',
   '{"action":"seed-history","charged":true}', ${sqlValue(`seed-history:${organizationId}`)},
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-8 days'));`)
  }
  return statements.join('\n\n')
}

export function renderOrganizationBillingSql(
  organizationId: string,
  billing: SeedBillingState | null | undefined,
  sqlValue: SqlValue,
) {
  if (!billing) return ''
  const isPaid = paid(billing)
  const customerId = isPaid ? `cus-${organizationId}` : null
  const subscriptionId = isPaid ? `stripe-${organizationId}` : null
  const periodStart = `CAST(strftime('%s', 'now', '-1 day') AS INTEGER)`
  const periodEnd = `CAST(strftime('%s', 'now', '+30 days') AS INTEGER)`
  const periodStartIso = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')`
  const periodEndIso = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 days')`
  const now = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
  const statements = [
    `DELETE FROM subscription WHERE referenceId = ${sqlValue(organizationId)};`,
    `DELETE FROM stripe_invoice_payments WHERE organization_id = ${sqlValue(organizationId)};`,
    `UPDATE organization SET stripeCustomerId = ${sqlValue(customerId)} WHERE id = ${sqlValue(organizationId)};`,
  ]
  if (isPaid) {
    statements.push(`INSERT OR REPLACE INTO subscription
  (id, plan, referenceId, stripeCustomerId, stripeSubscriptionId, status,
   periodStart, periodEnd, cancelAtPeriodEnd, seats, billingInterval, createdAt, updatedAt)
VALUES
  (${sqlValue(`sub-${organizationId}`)}, ${sqlValue(billing.plan)}, ${sqlValue(organizationId)},
   ${sqlValue(customerId)}, ${sqlValue(subscriptionId)}, ${sqlValue(billing.status)},
   ${periodStart}, ${periodEnd}, 0, 1, 'month', unixepoch(), unixepoch());`)
  }
  statements.push(`INSERT OR REPLACE INTO organization_billing
  (organization_id, stripe_customer_id, stripe_subscription_id, payment_status,
   paid_through, past_due_since, last_paid_invoice_id, last_payment_event_created,
   last_payment_event_id, access_plan, access_expires_at, updated_at)
VALUES
  (${sqlValue(organizationId)}, ${sqlValue(customerId)},
   ${sqlValue(subscriptionId)}, ${sqlValue(isPaid ? 'paid' : 'unknown')},
   ${isPaid ? periodEndIso : 'NULL'}, NULL, ${isPaid ? sqlValue(`in-${organizationId}`) : 'NULL'},
   ${isPaid ? `CAST(strftime('%s', 'now') AS INTEGER)` : 'NULL'}, ${isPaid ? sqlValue(`evt-${organizationId}`) : 'NULL'},
   ${sqlValue(isPaid ? billing.plan : 'free')}, ${isPaid ? periodEndIso : 'NULL'}, ${now});`)
  if (isPaid) {
    statements.push(`INSERT OR REPLACE INTO stripe_invoice_payments
  (stripe_invoice_id, organization_id, stripe_subscription_id, base_plan_price_id,
   status, period_start, period_end, past_due_since, last_event_created, last_event_id, updated_at)
VALUES
  (${sqlValue(`in-${organizationId}`)}, ${sqlValue(organizationId)}, ${sqlValue(subscriptionId)},
   ${sqlValue(`price_${billing.plan}_month`)}, 'paid', ${periodStartIso}, ${periodEndIso}, NULL,
   CAST(strftime('%s', 'now') AS INTEGER), ${sqlValue(`evt-${organizationId}`)}, ${now});`)
  }
  return statements.join('\n\n')
}

export function renderSiteEntitlementsSql() { return '' }
export function renderSiteBillingSql() { return '' }

export function renderCanonicalBillingSql(
  _siteId: string,
  organizationId: string,
  billing: SeedBillingState | null | undefined,
  sqlValue: SqlValue,
  credits?: SeedAiCreditsState | null,
) {
  return [
    renderAiCreditsSql(organizationId, billing, credits, sqlValue),
    renderOrganizationBillingSql(organizationId, billing, sqlValue),
  ].filter(Boolean).join('\n\n')
}
