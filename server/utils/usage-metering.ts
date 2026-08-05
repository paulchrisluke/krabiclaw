import { execute, executeBatch, queryAll, type DbClient } from '~/server/db'

export type UsageResource =
  | 'ai_inference'
  | 'mcp_operation'
  | 'scheduled_task'
  | 'maps_api'
  | 'messaging'
  | 'image_generation'
  | 'translation'

export interface UsageEventInput {
  organizationId: string
  siteId?: string | null
  resource: UsageResource | string
  source: string
  provider?: string | null
  channel?: string | null
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
  grantType: 'plan' | 'reset' | 'manual' | 'top_up'
  reason: string
  createdBy?: string | null
  idempotencyKey: string
}

function assertQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new Error('Usage quantity must be a non-negative safe integer.')
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
       quantity, unit, metadata_json, idempotency_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    crypto.randomUUID(),
    input.organizationId,
    input.siteId ?? null,
    input.resource,
    input.source,
    input.provider ?? null,
    input.channel ?? null,
    input.quantity,
    input.unit,
    input.metadata ? JSON.stringify(input.metadata) : null,
    input.idempotencyKey,
    input.createdAt ?? new Date().toISOString(),
  ])

  return Number(result?.meta.changes ?? 0) > 0
}

/**
 * Used by existing telemetry paths where accounting must not change the
 * provider response contract. Failures remain visible in logs and never turn
 * into a false successful accounting result.
 */
export function recordUsageEventDetached(db: DbClient, input: UsageEventInput): void {
  void recordUsageEvent(db, input).catch((error) => {
    console.error('usage_event_record_failed', {
      organizationId: input.organizationId,
      resource: input.resource,
      source: input.source,
      idempotencyKey: input.idempotencyKey,
      error: error instanceof Error ? error.message : String(error),
    })
  })
}

/** Adds an auditable quota grant without overwriting earlier grants. */
export async function grantQuota(db: DbClient, input: QuotaGrantInput): Promise<boolean> {
  assertQuantity(input.quantity)
  if (!input.periodKey || !input.periodStart || !input.reason || !input.idempotencyKey) {
    throw new Error('Quota grants require a period, start time, reason, and idempotency key.')
  }

  const result = await execute(db, `
    INSERT OR IGNORE INTO usage_quota_grants
      (id, organization_id, resource, quantity, unit, period_key, period_start,
       period_end, grant_type, reason, created_by, idempotency_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    crypto.randomUUID(),
    input.organizationId,
    input.resource,
    input.quantity,
    input.unit,
    input.periodKey,
    input.periodStart,
    input.periodEnd ?? null,
    input.grantType,
    input.reason,
    input.createdBy ?? null,
    input.idempotencyKey,
    new Date().toISOString(),
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
  const createdAt = new Date().toISOString()
  const statements = input.grants.map((grant) => {
    assertQuantity(grant.quantity)
    return {
      query: `
        INSERT OR IGNORE INTO usage_quota_grants
          (id, organization_id, resource, quantity, unit, period_key, period_start,
           period_end, grant_type, reason, created_by, idempotency_key, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reset', ?, ?, ?, ?)
      `,
      params: [
        crypto.randomUUID(),
        input.organizationId,
        grant.resource,
        grant.quantity,
        grant.unit,
        `reset:${input.resetId}`,
        grant.periodStart,
        grant.periodEnd ?? null,
        input.reason,
        input.createdBy ?? null,
        `reset:${input.resetId}:${grant.resource}`,
        createdAt,
      ],
    }
  })

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

export async function getUsageSummary(
  db: DbClient,
  organizationId: string,
  since?: string,
): Promise<UsageSummaryRow[]> {
  return await queryAll<UsageSummaryRow>(db, `
    SELECT resource, source, provider, channel,
           SUM(quantity) AS quantity, unit, COUNT(*) AS events
    FROM usage_events
    WHERE organization_id = ? ${since ? 'AND created_at >= ?' : ''}
    GROUP BY resource, source, provider, channel, unit
    ORDER BY quantity DESC, resource ASC
  `, since ? [organizationId, since] : [organizationId])
}
