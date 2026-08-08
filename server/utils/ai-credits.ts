import { execute, executeBatch, queryFirst, type DbClient } from '~/server/db'
import {
  getCurrentCreditGrantProjection,
  grantQuota,
} from '~/server/utils/usage-metering'
import { getPlanEntitlements } from '~/server/utils/billing-entitlements'
import { getEffectiveAccessPlan } from '~/server/utils/billing-access'

// Credit system: 1 credit = 1,000 tokens (input + output combined).

const CREDITS_PER_1K_TOKENS = 1

export interface AiQuotaStatus {
  plan: string
  balance: number
  weeklyLimit: number | null
  weeklyUsed: number
  weeklyRemaining: number | null
  sessionLimit: number | null
  sessionUsed: number
  sessionRemaining: number | null
  periodStart: string
  periodEnd: string
  grantQuantity: number | null
  unlimited: boolean
  reconciliationRequired: boolean
}

interface CreditRow {
  balance: number
  lifetime_used: number
  balance_period_key: string | null
}

export function utcWeekStart(now = new Date()): Date {
  const start = new Date(now)
  start.setUTCHours(0, 0, 0, 0)
  const day = start.getUTCDay()
  start.setUTCDate(start.getUTCDate() - ((day + 6) % 7))
  return start
}

export function utcWeekEnd(now = new Date()): Date {
  const end = utcWeekStart(now)
  end.setUTCDate(end.getUTCDate() + 7)
  return end
}

export function utcWeekKey(now = new Date()): string {
  return utcWeekStart(now).toISOString().slice(0, 10)
}

interface OrganizationPlanInfo {
  plan: string
  version: string
}

interface BillingProjectionRow {
  plan: string | null
  status: string | null
  payment_status: string | null
  paid_through: string | null
  past_due_since: string | null
  current_period_end: string | null
  updated_at: string | null
}

const KNOWN_BILLING_PLANS = new Set(['free', 'growth', 'managed', 'seo_accelerator'])
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

function validateBillingProjection(row: BillingProjectionRow): void {
  const subscriptionFields = [
    row.plan,
    row.status,
    row.payment_status,
    row.paid_through,
    row.past_due_since,
    row.current_period_end,
  ]
  if (subscriptionFields.every(value => value === null || value === undefined || value.trim() === '')) return

  const plan = row.plan?.trim()
  if (!plan || !KNOWN_BILLING_PLANS.has(plan)) {
    throw new Error('Invalid organization billing projection: unknown plan.')
  }
  const status = row.status?.trim()
  if (!status || !KNOWN_SUBSCRIPTION_STATUSES.has(status)) {
    throw new Error('Invalid organization billing projection: unknown subscription status.')
  }
  const paymentStatus = row.payment_status?.trim()
  if (paymentStatus && !KNOWN_PAYMENT_STATUSES.has(paymentStatus)) {
    throw new Error('Invalid organization billing projection: unknown payment status.')
  }

  const parseBoundary = (value: string | null, label: string): Date | null => {
    if (value === null || value.trim() === '') return null
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid organization billing projection: ${label} must be a valid date.`)
    }
    return parsed
  }
  const paidThrough = parseBoundary(row.paid_through, 'paid_through')
  parseBoundary(row.past_due_since, 'past_due_since')
  const periodEnd = parseBoundary(row.current_period_end, 'current_period_end')
  parseBoundary(row.updated_at, 'updated_at')
  if (status === 'trialing' && periodEnd === null) {
    throw new Error('Invalid organization billing projection: trialing subscriptions require current_period_end.')
  }
  if (status === 'active' && paymentStatus === 'paid' && paidThrough === null) {
    throw new Error('Invalid organization billing projection: paid active subscriptions require paid_through.')
  }
}

async function getOrganizationPlanInfo(db: DbClient, organizationId: string, now = new Date()): Promise<OrganizationPlanInfo> {
  const billing = await queryFirst<BillingProjectionRow>(db, `
    SELECT plan, status, payment_status, paid_through, past_due_since,
           current_period_end, updated_at
    FROM organization_billing
    WHERE organization_id = ?
    LIMIT 1
  `, [organizationId])
  if (!billing) return { plan: 'free', version: 'free' }
  validateBillingProjection(billing)
  if (billing.plan === null || billing.status === null) return { plan: 'free', version: 'free' }
  const trialEnd = billing.status === 'trialing' ? billing.current_period_end : null
  return {
    plan: getEffectiveAccessPlan({
      plan: billing.plan,
      status: billing.status,
      paymentStatus: billing.payment_status,
      paidThrough: billing.paid_through,
      pastDueSince: billing.past_due_since,
      periodEnd: billing.current_period_end,
      trialEnd,
    }, now),
    version: String(billing.updated_at ?? billing.plan ?? 'free'),
  }
}

async function ensurePlanCreditAllowance(db: DbClient, organizationId: string, now = new Date()): Promise<CreditRow> {
  const { plan, version } = await getOrganizationPlanInfo(db, organizationId, now)
  const entitlements = getPlanEntitlements(plan)
  const weeklyLimit = typeof entitlements.ai_credits === 'number' ? entitlements.ai_credits : null
  const periodKey = utcWeekKey(now)
  const periodStart = utcWeekStart(now).toISOString()
  const periodEnd = utcWeekEnd(now).toISOString()
  const nowIso = now.toISOString()
  const existing = await queryFirst<CreditRow>(db, `
    SELECT balance, lifetime_used, balance_period_key
    FROM ai_credits WHERE organization_id = ? LIMIT 1
  `, [organizationId])

  if (!existing) {
    await execute(db, `
      INSERT OR IGNORE INTO ai_credits
        (organization_id, balance, lifetime_used, last_topped_up_at, balance_period_key, updated_at)
      VALUES (?, ?, 0, ?, ?, ?)
    `, [organizationId, weeklyLimit ?? 0, weeklyLimit === null ? null : nowIso, periodKey, nowIso])
  }

  if (existing?.balance_period_key === null) return existing

  const projection = await getCurrentCreditGrantProjection(db, organizationId, now)
  const latestBaseline = projection.baselineCreatedAt
    ? await queryFirst<{ period_key: string; grant_type: 'plan' | 'reset' }>(db, `
        SELECT period_key, grant_type
        FROM usage_quota_grants
        WHERE organization_id = ?
          AND resource = 'ai_inference'
          AND unit = 'credit'
          AND grant_type IN ('plan', 'reset')
          AND created_at = ?
        ORDER BY id DESC
        LIMIT 1
      `, [organizationId, projection.baselineCreatedAt])
    : null
  const desiredPeriodKey = `week:${periodKey}:plan:${plan}:version:${version}`
  const previousBaselineMarker = projection.baselineCreatedAt ?? 'none'
  const samePlanBaseline = latestBaseline?.grant_type === 'plan'
    && latestBaseline.period_key.startsWith(`week:${periodKey}:plan:${plan}:`)
  const precedingPlan = latestBaseline?.grant_type === 'reset' && projection.baselineCreatedAt
    ? await queryFirst<{ period_key: string }>(db, `
        SELECT period_key
        FROM usage_quota_grants
        WHERE organization_id = ?
          AND resource = 'ai_inference'
          AND unit = 'credit'
          AND grant_type = 'plan'
          AND period_start = ?
          AND created_at < ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `, [organizationId, projection.periodStart, projection.baselineCreatedAt])
    : null
  const resetPlan = precedingPlan?.period_key.match(/:plan:([^:]+)(?::|$)/)?.[1] ?? null
  const planTransitionAfterReset = latestBaseline?.grant_type === 'reset'
    && resetPlan !== null
    && resetPlan !== plan
  const shouldGrant = !latestBaseline
    || (latestBaseline.grant_type === 'plan' && !samePlanBaseline)
    || (latestBaseline.grant_type === 'reset' && planTransitionAfterReset)
  if (shouldGrant) {
    const previousBaselineTime = projection.baselineCreatedAt ? Date.parse(projection.baselineCreatedAt) : Number.NaN
    const grantCreatedAt = Number.isFinite(previousBaselineTime) && previousBaselineTime >= now.getTime()
      ? new Date(previousBaselineTime + 1).toISOString()
      : nowIso
    await grantQuota(db, {
      organizationId,
      resource: 'ai_inference',
      quantity: weeklyLimit ?? 0,
      unit: 'credit',
      periodKey: desiredPeriodKey,
      periodStart,
      periodEnd,
      grantType: 'plan',
      reason: `Weekly ${plan} plan quota`,
      idempotencyKey: `plan:${organizationId}:${periodKey}:${plan}:${version}:after:${previousBaselineMarker}`,
      createdAt: grantCreatedAt,
    })
  }

  const projectedAllowance = await getCurrentCreditGrantProjection(db, organizationId, now)
  const quotaUsageStart = projectedAllowance.consumptionStart ?? periodStart
  const quotaUsed = await currentQuotaUsage(db, organizationId, quotaUsageStart, periodEnd)
  const derivedBalance = weeklyLimit === null || projectedAllowance.grantQuantity === null
    ? 0
    : Math.max(0, projectedAllowance.grantQuantity - quotaUsed)
  await execute(db, `
    UPDATE ai_credits
    SET balance = ?,
        balance_period_key = CASE WHEN balance_period_key IS NULL THEN NULL ELSE ? END,
        updated_at = ?
    WHERE organization_id = ?
  `, [derivedBalance, existing?.balance_period_key === null ? null : periodKey, nowIso, organizationId])

  const row = await queryFirst<CreditRow>(db, `
    SELECT balance, lifetime_used, balance_period_key
    FROM ai_credits WHERE organization_id = ? LIMIT 1
  `, [organizationId])
  if (!row) throw new Error('AI credits row missing for organization.')
  return row
}

async function currentWeeklyUsage(db: DbClient, organizationId: string, periodStart: string, periodEnd: string): Promise<number> {
  return await currentQuotaUsage(db, organizationId, periodStart, periodEnd)
}

async function currentQuotaUsage(db: DbClient, organizationId: string, periodStart: string, periodEnd: string): Promise<number> {
  const weekly = await queryFirst<{ total: number | null }>(db, `
    SELECT COALESCE(SUM(quantity), 0) AS total
    FROM usage_events
    WHERE organization_id = ?
      AND unit = 'credit'
      AND created_at >= ?
      AND created_at < ?
  `, [organizationId, periodStart, periodEnd])
  return Number(weekly?.total ?? 0)
}

export function tokensToCredits(inputTokens: number, outputTokens: number): number {
  // Output tokens cost ~5× more than input (Claude claude-sonnet-4-6 pricing).
  // Normalize: 1 output token = 5 input token equivalents, then divide by 1000.
  const normalizedTokens = inputTokens + outputTokens * 5
  return Math.ceil(normalizedTokens / 1000) * CREDITS_PER_1K_TOKENS
}

// Flat per-action credit costs for non-token-based external API usage
// (WhatsApp Business API sends, Google Places API calls) that has real
// per-call cost but no natural token count. These consume the same
// subscription-backed usage quota as token-based AI work.
export const ACTION_CREDIT_COSTS = {
  whatsapp_notification: 2,
  whatsapp_free_text: 1,
  google_places_search: 2,
  google_places_details: 3, // bundles the photo fetch getPlaceDetails triggers
} as const

export type FlatCreditAction = keyof typeof ACTION_CREDIT_COSTS

function flatUsageWasCharged(metadataJson: string | null | undefined): boolean {
  if (!metadataJson) return false
  try {
    return JSON.parse(metadataJson).charged === true
  } catch {
    return false
  }
}

export function usageForFlatCreditAction(action: FlatCreditAction): {
  resource: 'messaging' | 'maps_api'
  source: string
  provider: string
  channel: string
  unit: 'credit'
} {
  if (action.startsWith('whatsapp_')) {
    return {
      resource: 'messaging',
      source: 'notification',
      provider: 'meta',
      channel: 'whatsapp',
      unit: 'credit',
    }
  }
  return {
    resource: 'maps_api',
    source: 'places',
    provider: 'google',
    channel: 'api',
    unit: 'credit',
  }
}

/** Returns current balance, creating the row with signup credits if new org */
export async function getOrCreateCredits(
  db: DbClient,
  organizationId: string,
  now = new Date(),
): Promise<{ balance: number; lifetime_used: number }> {
  const row = await ensurePlanCreditAllowance(db, organizationId, now)
  return { balance: row.balance, lifetime_used: row.lifetime_used }
}

export async function getAiQuotaStatus(
  db: DbClient,
  organizationId: string,
  sessionId?: string | null,
  now = new Date(),
): Promise<AiQuotaStatus> {
  const { plan } = await getOrganizationPlanInfo(db, organizationId, now)
  const entitlements = getPlanEntitlements(plan)
  const weeklyLimit = typeof entitlements.ai_credits === 'number' ? entitlements.ai_credits : null
  const sessionLimit = typeof entitlements.ai_session_credits === 'number' ? entitlements.ai_session_credits : null
  const credits = await ensurePlanCreditAllowance(db, organizationId, now)
  const periodStart = utcWeekStart(now).toISOString()
  const periodEnd = utcWeekEnd(now).toISOString()
  const weeklyUsed = await currentWeeklyUsage(db, organizationId, periodStart, periodEnd)
  const session = sessionId
    ? await queryFirst<{ total: number | null }>(db, `
        SELECT COALESCE(SUM(quantity), 0) AS total
        FROM usage_events
        WHERE organization_id = ?
          AND resource = 'ai_inference'
          AND unit = 'credit'
          AND session_id = ?
          AND created_at >= ?
          AND created_at < ?
      `, [organizationId, sessionId, periodStart, periodEnd])
    : null
  const sessionUsed = Number(session?.total ?? 0)
  const projection = await getCurrentCreditGrantProjection(db, organizationId, now)
  const reconciliationRequired = credits.balance_period_key === null
  const allowance = reconciliationRequired
    ? null
    : weeklyLimit === null ? null : projection.grantQuantity ?? weeklyLimit
  const quotaUsed = reconciliationRequired
    ? 0
    : await currentQuotaUsage(db, organizationId, projection.consumptionStart ?? periodStart, periodEnd)

  return {
    plan,
    balance: credits.balance,
    weeklyLimit,
    weeklyUsed,
    weeklyRemaining: reconciliationRequired ? 0 : allowance === null ? null : Math.max(0, allowance - quotaUsed),
    sessionLimit,
    sessionUsed,
    sessionRemaining: sessionLimit === null ? null : Math.max(0, sessionLimit - sessionUsed),
    periodStart,
    periodEnd,
    grantQuantity: reconciliationRequired ? null : allowance,
    unlimited: !reconciliationRequired && weeklyLimit === null,
    reconciliationRequired,
  }
}

export async function assertAiQuotaAvailable(
  db: DbClient,
  organizationId: string,
  quantity: number,
  sessionId?: string | null,
  now = new Date(),
): Promise<AiQuotaStatus> {
  const status = await getAiQuotaStatus(db, organizationId, sessionId, now)
  if (status.reconciliationRequired) {
    throw new Error('AI quota requires approved reconciliation before use.')
  }
  if (status.weeklyRemaining !== null && status.weeklyRemaining < quantity) {
    throw new Error('AI weekly quota has been reached.')
  }
  if (status.sessionRemaining !== null && status.sessionRemaining < quantity) {
    throw new Error('AI session quota has been reached.')
  }
  if (status.weeklyLimit !== null && status.balance < quantity) {
    throw new Error('Insufficient AI credits remaining.')
  }
  return status
}

/** Returns true if the organization and current session can use AI. */
export async function hasCredits(
  db: DbClient,
  organizationId: string,
  sessionId?: string | null,
  now = new Date(),
): Promise<boolean> {
  const status = await getAiQuotaStatus(db, organizationId, sessionId, now)
  return (status.weeklyRemaining === null || status.weeklyRemaining > 0)
    && (status.sessionRemaining === null || status.sessionRemaining > 0)
    && (status.weeklyLimit === null || status.balance > 0)
}

/**
 * Deducts credits and writes to ai_usage_log.
 * Must be called after a successful AI Gateway response.
 * Atomically checks and deducts credits to prevent TOCTOU race conditions.
 * Throws if insufficient credits remain.
 */
export async function chargeCredits(
  db: DbClient,
  organizationId: string,
  opts: {
    siteId?: string
    sessionId?: string | null
    action: string
    source?: string
    model: string
    inputTokens: number
    outputTokens: number
    cfGatewayLogId?: string | null
    idempotencyKey?: string | null
    now?: Date
  }
): Promise<{ creditsCharged: number; newBalance: number }> {
  const creditsCharged = tokensToCredits(opts.inputTokens, opts.outputTokens)
  const nowDate = opts.now ?? new Date()
  const now = nowDate.toISOString()
  const usageIdempotencyKey = opts.idempotencyKey
    || (opts.cfGatewayLogId ? `ai-usage:${opts.cfGatewayLogId}` : `ai-usage:${crypto.randomUUID()}`)

  if (opts.idempotencyKey || opts.cfGatewayLogId) {
    const existing = await queryFirst<{ quantity: number; metadata_json: string | null }>(db, `
      SELECT quantity, metadata_json FROM usage_events
      WHERE organization_id = ? AND idempotency_key = ? LIMIT 1
    `, [organizationId, usageIdempotencyKey])
    if (existing) {
      const current = await getOrCreateCredits(db, organizationId, nowDate)
      const charged = flatUsageWasCharged(existing.metadata_json)
      return { creditsCharged: charged ? Number(existing.quantity) : 0, newBalance: current.balance }
    }
  }

  await getOrCreateCredits(db, organizationId, nowDate)
  const quota = await assertAiQuotaAvailable(db, organizationId, creditsCharged, opts.sessionId, nowDate)
  const balanceWasDebited = quota.weeklyLimit !== null
  const eventId = crypto.randomUUID()
  const periodStart = quota.periodStart
  const periodEnd = quota.periodEnd
  const sessionGuardDisabled = quota.sessionLimit === null || !opts.sessionId
  const source = opts.source ?? (opts.action === 'chowbot' ? 'chowbot' : 'server')
  const metadata = JSON.stringify({
    action: opts.action,
    model: opts.model,
    inputTokens: opts.inputTokens,
    outputTokens: opts.outputTokens,
    cfGatewayLogId: opts.cfGatewayLogId ?? null,
    charged: balanceWasDebited,
  })

  const results = await executeBatch(db, [
    {
      query: `
        INSERT OR IGNORE INTO usage_events
          (id, organization_id, site_id, resource, source, provider, channel,
           session_id, quantity, unit, metadata_json, idempotency_key, created_at)
        SELECT ?, ?, ?, 'ai_inference', ?, 'ai', ?, ?, ?, 'credit', ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM ai_credits
          WHERE organization_id = ?
            AND (? = 1 OR balance >= ?)
        )
          AND (
            ? = 1
            OR ? IS NULL
            OR COALESCE((
              SELECT SUM(quantity) FROM usage_events
              WHERE organization_id = ?
                AND resource = 'ai_inference'
                AND unit = 'credit'
                AND session_id = ?
                AND created_at >= ?
                AND created_at < ?
            ), 0) + ? <= ?
          )
      `,
      params: [
        eventId,
        organizationId,
        opts.siteId ?? null,
        source,
        opts.action,
        opts.sessionId ?? null,
        creditsCharged,
        metadata,
        usageIdempotencyKey,
        now,
        organizationId,
        balanceWasDebited ? 0 : 1,
        creditsCharged,
        sessionGuardDisabled ? 1 : 0,
        opts.sessionId ?? null,
        organizationId,
        opts.sessionId ?? null,
        periodStart,
        periodEnd,
        creditsCharged,
        quota.sessionLimit ?? 0,
      ],
    },
    {
      query: `
        UPDATE ai_credits
        SET balance = CASE WHEN ? = 1 THEN balance ELSE balance - ? END,
            lifetime_used = lifetime_used + ?,
            updated_at = ?
        WHERE organization_id = ?
          AND EXISTS (
            SELECT 1 FROM usage_events
            WHERE id = ? AND organization_id = ?
          )
      `,
      params: [balanceWasDebited ? 0 : 1, creditsCharged, creditsCharged, now, organizationId, eventId, organizationId],
    },
    {
      query: `
        INSERT INTO ai_usage_log
          (id, organization_id, site_id, action, model, input_tokens, output_tokens,
           credits_charged, cf_gateway_log_id, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN ? ELSE 0 END, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM usage_events
          WHERE id = ? AND organization_id = ?
        )
      `,
      params: [
        crypto.randomUUID(),
        organizationId,
        opts.siteId ?? null,
        opts.action,
        opts.model,
        opts.inputTokens,
        opts.outputTokens,
        balanceWasDebited ? 1 : 0,
        creditsCharged,
        opts.cfGatewayLogId ?? null,
        now,
        eventId,
        organizationId,
      ],
    },
  ])

  if (Number(results[0]?.meta.changes ?? 0) === 0) {
    const existing = await queryFirst<{ quantity: number; metadata_json: string | null }>(db, `
      SELECT quantity, metadata_json FROM usage_events
      WHERE organization_id = ? AND idempotency_key = ? LIMIT 1
    `, [organizationId, usageIdempotencyKey])
    if (existing) {
      const current = await getOrCreateCredits(db, organizationId, nowDate)
      const charged = flatUsageWasCharged(existing.metadata_json)
      return { creditsCharged: charged ? Number(existing.quantity) : 0, newBalance: current.balance }
    }
    const current = await getAiQuotaStatus(db, organizationId, opts.sessionId, nowDate)
    if (current.sessionRemaining !== null && current.sessionRemaining < creditsCharged) {
      throw new Error('AI session quota has been reached.')
    }
    if (current.weeklyRemaining !== null && current.weeklyRemaining < creditsCharged) {
      throw new Error('AI weekly quota has been reached.')
    }
    throw new Error('AI credit deduction failed.')
  }

  const updated = await queryFirst<{ balance: number }>(db, 'SELECT balance FROM ai_credits WHERE organization_id = ? LIMIT 1', [organizationId])
  return { creditsCharged: balanceWasDebited ? creditsCharged : 0, newBalance: updated?.balance ?? 0 }
}

/**
 * Deducts a flat per-action credit cost for non-token-based external API
 * usage (WhatsApp sends, Google Places calls) and logs it to ai_usage_log.
 * Unlike chargeCredits, this soft-fails on insufficient balance — it never
 * throws, and returns `charged: false` instead. Callers that gate
 * revenue-critical or auth-critical sends (e.g. WhatsApp OTP, reservation
 * confirmations) must never block on the result; this exists purely to
 * recover real cost when there's balance to draw from.
 */
export async function chargeFlatCredits(
  db: DbClient,
  organizationId: string,
  opts: {
    siteId?: string
    action: FlatCreditAction
    cfGatewayLogId?: string | null
    idempotencyKey?: string | null
    now?: Date
  }
): Promise<{ charged: boolean; creditsCharged: number; newBalance: number }> {
  const credits = ACTION_CREDIT_COSTS[opts.action]
  const nowDate = opts.now ?? new Date()
  const now = nowDate.toISOString()
  const usageIdempotencyKey = opts.idempotencyKey
    || (opts.cfGatewayLogId ? `flat-usage:${opts.cfGatewayLogId}` : `flat-usage:${crypto.randomUUID()}`)

  try {
    if (opts.idempotencyKey || opts.cfGatewayLogId) {
      const existing = await queryFirst<{ quantity: number; metadata_json: string | null }>(db, `
        SELECT quantity, metadata_json FROM usage_events
        WHERE organization_id = ? AND idempotency_key = ? LIMIT 1
      `, [organizationId, usageIdempotencyKey])
      if (existing) {
        const current = await getOrCreateCredits(db, organizationId, nowDate)
        const charged = flatUsageWasCharged(existing.metadata_json)
        return { charged, creditsCharged: charged ? Number(existing.quantity) : 0, newBalance: current.balance }
      }
    }
    const usage = usageForFlatCreditAction(opts.action)
    await getOrCreateCredits(db, organizationId, nowDate)
    const quota = await getAiQuotaStatus(db, organizationId, null, nowDate)
    const debitEligible = !quota.reconciliationRequired && quota.weeklyLimit !== null
    const eventId = crypto.randomUUID()
    const logId = crypto.randomUUID()
    const baseMetadata = {
      action: opts.action,
      creditsCharged: credits,
      cfGatewayLogId: opts.cfGatewayLogId ?? null,
    }
    const chargedMetadata = JSON.stringify({ ...baseMetadata, charged: true })
    const unchargedMetadata = JSON.stringify({ ...baseMetadata, charged: false })

    const results = await executeBatch(db, [
      {
        query: `
          INSERT OR IGNORE INTO usage_events
            (id, organization_id, site_id, resource, source, provider, channel,
             session_id, quantity, unit, metadata_json, idempotency_key, created_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?,
                 CASE WHEN ? = 1 AND balance >= ? THEN ? ELSE ? END,
                 ?, ?
          FROM ai_credits
          WHERE organization_id = ?
        `,
        params: [
          eventId,
          organizationId,
          opts.siteId ?? null,
          usage.resource,
          usage.source,
          usage.provider,
          usage.channel,
          credits,
          usage.unit,
          debitEligible ? 1 : 0,
          credits,
          chargedMetadata,
          unchargedMetadata,
          usageIdempotencyKey,
          now,
          organizationId,
        ],
      },
      {
        query: `
          UPDATE ai_credits
          SET balance = balance - ?, updated_at = ?
          WHERE organization_id = ?
            AND EXISTS (
              SELECT 1 FROM usage_events
              WHERE id = ?
                AND organization_id = ?
                AND instr(COALESCE(metadata_json, ''), '"charged":true') > 0
            )
        `,
        params: [credits, now, organizationId, eventId, organizationId],
      },
      {
        query: `
          UPDATE ai_credits
          SET lifetime_used = lifetime_used + ?, updated_at = ?
          WHERE organization_id = ?
            AND EXISTS (
              SELECT 1 FROM usage_events
              WHERE id = ? AND organization_id = ?
            )
        `,
        params: [credits, now, organizationId, eventId, organizationId],
      },
      {
        query: `
          INSERT INTO ai_usage_log
            (id, organization_id, site_id, action, model, input_tokens, output_tokens,
             credits_charged, cf_gateway_log_id, created_at)
          SELECT ?, ?, ?, ?, 'flat', 0, 0,
                 CASE WHEN instr(COALESCE(metadata_json, ''), '"charged":true') > 0 THEN ? ELSE 0 END,
                 ?, ?
          FROM usage_events
          WHERE id = ? AND organization_id = ?
        `,
        params: [
          logId,
          organizationId,
          opts.siteId ?? null,
          opts.action,
          credits,
          opts.cfGatewayLogId ?? null,
          now,
          eventId,
          organizationId,
        ],
      },
    ])

    if (Number(results[0]?.meta.changes ?? 0) === 0) {
      const existing = await queryFirst<{ quantity: number; metadata_json: string | null }>(db, `
        SELECT quantity, metadata_json FROM usage_events
        WHERE organization_id = ? AND idempotency_key = ? LIMIT 1
      `, [organizationId, usageIdempotencyKey])
      if (existing) {
        const current = await getOrCreateCredits(db, organizationId, nowDate)
        const charged = flatUsageWasCharged(existing.metadata_json)
        return { charged, creditsCharged: charged ? Number(existing.quantity) : 0, newBalance: current.balance }
      }
      throw new Error('Flat-credit usage event was not recorded.')
    }

    const charged = Number(results[1]?.meta.changes ?? 0) === 1
    const updated = await queryFirst<{ balance: number }>(db, 'SELECT balance FROM ai_credits WHERE organization_id = ? LIMIT 1', [organizationId])
    return { charged, creditsCharged: charged ? credits : 0, newBalance: updated?.balance ?? 0 }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Invalid organization billing projection:')) throw err
    console.error('chargeFlatCredits failed:', err)
    const row = await queryFirst<{ balance: number }>(db, 'SELECT balance FROM ai_credits WHERE organization_id = ? LIMIT 1', [organizationId]).catch(() => null)
    return { charged: false, creditsCharged: 0, newBalance: row?.balance ?? 0 }
  }
}
