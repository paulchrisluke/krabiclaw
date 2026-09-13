import { createAuth, type CloudflareEnv } from '~/server/utils/auth'
import { execute, queryAll, type DbClient } from '~/server/db'
import { createStripePlanLoader, recordStripeEventFailure, type BetterAuthSubscriptionAdapter } from '~/server/utils/better-auth-stripe'
import type Stripe from 'stripe'
import { processStripeEvent } from '~/server/utils/stripe-event-processing'
import { createStripeClient } from '~/server/utils/stripe-client'
import { processStripeConnectEvent } from '~/server/utils/stripe-connect-events'
import { MAX_STRIPE_WEBHOOK_ATTEMPTS, recordStripeWebhookEventFailure, type StripeWebhookProcessor } from '~/server/utils/stripe-webhook-events'
import { expireStripeGa4Intents } from '~/server/utils/stripe-ga4-intents'
import { defineScheduledTask } from '~/server/utils/scheduled-task'
import {
  assertStripeProviderMode,
  reconcileOrganizationSubscription,
  type BetterAuthSubscriptionReadAdapter,
  type OrganizationReconciliationProviderMode,
} from '~/server/utils/organization-subscription-reconciliation'

interface StripeTaskContext {
  cloudflare?: { env?: ApiRecord }
}

interface RetryableStripeEvent {
  stripe_event_id: string
  payload: string | null
  processor: StripeWebhookProcessor
}

interface StripeTaskResult {
  organizations: number
  drifted: number
  requeued: number
  checked: number
  processed: number
  failed: number
  skipped?: string
}

type ReconciliationAdapter = BetterAuthSubscriptionAdapter & BetterAuthSubscriptionReadAdapter

interface BetterAuthSubscriptionReference {
  referenceId: string | null
}

interface BetterAuthOrganizationRow {
  id: string
  stripeCustomerId: string | null
}

const SUBSCRIPTION_SCAN_LIMIT = 1000

/**
 * Compare every subscribed organization's billing projection against Better
 * Auth and Stripe. A report that is not a match is logged, and the
 * organization's retained dead-lettered webhook events are put back in the
 * queue so the retry loop below replays them through the canonical event
 * path. A dead-lettered `invoice.paid` used to sit silently while the next
 * subscription event reprojected the organization from a stale paid_through
 * to `free`: Pottery House paid on 2026-09-04 and lost Growth on 2026-09-07
 * until the event was requeued by hand.
 */
async function reconcileSubscribedOrganizations(
  db: DbClient,
  stripe: Stripe,
  adapter: ReconciliationAdapter,
  secretKey: string,
  loadPlans: ReturnType<typeof createStripePlanLoader>,
): Promise<Pick<StripeTaskResult, 'organizations' | 'drifted' | 'requeued'>> {
  const providerMode: OrganizationReconciliationProviderMode = /^(?:sk|rk)_live_/.test(secretKey) ? 'live' : 'test'
  assertStripeProviderMode(secretKey, providerMode)
  // The task reads with the Worker's own key, so the account it must match is
  // the account that key belongs to.
  const account = await stripe.accounts.retrieve(null) as unknown as Stripe.Account
  const subscriptions = await adapter.findMany<BetterAuthSubscriptionReference>({
    model: 'subscription',
    limit: SUBSCRIPTION_SCAN_LIMIT,
    sortBy: { field: 'id', direction: 'asc' },
  })
  if (subscriptions.length >= SUBSCRIPTION_SCAN_LIMIT) {
    throw new Error(`Better Auth subscription scan reached ${SUBSCRIPTION_SCAN_LIMIT} rows; the hourly reconciliation needs paging`)
  }
  const organizationIds = [...new Set(subscriptions.map(row => row.referenceId).filter((id): id is string => Boolean(id)))].sort()
  let drifted = 0
  let requeued = 0
  for (const organizationId of organizationIds) {
    const organization = await adapter.findOne<BetterAuthOrganizationRow>({
      model: 'organization',
      where: [{ field: 'id', value: organizationId }],
    })
    if (!organization) {
      console.error('stripe_reconciliation_organization_missing', { organizationId })
      drifted += 1
      continue
    }
    const report = await reconcileOrganizationSubscription({
      db,
      stripe,
      adapter,
      organization: { id: organization.id, stripeCustomerId: organization.stripeCustomerId },
      request: { organizationId, providerMode, expectedStripeAccountId: account.id },
      actor: 'scheduled:stripe-reconciliation',
      providerModeVerified: true,
      loadPlans,
    })
    if (report.status === 'match') continue
    drifted += 1
    console.error('stripe_reconciliation_drift', {
      organizationId,
      status: report.status,
      drifts: report.drifts.map(drift => `${drift.code}:${drift.subject}`),
    })
    const customerIds = [...new Set([
      organization.stripeCustomerId,
      report.provider.customer.id,
      ...report.betterAuth.subscriptions.map(subscription => subscription.stripeCustomerId),
    ].filter((id): id is string => Boolean(id)))]
    for (const customerId of customerIds) {
      const result = await execute(db, `
        UPDATE stripe_webhook_events
        SET status = 'pending', attempt_count = 0, error = NULL,
            dead_lettered_at = NULL, next_attempt_at = NULL
        WHERE status = 'dead_letter'
          AND payload IS NOT NULL
          AND json_extract(payload, '$.data.object.customer') = ?
      `, [customerId])
      requeued += Number(result?.meta.changes ?? 0)
    }
  }
  return { organizations: organizationIds.length, drifted, requeued }
}

const STRIPE_EVENT_PAYLOAD_RETENTION_MS = 90 * 24 * 60 * 60 * 1000

async function clearExpiredStripeEventPayloads(db: DbClient, now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - STRIPE_EVENT_PAYLOAD_RETENTION_MS).toISOString()
  await execute(db, `
    UPDATE stripe_webhook_events
    SET payload = NULL
    WHERE status IN ('processed', 'dead_letter')
      AND created_at < ?
      AND payload IS NOT NULL
  `, [cutoff])
}

export default defineScheduledTask({
  meta: {
    name: 'billing:stripe-reconciliation',
    description: 'Reconcile subscribed organizations against Better Auth and Stripe, then retry Stripe events whose projection did not complete',
  },
  async run({ context }): Promise<{ result: StripeTaskResult }> {
    const env = (context as StripeTaskContext | undefined)?.cloudflare?.env ?? {}
    const db = env.DB as DbClient | undefined
    const empty: StripeTaskResult = { organizations: 0, drifted: 0, requeued: 0, checked: 0, processed: 0, failed: 0 }
    if (!db && import.meta.dev) return { result: { ...empty, skipped: 'DB unavailable in local scheduled task context' } }
    if (!db) throw new Error('DB is required')
    if (!env.STRIPE_SECRET_KEY) return { result: { ...empty, skipped: 'STRIPE_SECRET_KEY is not configured' } }

    const stripe = createStripeClient(env.STRIPE_SECRET_KEY)
    const loadStripePlans = createStripePlanLoader(stripe, env)
    const auth = createAuth(env as CloudflareEnv)
    const authContext = await auth.$context
    const adapter = authContext.adapter as unknown as ReconciliationAdapter
    await clearExpiredStripeEventPayloads(db)
    await expireStripeGa4Intents(db)
    const reconciled = await reconcileSubscribedOrganizations(db, stripe, adapter, env.STRIPE_SECRET_KEY, loadStripePlans)
    const events = await queryAll<RetryableStripeEvent>(db, `
      SELECT stripe_event_id, payload, processor
      FROM stripe_webhook_events
      WHERE attempt_count < ?
        AND status IN ('failed', 'pending')
        AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
        AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, created_at
      LIMIT 100
    `, [MAX_STRIPE_WEBHOOK_ATTEMPTS, new Date().toISOString(), new Date().toISOString()])

    let processed = 0
    let failed = 0
    for (const row of events) {
      if (!row.payload) {
        if (row.processor === 'platform_billing') {
          await recordStripeEventFailure(db, row.stripe_event_id, 'Stripe webhook payload is missing after retention cleanup')
        } else {
          await recordStripeWebhookEventFailure(db, row.processor, row.stripe_event_id, 'Stripe webhook payload is missing after retention cleanup')
        }
        failed += 1
        continue
      }

      try {
        let claimed: boolean
        if (row.processor === 'connect_marketplace') {
          const notification = stripe.parseEventNotificationWithoutVerification(row.payload)
          claimed = await processStripeConnectEvent(db, stripe, notification, row.payload)
        } else {
          const event = JSON.parse(row.payload) as Stripe.Event
          claimed = await processStripeEvent(env as CloudflareEnv, db, event, stripe, adapter, loadStripePlans)
        }
        if (claimed) processed += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (row.processor === 'platform_billing') await recordStripeEventFailure(db, row.stripe_event_id, message)
        else await recordStripeWebhookEventFailure(db, row.processor, row.stripe_event_id, message)
        failed += 1
        console.error('stripe_reconciliation_event_failed', {
          stripeEventId: row.stripe_event_id,
          processor: row.processor,
          error: message,
        })
      }
    }

    return { result: { ...reconciled, checked: events.length, processed, failed } }
  },
})
