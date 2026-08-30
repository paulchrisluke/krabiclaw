import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import {
  getCurrentCreditGrantProjection,
  grantQuota,
  parseLedgerQuantity,
  sumLedgerQuantities,
} from '~/server/utils/usage-metering'
import { getPlanEntitlements } from '~/server/utils/billing-entitlements'
import { getOrganizationBillingProjection } from '~/server/utils/organization-billing'

// Credit system: 1 credit = 1,000 tokens (input + output combined).

const CREDITS_PER_1K_TOKENS = 1
const MAX_SAFE_LEDGER_VALUE = Number.MAX_SAFE_INTEGER

export interface AiQuotaStatus {
  plan: string
  /** Base allowance from the effective organization subscription plan. */
  planAllowance: number | null
  /** Effective allowance for this UTC week after the latest baseline/manual grants. */
  periodAllowance: number | null
  /** All canonical credit usage recorded during the current UTC week. */
  periodUsed: number
  /** Remaining effective allowance after usage in the active quota window. */
  periodRemaining: number | null
  lifetimeUsed: number
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

export interface CanonicalUsageEventRow {
  resource: string
  site_id: string | null
  site_name: string | null
  quantity: number
  metadata_json: string | null
  created_at: string
}

export interface CanonicalUsageEvent {
  resource: string
  site_id: string | null
  site_name: string | null
  action: string | null
  quantity: number
  charged: boolean | null
  created_at: string
}

export interface CanonicalUsageGroup {
  resource: string
  action: string | null
  charged: boolean | null
  quantity: number
  calls: number
}

/**
 * Parse the small, explicitly supported metadata surface for usage events.
 * Provider payloads and token details are intentionally not exposed by the
 * billing DTO; the canonical quantity column remains the usage measurement.
 */
export function parseUsageEventRow(row: CanonicalUsageEventRow): CanonicalUsageEvent {
  let action: string | null = null
  let charged: boolean | null = null
  if (typeof row.metadata_json === 'string' && row.metadata_json.trim()) {
    try {
      const parsed: unknown = JSON.parse(row.metadata_json)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        const metadata = parsed as Record<string, unknown>
        if (typeof metadata.action === 'string' && metadata.action.trim()) action = metadata.action.trim()
        if (typeof metadata.charged === 'boolean') charged = metadata.charged
      }
    } catch {
      // Malformed optional metadata does not erase the durable usage event.
    }
  }
  const quantity = row.quantity
  if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 0) {
    throw new Error('Invalid canonical usage quantity.')
  }
  return {
    resource: row.resource,
    site_id: row.site_id ?? null,
    site_name: row.site_name ?? null,
    action,
    quantity,
    charged,
    created_at: row.created_at,
  }
}

interface CanonicalUsageGroupRow {
  resource: string
  action: string | null
  charged: number | null
  quantity: number
  calls: number
}

function parseUsageGroupRow(row: CanonicalUsageGroupRow): CanonicalUsageGroup {
  const quantity = row.quantity
  const calls = row.calls
  if (typeof quantity !== 'number' || typeof calls !== 'number'
    || !Number.isSafeInteger(quantity) || quantity < 0 || !Number.isSafeInteger(calls) || calls < 0) {
    throw new Error('Invalid canonical usage aggregate.')
  }
  return {
    resource: row.resource,
    action: typeof row.action === 'string' && row.action.trim() ? row.action.trim() : null,
    charged: row.charged === 1 ? true : row.charged === 0 ? false : null,
    quantity,
    calls,
  }
}

export function groupUsageEvents(rows: CanonicalUsageEvent[]): CanonicalUsageGroup[] {
  const groups = new Map<string, CanonicalUsageGroup>()
  for (const row of rows) {
    const key = JSON.stringify([row.resource, row.action, row.charged])
    const existing = groups.get(key)
    if (existing) {
      existing.quantity = sumLedgerQuantities(
        [existing.quantity, row.quantity],
        'Canonical usage group quantity',
      )
      existing.calls += 1
      continue
    }
    groups.set(key, {
      resource: row.resource,
      action: row.action,
      charged: row.charged,
      quantity: row.quantity,
      calls: 1,
    })
  }
  return [...groups.values()].sort((left, right) => right.quantity - left.quantity || left.resource.localeCompare(right.resource))
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

function parseTokenCount(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`AI token counts must be non-negative safe integers (${label}).`)
  }
  return value
}

interface OrganizationPlanInfo {
  plan: string
  version: string
}

async function getOrganizationPlanInfo(db: DbClient, organizationId: string, now = new Date()): Promise<OrganizationPlanInfo> {
  const billing = await getOrganizationBillingProjection(db, organizationId, now)
  return {
    plan: billing.effectivePlan,
    version: String(billing.updatedAt ?? billing.plan ?? 'free'),
  }
}

async function ensurePlanCreditAllowance(db: DbClient, organizationId: string, now = new Date()): Promise<void> {
  const { plan, version } = await getOrganizationPlanInfo(db, organizationId, now)
  const entitlements = getPlanEntitlements(plan)
  const weeklyLimit = typeof entitlements.ai_credits === 'number' ? entitlements.ai_credits : null
  const periodKey = utcWeekKey(now)
  const periodStart = utcWeekStart(now).toISOString()
  const periodEnd = utcWeekEnd(now).toISOString()
  const nowIso = now.toISOString()
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

}

async function currentWeeklyUsage(db: DbClient, organizationId: string, periodStart: string, periodEnd: string): Promise<number> {
  return await currentQuotaUsage(db, organizationId, periodStart, periodEnd)
}

interface LedgerUsageAggregateRow {
  total: number | null
  invalid_count: number | null
}

function parseLedgerUsageAggregate(
  row: LedgerUsageAggregateRow | null | undefined,
  label: string,
): number {
  if (!row) return 0
  const invalidCount = row.invalid_count === null
    ? 0
    : parseLedgerQuantity(row.invalid_count, `${label} invalid row count`)
  if (invalidCount > 0) {
    throw new Error(`${label} contains malformed ledger quantities.`)
  }
  return row.total === null ? 0 : parseLedgerQuantity(row.total, label)
}

async function currentQuotaUsage(db: DbClient, organizationId: string, periodStart: string, periodEnd: string): Promise<number> {
  const aggregate = await queryFirst<LedgerUsageAggregateRow>(db, `
    SELECT
      COALESCE(SUM(CASE
        WHEN typeof(quantity) = 'integer'
          AND quantity >= 0
          AND quantity <= 9007199254740991
        THEN quantity ELSE 0 END), 0) AS total,
      COALESCE(SUM(CASE
        WHEN typeof(quantity) = 'integer'
          AND quantity >= 0
          AND quantity <= 9007199254740991
        THEN 0 ELSE 1 END), 0) AS invalid_count
    FROM usage_events
    WHERE organization_id = ?
      AND unit = 'credit'
      AND created_at >= ?
      AND created_at < ?
  `, [organizationId, periodStart, periodEnd])
  return parseLedgerUsageAggregate(aggregate, 'Current credit usage')
}

export function tokensToCredits(inputTokens: number, outputTokens: number): number {
  // Output tokens cost ~5× more than input (Claude claude-sonnet-4-6 pricing).
  // Normalize: 1 output token = 5 input token equivalents, then divide by 1000.
  const safeInputTokens = parseTokenCount(inputTokens, 'input')
  const safeOutputTokens = parseTokenCount(outputTokens, 'output')
  const normalizedTokens = safeInputTokens + safeOutputTokens * 5
  if (!Number.isSafeInteger(normalizedTokens) || normalizedTokens < 0) {
    throw new Error('AI token counts must be non-negative safe integers (weighted total).')
  }
  const credits = Math.ceil(normalizedTokens / 1000) * CREDITS_PER_1K_TOKENS
  if (!Number.isSafeInteger(credits) || credits < 0) {
    throw new Error('AI token counts produce an unsafe credit quantity.')
  }
  return credits
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

/** Returns the ledger-derived balance after ensuring the recurring plan grant exists. */
export async function getOrCreateCredits(
  db: DbClient,
  organizationId: string,
  now = new Date(),
): Promise<{ balance: number; lifetime_used: number }> {
  const status = await getAiQuotaStatus(db, organizationId, null, now)
  return { balance: status.balance, lifetime_used: status.lifetimeUsed }
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
  await ensurePlanCreditAllowance(db, organizationId, now)
  const periodStart = utcWeekStart(now).toISOString()
  const periodEnd = utcWeekEnd(now).toISOString()
  const weeklyUsed = await currentWeeklyUsage(db, organizationId, periodStart, periodEnd)
  const session = sessionId
    ? await queryFirst<LedgerUsageAggregateRow>(db, `
        SELECT
          COALESCE(SUM(CASE
            WHEN typeof(quantity) = 'integer'
              AND quantity >= 0
              AND quantity <= 9007199254740991
            THEN quantity ELSE 0 END), 0) AS total,
          COALESCE(SUM(CASE
            WHEN typeof(quantity) = 'integer'
              AND quantity >= 0
              AND quantity <= 9007199254740991
            THEN 0 ELSE 1 END), 0) AS invalid_count
        FROM usage_events
        WHERE organization_id = ?
          AND resource = 'ai_inference'
          AND unit = 'credit'
          AND session_id = ?
          AND created_at >= ?
          AND created_at < ?
      `, [organizationId, sessionId, periodStart, periodEnd])
    : null
  const sessionUsed = parseLedgerUsageAggregate(session, 'Session credit usage')
  const projection = await getCurrentCreditGrantProjection(db, organizationId, now)
  const quotaUsed = await currentQuotaUsage(db, organizationId, projection.consumptionStart ?? periodStart, periodEnd)
  const periodAllowance = weeklyLimit === null ? null : projection.grantQuantity ?? weeklyLimit
  const periodRemaining = periodAllowance === null ? null : Math.max(0, periodAllowance - quotaUsed)
  const lifetime = await queryFirst<LedgerUsageAggregateRow>(db, `
    SELECT
      COALESCE(SUM(CASE WHEN typeof(quantity) = 'integer' AND quantity >= 0 AND quantity <= 9007199254740991 THEN quantity ELSE 0 END), 0) AS total,
      COALESCE(SUM(CASE WHEN typeof(quantity) = 'integer' AND quantity >= 0 AND quantity <= 9007199254740991 THEN 0 ELSE 1 END), 0) AS invalid_count
    FROM usage_events WHERE organization_id = ? AND unit = 'credit'
  `, [organizationId])
  const lifetimeUsed = parseLedgerUsageAggregate(lifetime, 'Lifetime credit usage')

  return {
    plan,
    planAllowance: weeklyLimit,
    periodAllowance,
    periodUsed: weeklyUsed,
    periodRemaining,
    lifetimeUsed,
    balance: periodRemaining ?? MAX_SAFE_LEDGER_VALUE,
    weeklyLimit,
    weeklyUsed,
    weeklyRemaining: periodRemaining,
    sessionLimit,
    sessionUsed,
    sessionRemaining: sessionLimit === null ? null : Math.max(0, sessionLimit - sessionUsed),
    periodStart,
    periodEnd,
    grantQuantity: periodAllowance,
    unlimited: weeklyLimit === null,
    reconciliationRequired: false,
  }
}

export interface OrganizationCreditsResource {
  plan: string
  planAllowance: number | null
  periodAllowance: number | null
  periodUsed: number
  periodRemaining: number | null
  periodStart: string
  periodEnd: string
  lifetimeUsed: number
  sessionLimit: number | null
  sessionUsed: number
  sessionRemaining: number | null
  unlimited: boolean
  reconciliationRequired: boolean
  usage: CanonicalUsageEvent[]
  byAction: CanonicalUsageGroup[]
}

/**
 * Build the one organization-level credits payload consumed by both the
 * billing API and dashboard SSR. Quota status is resolved once; recent usage
 * and grouping always come from the canonical append-only usage_events ledger.
 */
export async function getOrganizationCreditsResource(
  db: DbClient,
  organizationId: string,
  sessionId?: string | null,
  now = new Date(),
): Promise<OrganizationCreditsResource> {
  const quota = await getAiQuotaStatus(db, organizationId, sessionId, now)
  const [usageRows, usageGroupRows] = await Promise.all([
    queryAll<CanonicalUsageEventRow>(db, `
      SELECT u.resource, u.site_id, s.brand_name AS site_name,
             u.quantity, u.metadata_json, u.created_at
        FROM usage_events u
        LEFT JOIN sites s ON s.id = u.site_id
       WHERE u.organization_id = ?
         AND u.unit = 'credit'
         AND u.created_at >= ?
         AND u.created_at < ?
       ORDER BY u.created_at DESC
       LIMIT 50
    `, [organizationId, quota.periodStart, quota.periodEnd]),
    queryAll<CanonicalUsageGroupRow>(db, `
      SELECT u.resource,
             CASE WHEN json_valid(u.metadata_json) THEN
               CASE
                 WHEN json_type(u.metadata_json, '$.action') = 'text'
                 THEN json_extract(u.metadata_json, '$.action')
                 ELSE NULL
               END
             ELSE NULL END AS action,
             CASE WHEN json_valid(u.metadata_json) THEN
               CASE
                 WHEN json_type(u.metadata_json, '$.charged') = 'true' THEN 1
                 WHEN json_type(u.metadata_json, '$.charged') = 'false' THEN 0
                 ELSE NULL
               END
             ELSE NULL END AS charged,
             COALESCE(SUM(u.quantity), 0) AS quantity,
             COUNT(*) AS calls
        FROM usage_events u
       WHERE u.organization_id = ?
         AND u.unit = 'credit'
         AND u.created_at >= ?
         AND u.created_at < ?
       GROUP BY u.resource, action, charged
       ORDER BY quantity DESC, u.resource ASC
    `, [organizationId, quota.periodStart, quota.periodEnd]),
  ])
  const usage = usageRows.map(parseUsageEventRow)
  return {
    plan: quota.plan,
    planAllowance: quota.planAllowance,
    periodAllowance: quota.periodAllowance,
    periodUsed: quota.periodUsed,
    periodRemaining: quota.periodRemaining,
    periodStart: quota.periodStart,
    periodEnd: quota.periodEnd,
    lifetimeUsed: quota.lifetimeUsed,
    sessionLimit: quota.sessionLimit,
    sessionUsed: quota.sessionUsed,
    sessionRemaining: quota.sessionRemaining,
    unlimited: quota.unlimited,
    reconciliationRequired: quota.reconciliationRequired,
    usage,
    byAction: usageGroupRows.map(parseUsageGroupRow),
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
 * Records charged AI usage in the canonical append-only ledger.
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
      const persistedQuantity = parseLedgerQuantity(existing.quantity, 'Persisted usage quantity')
      const current = await getOrCreateCredits(db, organizationId, nowDate)
      const charged = flatUsageWasCharged(existing.metadata_json)
      return { creditsCharged: charged ? persistedQuantity : 0, newBalance: current.balance }
    }
  }

  const quota = await assertAiQuotaAvailable(db, organizationId, creditsCharged, opts.sessionId, nowDate)
  if (quota.lifetimeUsed > MAX_SAFE_LEDGER_VALUE - creditsCharged) {
    throw new Error('AI lifetime usage would exceed the safe integer range.')
  }
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
    charged: true,
  })

  const result = await execute(db, `
    INSERT OR IGNORE INTO usage_events
      (id, organization_id, site_id, resource, source, provider, channel,
       session_id, quantity, unit, metadata_json, idempotency_key, created_at)
    SELECT ?, ?, ?, 'ai_inference', ?, 'ai', ?, ?, ?, 'credit', ?, ?, ?
    WHERE (? IS NULL OR COALESCE((
      SELECT SUM(quantity) FROM usage_events
      WHERE organization_id = ? AND unit = 'credit' AND created_at >= ? AND created_at < ?
    ), 0) + ? <= ?)
      AND (? = 1 OR COALESCE((
        SELECT SUM(quantity) FROM usage_events
        WHERE organization_id = ? AND resource = 'ai_inference' AND unit = 'credit'
          AND session_id = ? AND created_at >= ? AND created_at < ?
      ), 0) + ? <= ?)
  `, [
    eventId, organizationId, opts.siteId ?? null, source, opts.action,
    opts.sessionId ?? null, creditsCharged, metadata, usageIdempotencyKey, now,
    quota.periodAllowance, organizationId, periodStart, periodEnd, creditsCharged, quota.periodAllowance ?? 0,
    sessionGuardDisabled ? 1 : 0, organizationId, opts.sessionId ?? null,
    periodStart, periodEnd, creditsCharged, quota.sessionLimit ?? 0,
  ])

  if (Number(result?.meta.changes ?? 0) === 0) {
    const existing = await queryFirst<{ quantity: number; metadata_json: string | null }>(db, `
      SELECT quantity, metadata_json FROM usage_events
      WHERE organization_id = ? AND idempotency_key = ? LIMIT 1
    `, [organizationId, usageIdempotencyKey])
    if (existing) {
      const persistedQuantity = parseLedgerQuantity(existing.quantity, 'Persisted usage quantity')
      const current = await getOrCreateCredits(db, organizationId, nowDate)
      const charged = flatUsageWasCharged(existing.metadata_json)
      return { creditsCharged: charged ? persistedQuantity : 0, newBalance: current.balance }
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

  const updated = await getAiQuotaStatus(db, organizationId, opts.sessionId, nowDate)
  return { creditsCharged, newBalance: updated.balance }
}

/**
 * Deducts a flat per-action credit cost for non-token-based external API
 * usage (WhatsApp sends, Google Places calls) in the canonical usage ledger.
 * Unlike chargeCredits, this records insufficient balance as an uncharged
 * usage event and returns `charged: false`. Infrastructure, query, and
 * malformed-projection failures are not insufficient balance: they propagate
 * to the caller so provider work cannot be reported as an unqualified
 * application success when its accounting write failed.
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

  if (opts.idempotencyKey || opts.cfGatewayLogId) {
    const existing = await queryFirst<{ quantity: number; metadata_json: string | null }>(db, `
      SELECT quantity, metadata_json FROM usage_events
      WHERE organization_id = ? AND idempotency_key = ? LIMIT 1
    `, [organizationId, usageIdempotencyKey])
    if (existing) {
      const persistedQuantity = parseLedgerQuantity(existing.quantity, 'Persisted usage quantity')
      const current = await getOrCreateCredits(db, organizationId, nowDate)
      const charged = flatUsageWasCharged(existing.metadata_json)
      return { charged, creditsCharged: charged ? persistedQuantity : 0, newBalance: current.balance }
    }
  }
  const usage = usageForFlatCreditAction(opts.action)
  const quota = await getAiQuotaStatus(db, organizationId, null, nowDate)
  if (quota.lifetimeUsed > MAX_SAFE_LEDGER_VALUE - credits) {
    throw new Error('AI lifetime usage would exceed the safe integer range.')
  }
  const eventId = crypto.randomUUID()
  const baseMetadata = {
    action: opts.action,
    creditsCharged: credits,
    cfGatewayLogId: opts.cfGatewayLogId ?? null,
  }
  const chargedMetadata = JSON.stringify({ ...baseMetadata, charged: true })
  const unchargedMetadata = JSON.stringify({ ...baseMetadata, charged: false })

  const result = await execute(db, `
    INSERT OR IGNORE INTO usage_events
      (id, organization_id, site_id, resource, source, provider, channel,
       session_id, quantity, unit, metadata_json, idempotency_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?,
      CASE
        WHEN ? IS NULL THEN ?
        WHEN COALESCE((SELECT SUM(quantity) FROM usage_events
          WHERE organization_id = ? AND unit = 'credit' AND created_at >= ? AND created_at < ?), 0) + ? <= ? THEN ?
        ELSE ?
      END, ?, ?)
  `, [
    eventId, organizationId, opts.siteId ?? null, usage.resource, usage.source,
    usage.provider, usage.channel, credits, usage.unit,
    quota.periodAllowance, unchargedMetadata,
    organizationId, quota.periodStart, quota.periodEnd, credits, quota.periodAllowance ?? 0,
    chargedMetadata, unchargedMetadata, usageIdempotencyKey, now,
  ])

  if (Number(result?.meta.changes ?? 0) === 0) {
    const existing = await queryFirst<{ quantity: number; metadata_json: string | null }>(db, `
      SELECT quantity, metadata_json FROM usage_events
      WHERE organization_id = ? AND idempotency_key = ? LIMIT 1
    `, [organizationId, usageIdempotencyKey])
    if (existing) {
      const persistedQuantity = parseLedgerQuantity(existing.quantity, 'Persisted usage quantity')
      const current = await getOrCreateCredits(db, organizationId, nowDate)
      const charged = flatUsageWasCharged(existing.metadata_json)
      return { charged, creditsCharged: charged ? persistedQuantity : 0, newBalance: current.balance }
    }
    throw new Error('Flat-credit usage event was not recorded.')
  }

  const persisted = await queryFirst<{ metadata_json: string | null }>(db, `
    SELECT metadata_json FROM usage_events WHERE id = ? AND organization_id = ? LIMIT 1
  `, [eventId, organizationId])
  const charged = flatUsageWasCharged(persisted?.metadata_json)
  const updated = await getAiQuotaStatus(db, organizationId, null, nowDate)
  return { charged, creditsCharged: charged ? credits : 0, newBalance: updated.balance }
}
