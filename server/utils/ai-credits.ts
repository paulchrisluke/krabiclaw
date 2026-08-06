import { triggerAutoTopupIfNeeded } from '~/server/utils/auto-topup'
import type { BillingEnv } from '~/server/utils/billing'
import { execute, queryFirst, type DbClient } from '~/server/db'

// Credit system: 1 credit = 1,000 tokens (input + output combined).
// Free orgs get FREE_SIGNUP_CREDITS on first check. Paid orgs get higher limits.

const FREE_SIGNUP_CREDITS = 500   // 500K tokens worth of free usage
const CREDITS_PER_1K_TOKENS = 1

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

/** Returns current balance, creating the row with signup credits if new org */
export async function getOrCreateCredits(
  db: DbClient,
  organizationId: string
): Promise<{ balance: number; lifetime_used: number }> {
  const existing = await queryFirst<{ balance: number; lifetime_used: number }>(
    db,
    'SELECT balance, lifetime_used FROM ai_credits WHERE organization_id = ? LIMIT 1',
    [organizationId],
  )

  if (existing) return existing

  const now = new Date().toISOString()
  await execute(
    db,
    `INSERT INTO ai_credits (organization_id, balance, lifetime_used, last_topped_up_at, updated_at)
       VALUES (?, ?, 0, ?, ?)`,
    [organizationId, FREE_SIGNUP_CREDITS, now, now],
  )

  return { balance: FREE_SIGNUP_CREDITS, lifetime_used: 0 }
}

/** Returns true if org has enough credits, false if exhausted */
export async function hasCredits(db: DbClient, organizationId: string): Promise<boolean> {
  const row = await getOrCreateCredits(db, organizationId)
  return row.balance > 0
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
    action: string
    model: string
    inputTokens: number
    outputTokens: number
    cfGatewayLogId?: string | null
  },
  billingEnv?: BillingEnv
): Promise<{ creditsCharged: number; newBalance: number }> {
  const creditsCharged = tokensToCredits(opts.inputTokens, opts.outputTokens)
  const now = new Date().toISOString()
  const logId = crypto.randomUUID()

  // Ensure a row exists so atomic decrement doesn't treat missing rows as insufficient credits.
  await getOrCreateCredits(db, organizationId)

  const updateResult = await execute(
    db,
    `UPDATE ai_credits
       SET balance = balance - ?,
           lifetime_used = lifetime_used + ?,
           updated_at = ?
       WHERE organization_id = ? AND balance >= ?`,
    [creditsCharged, creditsCharged, now, organizationId, creditsCharged],
  )

  if (!updateResult) {
    throw new Error('AI credit deduction failed.')
  }

  if (Number(updateResult.meta.changes ?? 0) === 0) {
    const row = await queryFirst<{ found: number }>(db, 'SELECT 1 AS found FROM ai_credits WHERE organization_id = ? LIMIT 1', [organizationId])
    if (!row) {
      throw new Error('AI credits row missing for organization.')
    }
    throw new Error('Insufficient AI credits remaining.')
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
    throw new Error('AI usage log insert failed.')
  }

  const updated = await queryFirst<{ balance: number }>(db, 'SELECT balance FROM ai_credits WHERE organization_id = ? LIMIT 1', [organizationId])

  const newBalance = updated?.balance ?? 0

  if (billingEnv) {
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
  },
  billingEnv?: BillingEnv
): Promise<{ charged: boolean; creditsCharged: number; newBalance: number }> {
  const credits = ACTION_CREDIT_COSTS[opts.action]
  const now = new Date().toISOString()
  const logId = crypto.randomUUID()

  try {
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
