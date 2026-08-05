import { triggerAutoTopupIfNeeded } from '~/server/utils/auto-topup'
import type { BillingEnv } from '~/server/utils/billing'
import { execute, executeBatch, queryFirst, type DbClient } from '~/server/db'
import { recordUsageEvent } from '~/server/utils/usage-metering'
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
}

interface CreditRow {
  balance: number
  lifetime_used: number
  balance_period_key: string | null
}

function utcWeekStart(now = new Date()): Date {
  const start = new Date(now)
  start.setUTCHours(0, 0, 0, 0)
  const day = start.getUTCDay()
  start.setUTCDate(start.getUTCDate() - ((day + 6) % 7))
  return start
}

function utcWeekKey(now = new Date()): string {
  return utcWeekStart(now).toISOString().slice(0, 10)
}

async function getOrganizationPlan(db: DbClient, organizationId: string): Promise<string> {
  const billing = await queryFirst<{
    plan: string | null
    status: string | null
    payment_status: string | null
    paid_through: string | null
    current_period_end: string | null
  }>(db, `
    SELECT plan, status, payment_status, paid_through, current_period_end
    FROM organization_billing
    WHERE organization_id = ?
    LIMIT 1
  `, [organizationId])
  if (billing) {
    return getEffectiveAccessPlan({
      plan: billing.plan,
      status: billing.status,
      paymentStatus: billing.payment_status,
      paidThrough: billing.paid_through,
      periodEnd: billing.current_period_end,
    })
  }

  return 'free'
}

async function ensurePlanCreditAllowance(db: DbClient, organizationId: string): Promise<CreditRow> {
  const plan = await getOrganizationPlan(db, organizationId)
  const entitlements = getPlanEntitlements(plan)
  const weeklyLimit = typeof entitlements.ai_credits === 'number' ? entitlements.ai_credits : null
  const periodKey = utcWeekKey()
  const now = new Date().toISOString()
  const existing = await queryFirst<CreditRow>(db, `
    SELECT balance, lifetime_used, balance_period_key
    FROM ai_credits WHERE organization_id = ? LIMIT 1
  `, [organizationId])

  if (!existing) {
    await execute(db, `
      INSERT OR IGNORE INTO ai_credits
        (organization_id, balance, lifetime_used, last_topped_up_at, balance_period_key, updated_at)
      VALUES (?, ?, 0, ?, ?, ?)
    `, [organizationId, weeklyLimit ?? 0, weeklyLimit === null ? null : now, periodKey, now])
  } else if (weeklyLimit !== null && existing.balance_period_key !== periodKey) {
    await execute(db, `
      UPDATE ai_credits
      SET balance = MAX(balance, ?), balance_period_key = ?, updated_at = ?
      WHERE organization_id = ?
    `, [weeklyLimit, periodKey, now, organizationId])
  }

  const row = await queryFirst<CreditRow>(db, `
    SELECT balance, lifetime_used, balance_period_key
    FROM ai_credits WHERE organization_id = ? LIMIT 1
  `, [organizationId])
  if (!row) throw new Error('AI credits row missing for organization.')
  return row
}

export function tokensToCredits(inputTokens: number, outputTokens: number): number {
  // Output tokens cost ~5× more than input (Claude claude-sonnet-4-6 pricing).
  // Normalize: 1 output token = 5 input token equivalents, then divide by 1000.
  const normalizedTokens = inputTokens + outputTokens * 5
  return Math.ceil(normalizedTokens / 1000) * CREDITS_PER_1K_TOKENS
}

// Flat per-action credit costs for non-token-based external API usage
// (WhatsApp Business API sends, Google Places API calls) that has real
// per-call cost but no natural token count. Pegged as launch-time estimates
// against the cheapest $9/500-credit top-up bundle (~$0.018/credit) vs. list
// Meta/Google pricing — revisit once real invoiced volume exists.
export const ACTION_CREDIT_COSTS = {
  whatsapp_notification: 2,
  whatsapp_free_text: 1,
  google_places_search: 2,
  google_places_details: 3, // bundles the photo fetch getPlaceDetails triggers
} as const

export type FlatCreditAction = keyof typeof ACTION_CREDIT_COSTS

async function rollbackCreditCharge(
  db: DbClient,
  organizationId: string,
  logId: string,
  credits: number,
  balanceWasDebited = true,
): Promise<void> {
  await executeBatch(db, [
    {
      query: `
        UPDATE ai_credits
        SET balance = balance + CASE WHEN ? = 1 THEN ? ELSE 0 END,
            lifetime_used = lifetime_used - ?, updated_at = ?
        WHERE organization_id = ?
      `,
      params: [balanceWasDebited ? 1 : 0, credits, credits, new Date().toISOString(), organizationId],
    },
    {
      query: `DELETE FROM ai_usage_log WHERE id = ? AND organization_id = ?`,
      params: [logId, organizationId],
    },
  ])
}

export function usageForFlatCreditAction(action: FlatCreditAction): {
  resource: 'messaging' | 'maps_api'
  source: string
  provider: string
  channel: string
  unit: string
} {
  if (action.startsWith('whatsapp_')) {
    return {
      resource: 'messaging',
      source: 'notification',
      provider: 'meta',
      channel: 'whatsapp',
      unit: 'message',
    }
  }
  return {
    resource: 'maps_api',
    source: 'places',
    provider: 'google',
    channel: 'api',
    unit: 'api_call',
  }
}

/** Returns current balance, creating the row with signup credits if new org */
export async function getOrCreateCredits(
  db: DbClient,
  organizationId: string
): Promise<{ balance: number; lifetime_used: number }> {
  const row = await ensurePlanCreditAllowance(db, organizationId)
  return { balance: row.balance, lifetime_used: row.lifetime_used }
}

export async function getAiQuotaStatus(
  db: DbClient,
  organizationId: string,
  sessionId?: string | null,
  now = new Date(),
): Promise<AiQuotaStatus> {
  const plan = await getOrganizationPlan(db, organizationId)
  const entitlements = getPlanEntitlements(plan)
  const weeklyLimit = typeof entitlements.ai_credits === 'number' ? entitlements.ai_credits : null
  const sessionLimit = typeof entitlements.ai_session_credits === 'number' ? entitlements.ai_session_credits : null
  const credits = await ensurePlanCreditAllowance(db, organizationId)
  const periodStart = utcWeekStart(now).toISOString()
  const weekly = await queryFirst<{ total: number | null }>(db, `
    SELECT COALESCE(SUM(quantity), 0) AS total
    FROM usage_events
    WHERE organization_id = ?
      AND resource = 'ai_inference'
      AND unit = 'credit'
      AND created_at >= ?
  `, [organizationId, periodStart])
  const session = sessionId
    ? await queryFirst<{ total: number | null }>(db, `
        SELECT COALESCE(SUM(quantity), 0) AS total
        FROM usage_events
        WHERE organization_id = ?
          AND resource = 'ai_inference'
          AND unit = 'credit'
          AND session_id = ?
      `, [organizationId, sessionId])
    : null
  const weeklyUsed = Number(weekly?.total ?? 0)
  const sessionUsed = Number(session?.total ?? 0)

  return {
    plan,
    balance: credits.balance,
    weeklyLimit,
    weeklyUsed,
    weeklyRemaining: weeklyLimit === null ? null : Math.max(0, weeklyLimit - weeklyUsed),
    sessionLimit,
    sessionUsed,
    sessionRemaining: sessionLimit === null ? null : Math.max(0, sessionLimit - sessionUsed),
    periodStart,
  }
}

export async function assertAiQuotaAvailable(
  db: DbClient,
  organizationId: string,
  quantity: number,
  sessionId?: string | null,
): Promise<AiQuotaStatus> {
  const status = await getAiQuotaStatus(db, organizationId, sessionId)
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
): Promise<boolean> {
  const status = await getAiQuotaStatus(db, organizationId, sessionId)
  return (status.weeklyRemaining === null || status.weeklyRemaining > 0)
    && (status.sessionRemaining === null || status.sessionRemaining > 0)
    && (status.weeklyLimit === null || status.balance > 0)
}

/**
 * Deducts credits and writes to ai_usage_log.
 * Must be called after a successful AI Gateway response.
 * Atomically checks and deducts credits to prevent TOCTOU race conditions.
 * Throws if insufficient credits remain.
 * Pass billingEnv to enable automatic top-up when balance drops below threshold.
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
  },
  billingEnv?: BillingEnv
): Promise<{ creditsCharged: number; newBalance: number }> {
  const creditsCharged = tokensToCredits(opts.inputTokens, opts.outputTokens)
  const now = new Date().toISOString()
  const logId = crypto.randomUUID()
  const usageIdempotencyKey = opts.idempotencyKey
    || (opts.cfGatewayLogId ? `ai-usage:${opts.cfGatewayLogId}` : `ai-usage:${logId}`)

  if (opts.idempotencyKey || opts.cfGatewayLogId) {
    const existing = await queryFirst<{ quantity: number }>(db, `
      SELECT quantity FROM usage_events
      WHERE organization_id = ? AND idempotency_key = ? LIMIT 1
    `, [organizationId, usageIdempotencyKey])
    if (existing) {
      const current = await getOrCreateCredits(db, organizationId)
      return { creditsCharged: Number(existing.quantity), newBalance: current.balance }
    }
  }

  // Ensure a row exists so atomic decrement doesn't treat missing rows as insufficient credits.
  await getOrCreateCredits(db, organizationId)
  const quota = await assertAiQuotaAvailable(db, organizationId, creditsCharged, opts.sessionId)
  const balanceWasDebited = quota.weeklyLimit !== null

  const updateResult = await execute(
    db,
    `UPDATE ai_credits
       SET balance = CASE WHEN ? = 1 THEN balance ELSE balance - ? END,
           lifetime_used = lifetime_used + ?,
           updated_at = ?
       WHERE organization_id = ?
         AND (? = 1 OR balance >= ?)`,
    [balanceWasDebited ? 0 : 1, creditsCharged, creditsCharged, now, organizationId, balanceWasDebited ? 0 : 1, creditsCharged],
  )

  if (!updateResult) {
    throw new Error('AI credit deduction failed.')
  }

  if (Number(updateResult.meta.changes ?? 0) === 0) {
    const row = await queryFirst<{ found: number }>(db, 'SELECT 1 AS found FROM ai_credits WHERE organization_id = ? LIMIT 1', [organizationId])
    if (!row) {
      throw new Error('AI credits row missing for organization.')
    }
    throw new Error('AI credit deduction failed.')
  }

  const insertResult = await execute(
    db,
    `INSERT INTO ai_usage_log
         (id, organization_id, site_id, action, model, input_tokens, output_tokens, credits_charged, cf_gateway_log_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      logId,
      organizationId,
      opts.siteId ?? null,
      opts.action,
      opts.model,
      opts.inputTokens,
      opts.outputTokens,
      creditsCharged,
      opts.cfGatewayLogId ?? null,
      now,
    ],
  )

  if (!insertResult || Number(insertResult.meta.changes ?? 0) === 0) {
    await rollbackCreditCharge(db, organizationId, logId, creditsCharged, balanceWasDebited)
    throw new Error('AI usage log insert failed.')
  }

  try {
    const recorded = await recordUsageEvent(db, {
      organizationId,
      siteId: opts.siteId,
      sessionId: opts.sessionId,
      resource: 'ai_inference',
      source: opts.source ?? (opts.action === 'chowbot' ? 'chowbot' : 'server'),
      provider: 'ai',
      channel: opts.action,
      quantity: creditsCharged,
      unit: 'credit',
      metadata: {
        action: opts.action,
        model: opts.model,
        inputTokens: opts.inputTokens,
        outputTokens: opts.outputTokens,
        cfGatewayLogId: opts.cfGatewayLogId ?? null,
      },
      idempotencyKey: usageIdempotencyKey,
    })
    if (!recorded) throw new Error('AI usage event was not recorded.')
  } catch (error) {
    await rollbackCreditCharge(db, organizationId, logId, creditsCharged, balanceWasDebited)
    throw error
  }

  const updated = await queryFirst<{ balance: number }>(db, 'SELECT balance FROM ai_credits WHERE organization_id = ? LIMIT 1', [organizationId])

  const newBalance = updated?.balance ?? 0

  if (billingEnv && balanceWasDebited) {
    triggerAutoTopupIfNeeded(db, billingEnv, organizationId, newBalance).catch(() => {})
  }

  return { creditsCharged, newBalance }
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
  },
  billingEnv?: BillingEnv
): Promise<{ charged: boolean; creditsCharged: number; newBalance: number }> {
  const credits = ACTION_CREDIT_COSTS[opts.action]
  const now = new Date().toISOString()
  const logId = crypto.randomUUID()
  const usageIdempotencyKey = opts.idempotencyKey
    || (opts.cfGatewayLogId ? `flat-usage:${opts.cfGatewayLogId}` : `flat-usage:${logId}`)

  try {
    if (opts.idempotencyKey || opts.cfGatewayLogId) {
      const existing = await queryFirst<{ quantity: number }>(db, `
        SELECT quantity FROM usage_events
        WHERE organization_id = ? AND idempotency_key = ? LIMIT 1
      `, [organizationId, usageIdempotencyKey])
      if (existing) {
        const current = await getOrCreateCredits(db, organizationId)
        return { charged: true, creditsCharged: credits, newBalance: current.balance }
      }
    }
    await getOrCreateCredits(db, organizationId)

    const updateResult = await execute(
      db,
      `UPDATE ai_credits
         SET balance = balance - ?,
             lifetime_used = lifetime_used + ?,
             updated_at = ?
         WHERE organization_id = ? AND balance >= ?`,
      [credits, credits, now, organizationId, credits],
    )

    if (!updateResult || Number(updateResult.meta.changes ?? 0) === 0) {
      const row = await queryFirst<{ balance: number }>(db, 'SELECT balance FROM ai_credits WHERE organization_id = ? LIMIT 1', [organizationId])
      return { charged: false, creditsCharged: 0, newBalance: row?.balance ?? 0 }
    }

    try {
      await execute(
        db,
        `INSERT INTO ai_usage_log
             (id, organization_id, site_id, action, model, input_tokens, output_tokens, credits_charged, cf_gateway_log_id, created_at)
           VALUES (?, ?, ?, ?, 'flat', 0, 0, ?, ?, ?)`,
        [
          logId,
          organizationId,
          opts.siteId ?? null,
          opts.action,
          credits,
          opts.cfGatewayLogId ?? null,
          now,
        ],
      )
    } catch (logErr) {
      // Compensate: the log insert failed, so undo the debit to avoid a
      // charge with no corresponding ai_usage_log row.
      await execute(
        db,
        `UPDATE ai_credits
           SET balance = balance + ?,
               lifetime_used = lifetime_used - ?,
               updated_at = ?
           WHERE organization_id = ?`,
        [credits, credits, new Date().toISOString(), organizationId],
      ).catch(() => {})
      throw logErr
    }

    const usage = usageForFlatCreditAction(opts.action)
    try {
      const recorded = await recordUsageEvent(db, {
        organizationId,
        siteId: opts.siteId,
        ...usage,
        quantity: 1,
        metadata: {
          action: opts.action,
          creditsCharged: credits,
          cfGatewayLogId: opts.cfGatewayLogId ?? null,
        },
      idempotencyKey: usageIdempotencyKey,
      })
      if (!recorded) throw new Error('Flat-credit usage event was not recorded.')
    } catch (error) {
      await rollbackCreditCharge(db, organizationId, logId, credits)
      throw error
    }

    const updated = await queryFirst<{ balance: number }>(db, 'SELECT balance FROM ai_credits WHERE organization_id = ? LIMIT 1', [organizationId])
    const newBalance = updated?.balance ?? 0

    if (billingEnv) {
      triggerAutoTopupIfNeeded(db, billingEnv, organizationId, newBalance).catch(() => {})
    }

    return { charged: true, creditsCharged: credits, newBalance }
  } catch (err) {
    console.error('chargeFlatCredits failed:', err)
    const row = await queryFirst<{ balance: number }>(db, 'SELECT balance FROM ai_credits WHERE organization_id = ? LIMIT 1', [organizationId]).catch(() => null)
    return { charged: false, creditsCharged: 0, newBalance: row?.balance ?? 0 }
  }
}
