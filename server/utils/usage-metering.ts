import { execute, executeBatch, queryAll, type DbClient } from '~/server/db'

export type UsageResource =
  | 'ai_inference'
  | 'mcp_operation'
  | 'scheduled_task'
  | 'maps_api'
  | 'messaging'
  | 'image_generation'

export interface UsageEventInput {
  organizationId: string
  siteId?: string | null
  resource: UsageResource | string
  source: string
  provider?: string | null
  channel?: string | null
  sessionId?: string | null
  quantity: number
  unit: string
  metadata?: Record<string, unknown> | null
  idempotencyKey: string
  createdAt?: string
}

export interface QuotaGrantInput {
  organizationId: string
  resource: UsageResource | string
  quantity: number
  unit: string
  periodKey: string
  periodStart: string
  periodEnd?: string | null
  grantType: 'plan' | 'reset' | 'manual'
  reason: string
  createdBy?: string | null
  idempotencyKey: string
  createdAt?: string
}

const MAX_SAFE_INTEGER_SQL = String(Number.MAX_SAFE_INTEGER)

/**
 * Validate a quantity read from an append-only ledger before it participates
 * in allowance or balance arithmetic. Database column affinity does not
 * prevent malformed values from being stored, so runtime reads must not rely
 * on the TypeScript row shape or implicit Number coercion.
 */
export function parseLedgerQuantity(value: unknown, label = 'Ledger quantity'): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`)
  }
  return value
}

/** Sum ledger quantities while preserving the safe-integer invariant. */
export function sumLedgerQuantities(values: Iterable<unknown>, label = 'Ledger quantity total'): number {
  let total = 0
  for (const value of values) {
    total = parseLedgerQuantity(total + parseLedgerQuantity(value, label), label)
  }
  return total
}

function assertQuantity(quantity: number): void {
  parseLedgerQuantity(quantity, 'Usage quantity')
}

function parseDate(value: string, label: string): Date {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid date.`)
  return date
}

function defaultPeriodEnd(periodStart: string): string {
  return new Date(parseDate(periodStart, 'Quota period start').getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
}

function normalizedPeriodEnd(periodStart: string, periodEnd?: string | null): string | null {
  if (!periodEnd) return defaultPeriodEnd(periodStart)
  const start = parseDate(periodStart, 'Quota period start')
  const end = parseDate(periodEnd, 'Quota period end')
  if (end.getTime() <= start.getTime()) throw new Error('Quota period end must be after period start.')
  return end.toISOString()
}

function isPeriodActive(row: { period_start: string; period_end: string | null }, now: Date): boolean {
  const start = parseDate(row.period_start, 'Quota period start')
  const end = parseDate(row.period_end ?? defaultPeriodEnd(row.period_start), 'Quota period end')
  return now.getTime() >= start.getTime() && now.getTime() < end.getTime()
}

function utcWeekStart(now: Date): Date {
  const start = new Date(now)
  start.setUTCHours(0, 0, 0, 0)
  const daysFromMonday = (start.getUTCDay() + 6) % 7
  start.setUTCDate(start.getUTCDate() - daysFromMonday)
  return start
}

function isCurrentWeeklyBaseline(row: { period_start: string; period_end: string | null }, now: Date): boolean {
  const start = parseDate(row.period_start, 'Quota period start')
  const end = parseDate(row.period_end ?? defaultPeriodEnd(row.period_start), 'Quota period end')
  return start.getTime() === utcWeekStart(now).getTime()
    && end.getTime() === new Date(utcWeekStart(now).getTime() + 7 * 24 * 60 * 60 * 1000).getTime()
}

export interface CreditGrantProjection {
  grantQuantity: number | null
  baselineQuantity: number | null
  baselineGrantType: 'plan' | 'reset' | null
  baselineCreatedAt: string | null
  periodStart: string | null
  periodEnd: string | null
  /**
   * Usage starts at the weekly period for plan baselines, but at the reset
   * timestamp for exact resets. This keeps pre-reset consumption from eating
   * into a reset allowance while still letting a later plan baseline account
   * for all usage in the week.
   */
  consumptionStart: string | null
}

/**
 * Resolves the current append-only allowance. Plan/reset rows are baselines;
 * the newest active baseline wins. Manual rows are additive only when they
 * were issued after that baseline and are still inside their own period.
 */
export async function getCurrentCreditGrantProjection(
  db: DbClient,
  organizationId: string,
  now = new Date(),
): Promise<CreditGrantProjection> {
  const nowIso = now.toISOString()
  const rows = await queryAll<{
    id: string
    quantity: number
    period_start: string
    period_end: string | null
    grant_type: 'plan' | 'reset' | 'manual'
    created_at: string
  }>(db, `
    SELECT id, quantity, period_start, period_end, grant_type, created_at
    FROM usage_quota_grants
    WHERE organization_id = ?
      AND resource = 'ai_inference'
      AND unit = 'credit'
      AND applied_at IS NOT NULL
      AND period_start <= ?
    ORDER BY created_at DESC, id DESC
  `, [organizationId, nowIso])

  const normalizedRows = rows.map(row => ({
    ...row,
    quantity: parseLedgerQuantity(row.quantity, 'Quota grant quantity'),
  }))
  const active = normalizedRows.filter(row => isPeriodActive(row, now))
  const baseline = active.find((row): row is typeof row & { grant_type: 'plan' | 'reset' } =>
    (row.grant_type === 'plan' || row.grant_type === 'reset')
    && isCurrentWeeklyBaseline(row, now),
  )
  const manualQuantity = sumLedgerQuantities(
    active
      .filter(row => row.grant_type === 'manual' && (!baseline || row.created_at >= baseline.created_at))
      .map(row => row.quantity),
    'Manual quota grant total',
  )

  if (!baseline) {
    return {
      grantQuantity: manualQuantity > 0 ? manualQuantity : null,
      baselineQuantity: null,
      baselineGrantType: null,
      baselineCreatedAt: null,
      periodStart: null,
      periodEnd: null,
      consumptionStart: null,
    }
  }

  const baselineQuantity = parseLedgerQuantity(baseline.quantity, 'Quota baseline quantity')
  return {
    grantQuantity: sumLedgerQuantities([baselineQuantity, manualQuantity], 'Quota grant total'),
    baselineQuantity,
    baselineGrantType: baseline.grant_type,
    baselineCreatedAt: baseline.created_at,
    periodStart: baseline.period_start,
    periodEnd: baseline.period_end ?? defaultPeriodEnd(baseline.period_start),
    consumptionStart: baseline.grant_type === 'reset' ? baseline.created_at : baseline.period_start,
  }
}

function assertGrantUnit(input: Pick<QuotaGrantInput, 'resource' | 'unit'>): void {
  if (input.resource === 'ai_inference' && input.unit !== 'credit') {
    throw new Error('ai_inference quota grants require unit "credit"')
  }
}

/**
 * Records one durable, idempotent usage event. This table is the measurement
 * source of truth; pricing and quota enforcement are deliberately separate.
 */
export async function recordUsageEvent(db: DbClient, input: UsageEventInput): Promise<boolean> {
  assertQuantity(input.quantity)
  if (!input.organizationId || !input.source || !input.resource || !input.unit || !input.idempotencyKey) {
    throw new Error('Usage events require organization, resource, source, unit, and idempotency key.')
  }

  const result = await execute(db, `
    INSERT OR IGNORE INTO usage_events
      (id, organization_id, site_id, resource, source, provider, channel,
       session_id, quantity, unit, metadata_json, idempotency_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    crypto.randomUUID(),
    input.organizationId,
    input.siteId ?? null,
    input.resource,
    input.source,
    input.provider ?? null,
    input.channel ?? null,
    input.sessionId ?? null,
    input.quantity,
    input.unit,
    input.metadata ? JSON.stringify(input.metadata) : null,
    input.idempotencyKey,
    input.createdAt ?? new Date().toISOString(),
  ])

  return Number(result?.meta.changes ?? 0) > 0
}

/** Adds an auditable quota grant without overwriting earlier grants. */
export async function grantQuota(db: DbClient, input: QuotaGrantInput): Promise<boolean> {
  assertQuantity(input.quantity)
  assertGrantUnit(input)
  if (!input.periodKey || !input.periodStart || !input.reason || !input.idempotencyKey) {
    throw new Error('Quota grants require a period, start time, reason, and idempotency key.')
  }

  const periodEnd = normalizedPeriodEnd(input.periodStart, input.periodEnd)
  const createdAt = input.createdAt ?? new Date().toISOString()
  const result = await execute(db, `
    INSERT OR IGNORE INTO usage_quota_grants
      (id, organization_id, resource, quantity, unit, period_key, period_start,
       period_end, grant_type, reason, created_by, idempotency_key, applied_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
      crypto.randomUUID(),
      input.organizationId,
      input.resource,
      input.quantity,
      input.unit,
      input.periodKey,
      input.periodStart,
      periodEnd,
      input.grantType,
      input.reason,
      input.createdBy ?? null,
      input.idempotencyKey,
      createdAt,
      createdAt,
  ])
  return Number(result?.meta.changes ?? 0) > 0
}

/**
 * Issues a fresh, auditable grant for each requested resource. Reusing the
 * same reset ID is safe and does not create a second balance.
 */
export async function resetOrganizationQuota(
  db: DbClient,
  input: {
    organizationId: string
    resetId: string
    reason: string
    createdBy?: string | null
    grants: Array<Pick<QuotaGrantInput, 'resource' | 'quantity' | 'unit' | 'periodStart' | 'periodEnd'>>
  },
): Promise<void> {
  if (!input.grants.length) throw new Error('At least one quota grant is required for a reset.')
  const resources = new Set<string>()
  for (const grant of input.grants) {
    if (resources.has(grant.resource)) {
      throw new Error(`Quota reset contains duplicate resource: ${grant.resource}`)
    }
    resources.add(grant.resource)
    assertGrantUnit(grant)
    normalizedPeriodEnd(grant.periodStart, grant.periodEnd)
  }
  const createdAt = new Date().toISOString()
  const statements: Array<{ query: string; params: unknown[] }> = []
  for (const grant of input.grants) {
    assertQuantity(grant.quantity)
    const idempotencyKey = `reset:${input.resetId}:${grant.resource}`
    statements.push({
      query: `
        INSERT OR IGNORE INTO usage_quota_grants
          (id, organization_id, resource, quantity, unit, period_key, period_start,
          period_end, grant_type, reason, created_by, idempotency_key, applied_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reset', ?, ?, ?, ?, ?)
      `,
      params: [
        crypto.randomUUID(),
        input.organizationId,
        grant.resource,
        grant.quantity,
        grant.unit,
        `reset:${input.resetId}`,
        grant.periodStart,
        normalizedPeriodEnd(grant.periodStart, grant.periodEnd),
        input.reason,
        input.createdBy ?? null,
        idempotencyKey,
        createdAt,
        createdAt,
      ],
    })
  }

  await executeBatch(db, statements)
}

export interface UsageSummaryRow {
  resource: string
  source: string
  provider: string | null
  channel: string | null
  quantity: number
  unit: string
  events: number
}

interface UsageSummaryAggregateRow extends UsageSummaryRow {
  invalid_count: number
}

export async function getUsageSummary(
  db: DbClient,
  organizationId: string,
  since?: string,
): Promise<UsageSummaryRow[]> {
  const rows = await queryAll<UsageSummaryAggregateRow>(db, `
    SELECT resource, source, provider, channel,
           TOTAL(CASE
             WHEN typeof(quantity) = 'integer'
               AND quantity >= 0
               AND quantity <= ${MAX_SAFE_INTEGER_SQL}
             THEN quantity ELSE 0 END) AS quantity,
           SUM(CASE
             WHEN typeof(quantity) = 'integer'
               AND quantity >= 0
               AND quantity <= ${MAX_SAFE_INTEGER_SQL}
             THEN 0 ELSE 1 END) AS invalid_count,
           unit, COUNT(*) AS events
    FROM usage_events
    WHERE organization_id = ? ${since ? 'AND created_at >= ?' : ''}
    GROUP BY resource, source, provider, channel, unit
    ORDER BY quantity DESC, resource ASC
  `, since ? [organizationId, since] : [organizationId])
  return rows.map(({ invalid_count: invalidCountValue, ...row }) => {
    const invalidCount = parseLedgerQuantity(invalidCountValue, 'Usage summary invalid row count')
    if (invalidCount > 0) {
      throw new Error('Usage summary contains malformed ledger quantities.')
    }
    return {
      ...row,
      quantity: parseLedgerQuantity(row.quantity, 'Usage summary quantity'),
      events: parseLedgerQuantity(row.events, 'Usage summary event count'),
    }
  })
}
