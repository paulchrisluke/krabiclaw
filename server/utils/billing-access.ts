import type { Subscription } from '@better-auth/stripe'
import { createAuth, type CloudflareEnv } from '~/server/utils/auth'
import { betterAuthTimestampToIso } from '~/server/utils/better-auth-timestamps'
import { getPlanEntitlements, type EntitlementsMap } from '~/server/utils/billing-entitlements'

/**
 * Better Auth's Stripe plugin owns the `subscription` table — its webhook
 * handlers are the only writers — and this module is the only reader. There is
 * no second projection of subscription state.
 *
 * An organization's plan is the plan of the single `active`/`trialing` row
 * whose `periodEnd` has not passed. No qualifying row means `free`: the absence
 * of a subscription, not a substituted source. Two qualifying rows is corrupt
 * state and throws, because picking one would hide the corruption.
 */
export const FREE_PLAN = 'free'

const ORGANIZATION_CHUNK = 50
const SUBSCRIPTIONS_PER_ORGANIZATION_BOUND = 20

export async function getOrganizationPlans(
  env: CloudflareEnv,
  organizationIds: string[],
  now = new Date(),
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(organizationIds.filter(id => id.trim())))
  const plans = new Map<string, string>(uniqueIds.map(id => [id, FREE_PLAN]))
  if (uniqueIds.length === 0) return plans

  const adapter = (await createAuth(env).$context).adapter
  for (let offset = 0; offset < uniqueIds.length; offset += ORGANIZATION_CHUNK) {
    const chunk = uniqueIds.slice(offset, offset + ORGANIZATION_CHUNK)
    const limit = chunk.length * SUBSCRIPTIONS_PER_ORGANIZATION_BOUND
    const rows = await adapter.findMany<Subscription>({
      model: 'subscription',
      where: [{ field: 'referenceId', operator: 'in', value: chunk }],
      limit,
    })
    if (rows.length >= limit) {
      throw new Error('Organization subscription scan exceeded its bound')
    }
    for (const row of rows) {
      if (!plans.has(row.referenceId)) continue
      if (row.status !== 'active' && row.status !== 'trialing') continue
      if (row.periodEnd != null) {
        const periodEnd = Date.parse(betterAuthTimestampToIso(row.periodEnd, 'subscription.periodEnd'))
        if (periodEnd <= now.getTime()) continue
      }
      if (plans.get(row.referenceId) !== FREE_PLAN) {
        throw new Error(`Organization ${row.referenceId} has multiple current subscriptions`)
      }
      const plan = row.plan?.trim().toLowerCase()
      if (!plan) throw new Error(`Subscription ${row.id} has no plan`)
      plans.set(row.referenceId, plan)
    }
  }
  return plans
}

export async function getOrganizationPlan(
  env: CloudflareEnv,
  organizationId: string,
  now = new Date(),
): Promise<string> {
  const plan = (await getOrganizationPlans(env, [organizationId], now)).get(organizationId)
  if (!plan) throw new Error(`Organization ${organizationId} plan could not be resolved`)
  return plan
}

export async function getOrganizationEntitlements(
  env: CloudflareEnv,
  organizationId: string,
  now = new Date(),
): Promise<EntitlementsMap> {
  return getPlanEntitlements(await getOrganizationPlan(env, organizationId, now))
}

/**
 * Keep only the candidate rows whose organization's plan grants `entitlement`.
 * Scheduled integrations select their candidates from their own tables and then
 * filter here; they do not join subscription state into their SQL.
 */
export async function filterEntitledRows<T extends { organization_id: string }>(
  env: CloudflareEnv,
  rows: T[],
  entitlement: string,
  now = new Date(),
): Promise<T[]> {
  if (rows.length === 0) return []
  const plans = await getOrganizationPlans(env, rows.map(row => row.organization_id), now)
  const entitled = new Map<string, boolean>()
  for (const [organizationId, plan] of plans) {
    entitled.set(organizationId, getPlanEntitlements(plan)[entitlement] === true)
  }
  return rows.filter(row => entitled.get(row.organization_id) === true)
}
