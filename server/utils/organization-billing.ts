import { queryFirst, type DbClient } from '~/server/db'
import { getPlanEntitlements, type EntitlementsMap } from '~/server/utils/billing-entitlements'

export interface OrganizationBillingProjectionRow {
  organization_id?: string | null
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  payment_status?: string | null
  paid_through?: string | null
  past_due_since?: string | null
  last_paid_invoice_id?: string | null
  last_payment_event_created?: number | null
  last_payment_event_id?: string | null
  access_plan?: string | null
  access_expires_at?: string | null
  updated_at?: string | null
}

export interface OrganizationBillingProjection {
  organizationId: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  plan: string
  effectivePlan: string
  status: 'free' | 'active' | 'expired'
  paymentStatus: string
  paidThrough: string | null
  pastDueSince: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: false
  updatedAt: string | null
  entitlements: EntitlementsMap
}

const PLANS = new Set(['free', 'growth'])
const PAYMENT_STATUSES = new Set(['unknown', 'paid', 'processing', 'failed', 'pending', 'trialing', 'past_due'])

function optionalText(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid organization billing projection: ${field}`)
  return value
}

function optionalInstant(value: unknown, field: string): string | null {
  const text = optionalText(value, field)
  if (text !== null && Number.isNaN(Date.parse(text))) throw new Error(`Invalid organization billing projection: ${field}`)
  return text
}

export function validateOrganizationBillingProjection(
  row: OrganizationBillingProjectionRow | null | undefined,
  organizationId = row?.organization_id ?? '',
  now = new Date(),
): OrganizationBillingProjection {
  if (row?.organization_id != null && row.organization_id !== organizationId) throw new Error('Invalid organization billing projection: organization_id')
  const plan = row?.access_plan ?? 'free'
  if (!PLANS.has(plan)) throw new Error('Invalid organization billing projection: access_plan')
  const paymentStatus = row?.payment_status ?? 'unknown'
  if (!PAYMENT_STATUSES.has(paymentStatus)) throw new Error('Invalid organization billing projection: payment_status')
  const accessExpiresAt = optionalInstant(row?.access_expires_at, 'access_expires_at')
  const paidThrough = optionalInstant(row?.paid_through, 'paid_through')
  const pastDueSince = optionalInstant(row?.past_due_since, 'past_due_since')
  const effectivePlan = plan === 'free' || accessExpiresAt === null || Date.parse(accessExpiresAt) > now.getTime() ? plan : 'free'
  return {
    organizationId,
    stripeCustomerId: optionalText(row?.stripe_customer_id, 'stripe_customer_id'),
    stripeSubscriptionId: optionalText(row?.stripe_subscription_id, 'stripe_subscription_id'),
    plan,
    effectivePlan,
    status: plan === 'free' ? 'free' : effectivePlan === plan ? 'active' : 'expired',
    paymentStatus,
    paidThrough,
    pastDueSince,
    currentPeriodEnd: accessExpiresAt,
    cancelAtPeriodEnd: false,
    updatedAt: optionalInstant(row?.updated_at, 'updated_at'),
    entitlements: getPlanEntitlements(effectivePlan),
  }
}

export async function getOrganizationBillingProjection(db: DbClient, organizationId: string, now = new Date()) {
  const row = await queryFirst<OrganizationBillingProjectionRow>(db, `
    SELECT organization_id, stripe_customer_id, stripe_subscription_id, payment_status,
           paid_through, past_due_since, last_paid_invoice_id, last_payment_event_created,
           last_payment_event_id, access_plan, access_expires_at, updated_at
      FROM organization_billing WHERE organization_id = ? LIMIT 1
  `, [organizationId])
  return validateOrganizationBillingProjection(row, organizationId, now)
}
