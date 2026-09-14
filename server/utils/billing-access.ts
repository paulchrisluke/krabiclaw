import type { Subscription } from '@better-auth/stripe'
import { HTTPError } from 'nitro'
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
 * state and throws SUBSCRIPTION_STATE_INVALID, because picking one would hide
 * the corruption; callers that serve other organizations too (scheduled
 * scans, public locale checks) refuse that organization and go on.
 */
export const FREE_PLAN = 'free'
export const SUBSCRIPTION_STATE_INVALID = 'SUBSCRIPTION_STATE_INVALID'

const ORGANIZATION_CHUNK = 50

export function isSubscriptionStateInvalid(error: unknown): boolean {
  return error instanceof HTTPError && error.data?.code === SUBSCRIPTION_STATE_INVALID
}

function subscriptionStateInvalid(organizationId: string, detail: string): never {
  throw new HTTPError({
    statusCode: 409,
    statusMessage: `Organization ${organizationId} ${detail}`,
    data: { code: SUBSCRIPTION_STATE_INVALID, organization_id: organizationId },
  })
}

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
    const rows = await adapter.findMany<Subscription>({ model: 'subscription', where: [{ field: 'referenceId', operator: 'in', value: chunk }] })
    const current = new Set<string>()
    for (const row of rows) {
      if (!plans.has(row.referenceId)) continue
      if (row.status !== 'active' && row.status !== 'trialing') continue
      if (row.periodEnd != null) {
        const periodEnd = Date.parse(betterAuthTimestampToIso(row.periodEnd, 'subscription.periodEnd'))
        if (periodEnd <= now.getTime()) continue
      }
      if (current.has(row.referenceId)) subscriptionStateInvalid(row.referenceId, 'has multiple current subscriptions')
      current.add(row.referenceId)
      const plan = row.plan?.trim().toLowerCase()
      if (!plan) subscriptionStateInvalid(row.referenceId, `subscription ${row.id} has no plan`)
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
  const organizationIds = Array.from(new Set(rows.map(row => row.organization_id)))
  let plans: Map<string, string>
  try {
    plans = await getOrganizationPlans(env, organizationIds, now)
  } catch (error) {
    if (!isSubscriptionStateInvalid(error)) throw error
    // One organization's corrupt subscription state is that organization's
    // problem: it is logged and left out, and every other organization in the
    // scan is still served.
    plans = new Map()
    for (const organizationId of organizationIds) {
      try {
        plans.set(organizationId, await getOrganizationPlan(env, organizationId, now))
      } catch (single) {
        if (!isSubscriptionStateInvalid(single)) throw single
        console.error('organization_subscription_state_invalid', { organizationId, error: single instanceof Error ? single.message : String(single) })
      }
    }
  }
  const entitled = new Map<string, boolean>()
  for (const [organizationId, plan] of plans) {
    entitled.set(organizationId, getPlanEntitlements(plan)[entitlement] === true)
  }
  return rows.filter(row => entitled.get(row.organization_id) === true)
}
