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
  }
): Promise<{ creditsCharged: number; newBalance: number }> {
  const creditsCharged = tokensToCredits(opts.inputTokens, opts.outputTokens)
  const now = new Date().toISOString()
  const logId = crypto.randomUUID()

  await db.batch([
    db
      .prepare(
        `UPDATE ai_credits
         SET balance = MAX(0, balance - ?),
             lifetime_used = lifetime_used + ?,
             updated_at = ?
         WHERE organization_id = ?`
      )
      .bind(creditsCharged, creditsCharged, now, organizationId),
    db
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
      ),
  ])

  const updated = await db
    .prepare('SELECT balance FROM ai_credits WHERE organization_id = ? LIMIT 1')
    .bind(organizationId)
    .first<{ balance: number }>()

  return { creditsCharged, newBalance: updated?.balance ?? 0 }
}
