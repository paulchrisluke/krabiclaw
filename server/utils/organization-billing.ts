import { queryFirst, type DbClient } from '~/server/db'
import { getEffectiveAccessPlan } from '~/server/utils/billing-access'
import { getPlanEntitlements, type EntitlementsMap } from '~/server/utils/billing-entitlements'
import { KNOWN_RECURRING_PLAN_IDS, STARTER_PLAN_ID } from '~/shared/billing-model'

/**
 * The app-owned billing projection.  Better Auth/Stripe rows are inputs to
 * the projection writer, never a runtime source for access or quota reads.
 */
export interface OrganizationBillingProjectionRow {
  organization_id?: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  plan: string | null
  status: string | null
  payment_status: string | null
  paid_through: string | null
  past_due_since: string | null
  current_period_end: string | null
  cancel_at_period_end: unknown
  updated_at: string | null
}

export interface OrganizationBillingProjection {
  organizationId: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  plan: string
  effectivePlan: string
  status: string
  paymentStatus: string
  paidThrough: string | null
  pastDueSince: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  updatedAt: string | null
  entitlements: EntitlementsMap
}

const KNOWN_BILLING_PLANS = new Set<string>([STARTER_PLAN_ID, ...KNOWN_RECURRING_PLAN_IDS])
const KNOWN_SUBSCRIPTION_STATUSES = new Set([
  'free',
  'active',
  'trialing',
  'past_due',
  'canceled',
  'cancelled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused',
  'pending',
  'processing',
  'inactive',
])
const KNOWN_PAYMENT_STATUSES = new Set(['unknown', 'paid', 'processing', 'failed', 'pending', 'trialing', 'past_due'])

function invalidProjection(message: string): never {
  throw new Error(`Invalid organization billing projection: ${message}.`)
}

function parseNullableId(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || !value.trim()) invalidProjection(`${label} must be a non-empty string`)
  return value.trim()
}

function parseNullableDate(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    invalidProjection(`${label} must be a valid date`)
  }
  return value
}

function parseCancelAtPeriodEnd(value: unknown): boolean | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number' && (value === 0 || value === 1)) return value === 1
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1') return true
    if (normalized === 'false' || normalized === '0') return false
  }
  invalidProjection('cancel_at_period_end must be a boolean')
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

/**
 * Validate and normalize one organization_billing row.  A missing row or a
 * row whose subscription projection is entirely null is intentional Starter
 * state.  Once any state is present, all state fields must be well-formed so
 * malformed or contradictory access cannot silently become paid access.
 */
export function validateOrganizationBillingProjection(
  row: OrganizationBillingProjectionRow | null | undefined,
  organizationId = row?.organization_id ?? '',
  now = new Date(),
): OrganizationBillingProjection {
  const rowOrganizationId = row?.organization_id
  if (rowOrganizationId !== undefined && rowOrganizationId !== null && rowOrganizationId !== organizationId) {
    invalidProjection('organization_id does not match the requested organization')
  }

  if (!row) return starterProjection(organizationId)

  const stripeCustomerId = parseNullableId(row.stripe_customer_id, 'stripe_customer_id')
  const stripeSubscriptionId = parseNullableId(row.stripe_subscription_id, 'stripe_subscription_id')
  const cancelAtPeriodEnd = parseCancelAtPeriodEnd(row.cancel_at_period_end)
  const updatedAt = parseNullableDate(row.updated_at, 'updated_at')
  const stateValues = [row.plan, row.status, row.payment_status, row.paid_through, row.past_due_since, row.current_period_end]
  const stateIsAllNull = stateValues.every(isBlank)

  if (stateIsAllNull) {
    // A customer can exist before its first subscription.  A subscription ID
    // without state is contradictory and cannot be used for access decisions.
    if (stripeSubscriptionId !== null) invalidProjection('stripe_subscription_id requires subscription state')
    if (cancelAtPeriodEnd === true) invalidProjection('cancel_at_period_end requires subscription state')
    return starterProjection(organizationId, {
      stripeCustomerId,
      updatedAt,
      cancelAtPeriodEnd: cancelAtPeriodEnd ?? false,
    })
  }

  // Boundary fields are intentionally nullable for non-trialing or non-paid
  // states.  Validate plan/status first so a missing trial boundary reports
  // the actionable boundary error rather than an unrelated missing field.
  if ([row.plan, row.status].some(isBlank)) invalidProjection('subscription projection fields are incomplete')
  const plan = parseRequiredEnum(row.plan, 'plan', KNOWN_BILLING_PLANS)
  const status = parseRequiredEnum(row.status, 'status', KNOWN_SUBSCRIPTION_STATUSES)
  const paidThrough = parseNullableDate(row.paid_through, 'paid_through')
  const pastDueSince = parseNullableDate(row.past_due_since, 'past_due_since')
  const currentPeriodEnd = parseNullableDate(row.current_period_end, 'current_period_end')

  if (stripeSubscriptionId !== null && stripeCustomerId === null) {
    invalidProjection('stripe_subscription_id requires stripe_customer_id')
  }
  if (status === 'free' && plan !== 'free') invalidProjection('free status cannot use a paid plan')
  if (stripeSubscriptionId !== null && (plan === 'free' || status === 'free')) {
    invalidProjection('stripe_subscription_id cannot use free subscription state')
  }
  if (status === 'trialing' && currentPeriodEnd === null) {
    invalidProjection('trialing subscriptions require current_period_end')
  }
  if (isBlank(row.payment_status)) invalidProjection('subscription projection fields are incomplete')
  const paymentStatus = parseRequiredEnum(row.payment_status, 'payment_status', KNOWN_PAYMENT_STATUSES)
  if (status === 'active' && paymentStatus === 'paid' && paidThrough === null) {
    invalidProjection('paid active subscriptions require paid_through')
  }
  if (plan !== 'free' && stripeSubscriptionId === null) {
    invalidProjection('paid plan requires stripe_subscription_id')
  }
  if (plan !== 'free' && stripeCustomerId === null) {
    invalidProjection('paid plan requires stripe_customer_id')
  }

  const effectivePlan = getEffectiveAccessPlan({
    plan,
    status,
    paymentStatus,
    paidThrough,
    pastDueSince,
    periodEnd: currentPeriodEnd,
    trialEnd: status === 'trialing' ? currentPeriodEnd : null,
  }, now)
  return {
    organizationId,
    stripeCustomerId,
    stripeSubscriptionId,
    plan,
    effectivePlan,
    status,
    paymentStatus,
    paidThrough,
    pastDueSince,
    currentPeriodEnd,
    cancelAtPeriodEnd: cancelAtPeriodEnd ?? false,
    updatedAt,
    entitlements: getPlanEntitlements(effectivePlan),
  }
}

function parseRequiredEnum(value: unknown, label: string, known: Set<string>): string {
  if (typeof value !== 'string' || !value.trim() || !known.has(value.trim())) {
    invalidProjection(`unknown ${label}`)
  }
  return value.trim()
}

function starterProjection(
  organizationId: string,
  overrides: Partial<Pick<OrganizationBillingProjection, 'stripeCustomerId' | 'updatedAt' | 'cancelAtPeriodEnd'>> = {},
): OrganizationBillingProjection {
  return {
    organizationId,
    stripeCustomerId: overrides.stripeCustomerId ?? null,
    stripeSubscriptionId: null,
    plan: 'free',
    effectivePlan: 'free',
    status: 'free',
    paymentStatus: 'unknown',
    paidThrough: null,
    pastDueSince: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: overrides.cancelAtPeriodEnd ?? false,
    updatedAt: overrides.updatedAt ?? null,
    entitlements: getPlanEntitlements('free'),
  }
}

export async function getOrganizationBillingProjection(
  db: DbClient,
  organizationId: string,
  now = new Date(),
): Promise<OrganizationBillingProjection> {
  const row = await queryFirst<OrganizationBillingProjectionRow>(db, `
    SELECT organization_id, stripe_customer_id, stripe_subscription_id,
           plan, status, payment_status, paid_through, past_due_since,
           current_period_end, cancel_at_period_end, updated_at
      FROM organization_billing
     WHERE organization_id = ?
     LIMIT 1
  `, [organizationId])
  return validateOrganizationBillingProjection(row, organizationId, now)
}
