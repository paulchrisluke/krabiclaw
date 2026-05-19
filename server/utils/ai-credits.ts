import { triggerAutoTopupIfNeeded } from '~/server/utils/auto-topup'
import type { BillingEnv } from '~/server/utils/billing'

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

/** Returns current balance, creating the row with signup credits if new org */
export async function getOrCreateCredits(
  db: D1Database,
  organizationId: string
): Promise<{ balance: number; lifetime_used: number }> {
  const existing = await db
    .prepare('SELECT balance, lifetime_used FROM ai_credits WHERE organization_id = ? LIMIT 1')
    .bind(organizationId)
    .first<{ balance: number; lifetime_used: number }>()

  if (existing) return existing

  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO ai_credits (organization_id, balance, lifetime_used, last_topped_up_at, updated_at)
       VALUES (?, ?, 0, ?, ?)`
    )
    .bind(organizationId, FREE_SIGNUP_CREDITS, now, now)
    .run()

  return { balance: FREE_SIGNUP_CREDITS, lifetime_used: 0 }
}

/** Returns true if org has enough credits, false if exhausted */
export async function hasCredits(db: D1Database, organizationId: string): Promise<boolean> {
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
  db: D1Database,
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

  const updateResult = await db
    .prepare(
      `UPDATE ai_credits
       SET balance = balance - ?,
           lifetime_used = lifetime_used + ?,
           updated_at = ?
       WHERE organization_id = ? AND balance >= ?`
    )
    .bind(creditsCharged, creditsCharged, now, organizationId, creditsCharged)
    .run()

  if (!updateResult) {
    throw new Error('AI credit deduction failed.')
  }

  if (updateResult.meta.changes === 0) {
    const row = await db
      .prepare('SELECT 1 AS found FROM ai_credits WHERE organization_id = ? LIMIT 1')
      .bind(organizationId)
      .first<{ found: number }>()
    if (!row) {
      throw new Error('AI credits row missing for organization.')
    }
    throw new Error('Insufficient AI credits remaining.')
  }

  const insertResult = await db
    .prepare(
      `INSERT INTO ai_usage_log
         (id, organization_id, site_id, action, model, input_tokens, output_tokens, credits_charged, cf_gateway_log_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      logId,
      organizationId,
      opts.siteId ?? null,
      opts.action,
      opts.model,
      opts.inputTokens,
      opts.outputTokens,
      creditsCharged,
      opts.cfGatewayLogId ?? null,
      now
    )
    .run()

  if (!insertResult || insertResult.meta.changes === 0) {
    throw new Error('AI usage log insert failed.')
  }

  const updated = await db
    .prepare('SELECT balance FROM ai_credits WHERE organization_id = ? LIMIT 1')
    .bind(organizationId)
    .first<{ balance: number }>()

  const newBalance = updated?.balance ?? 0

  if (billingEnv) {
    triggerAutoTopupIfNeeded(db, billingEnv, organizationId, newBalance).catch(() => {})
  }

  return { creditsCharged, newBalance }
}
